import { prisma } from '@/lib/db'
import { notifyPaymentReceived } from '@/lib/paymentNotify'
import { markVendorPaid } from '@/lib/formSubmissions'

// Catching money Stripe took that the app never heard about.
//
// WHY THIS EXISTS: Stripe disabled the whistleready.app webhook on 10 Sep 2026
// after nine straight days of failed deliveries, and nothing in the app noticed.
// Card payments made in the panel survive that — the browser PATCHes
// {stripeConfirm: pi_xxx} and the server re-verifies. Three things do NOT:
//   • ACH, which settles days later with no browser open
//   • individual player registrations, whose ONLY paid-marker is the webhook
//   • vendor booths paid by ACH
// So a dark webhook means players who paid sit at 'pending' forever and clubs
// look unpaid. This asks Stripe what it actually charged and compares.
//
// Read-only on its own. recordStripePayment() writes the same rows the webhook
// would, through the same idempotency check, so running both is harmless.

const STRIPE_VERSION = '2024-06-20'

export type PaymentGap = {
  piId: string
  createdAt: string           // YYYY-MM-DD, the day Stripe took it
  charged: number             // gross, dollars
  amount: number              // what we'd record (base, when a fee was added)
  method: 'ach' | 'credit_card'
  kind: 'team' | 'individual' | 'vendor'
  targetId: string            // registrationId / individual reg id / vendor token
  label: string               // club or player, for the staff list
  context: string             // tournament name where we can find it
}

export type ReconcileResult = {
  ok: boolean
  gaps: PaymentGap[]
  scanned: number
  since: string
  error?: string
}

function stripeHeaders(): Record<string, string> | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  const h: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': STRIPE_VERSION,
  }
  // Same context header the refund route sends — without it we read the
  // platform account instead of SEG's and find nothing.
  if (process.env.STRIPE_ACCOUNT_ID) h['Stripe-Context'] = process.env.STRIPE_ACCOUNT_ID
  return h
}

const ymd = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().split('T')[0]

/** Base vs charged, matching the webhook exactly so amounts never disagree. */
function amountsOf(pi: any): { charged: number; amount: number } {
  const charged = (pi.amount_received ?? pi.amount ?? 0) / 100
  const base = parseFloat(pi?.metadata?.baseAmount || '')
  return { charged, amount: base > 0 && base <= charged ? base : charged }
}

/** Our ACH intents carry ONLY us_bank_account; card intents may list it among
 *  the account defaults, so an includes() check mislabels cards (bug, Aug 27). */
const isAch = (pi: any) => (pi.payment_method_types || []).join(',') === 'us_bank_account'

/** Succeeded intents from the last `days`, newest first. */
async function fetchIntents(days: number): Promise<{ intents: any[]; error?: string }> {
  const headers = stripeHeaders()
  if (!headers) return { intents: [], error: 'Stripe is not configured on this deployment' }
  const since = Math.floor(Date.now() / 1000) - days * 86400
  const out: any[] = []
  let startingAfter = ''
  // Up to 5 pages — 500 intents covers far more than any window we scan.
  for (let page = 0; page < 5; page++) {
    const url = new URL('https://api.stripe.com/v1/payment_intents')
    url.searchParams.set('limit', '100')
    url.searchParams.set('created[gte]', String(since))
    if (startingAfter) url.searchParams.set('starting_after', startingAfter)
    const res = await fetch(url.toString(), { headers })
    const body = await res.json()
    if (!res.ok) return { intents: out, error: body?.error?.message || 'Stripe lookup failed' }
    const data: any[] = Array.isArray(body?.data) ? body.data : []
    out.push(...data)
    if (!body?.has_more || !data.length) break
    startingAfter = data[data.length - 1].id
  }
  return { intents: out }
}

/** Has this intent already been written against the team registration? */
async function teamAlreadyRecorded(registrationId: string, piId: string): Promise<boolean> {
  const existing = await prisma.registrationPayment.findFirst({
    where: { registrationId, notes: { contains: piId } },
  })
  return !!existing
}

async function vendorAlreadyPaid(token: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "paymentStatus" FROM "OrgFormSubmission" WHERE "passToken" = ? LIMIT 1`, token)
    return String(rows?.[0]?.paymentStatus || '') === 'paid'
  } catch {
    // No submissions table on this deployment — treat as nothing to reconcile
    // rather than reporting a false gap.
    return true
  }
}

/** Everything Stripe charged in the window that the app has no record of. */
export async function findUnrecordedPayments(days = 30): Promise<ReconcileResult> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0]
  const { intents, error } = await fetchIntents(days)
  if (error) return { ok: false, gaps: [], scanned: intents.length, since, error }

  const gaps: PaymentGap[] = []
  for (const pi of intents) {
    if (pi?.status !== 'succeeded') continue
    const meta = pi.metadata || {}
    const { charged, amount } = amountsOf(pi)
    const method: 'ach' | 'credit_card' = isAch(pi) ? 'ach' : 'credit_card'
    const base = { piId: pi.id, createdAt: ymd(pi.created), charged, amount, method }

    if (meta.type === 'team_registration' && meta.registrationId) {
      if (await teamAlreadyRecorded(meta.registrationId, pi.id)) continue
      const reg = await prisma.teamRegistration.findUnique({
        where: { id: meta.registrationId },
        select: { clubName: true, deletedAt: true, tournamentId: true },
      })
      if (!reg || reg.deletedAt) continue          // deleted registration, not a gap
      const t = await prisma.tournament.findUnique({
        where: { id: reg.tournamentId }, select: { name: true },
      })
      gaps.push({ ...base, kind: 'team', targetId: meta.registrationId, label: reg.clubName, context: t?.name || '' })
      continue
    }

    if (meta.type === 'individual_registration') {
      const row = await prisma.individualRegistration.findFirst({
        where: { stripeSessionId: pi.id },
        select: { id: true, firstName: true, lastName: true, paymentStatus: true, tournamentId: true },
      })
      if (!row || row.paymentStatus === 'paid') continue
      const t = await prisma.tournament.findUnique({
        where: { id: row.tournamentId }, select: { name: true },
      })
      gaps.push({
        ...base, kind: 'individual', targetId: row.id,
        label: `${row.firstName} ${row.lastName}`.trim(), context: t?.name || '',
      })
      continue
    }

    if (meta.type === 'vendor_booth' && meta.vendorToken) {
      if (await vendorAlreadyPaid(meta.vendorToken)) continue
      gaps.push({ ...base, kind: 'vendor', targetId: meta.vendorToken, label: 'Vendor booth', context: '' })
    }
  }

  gaps.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return { ok: true, gaps, scanned: intents.length, since }
}

/**
 * Write the row the webhook would have written, for one intent.
 * Re-reads the intent from Stripe rather than trusting anything passed in, and
 * re-checks for an existing record, so a double click or an overlapping webhook
 * delivery cannot produce two payment rows.
 */
export async function recordStripePayment(piId: string): Promise<{ ok: boolean; error?: string; recorded?: PaymentGap }> {
  if (!/^pi_[A-Za-z0-9]+$/.test(String(piId || ''))) return { ok: false, error: 'Not a payment intent id' }
  const headers = stripeHeaders()
  if (!headers) return { ok: false, error: 'Stripe is not configured on this deployment' }

  const res = await fetch(`https://api.stripe.com/v1/payment_intents/${piId}`, { headers })
  const pi = await res.json()
  if (!res.ok) return { ok: false, error: pi?.error?.message || 'Stripe lookup failed' }
  if (pi.status !== 'succeeded') return { ok: false, error: `Stripe says this payment is "${pi.status}", not succeeded` }

  const meta = pi.metadata || {}
  const { charged, amount } = amountsOf(pi)
  const ach = isAch(pi)
  const method: 'ach' | 'credit_card' = ach ? 'ach' : 'credit_card'
  const createdAt = ymd(pi.created)

  if (meta.type === 'team_registration' && meta.registrationId) {
    if (await teamAlreadyRecorded(meta.registrationId, pi.id)) {
      return { ok: false, error: 'Already recorded' }
    }
    const reg = await prisma.teamRegistration.findUnique({
      where: { id: meta.registrationId }, select: { clubName: true, deletedAt: true },
    })
    if (!reg || reg.deletedAt) return { ok: false, error: 'That registration no longer exists' }
    await prisma.registrationPayment.create({
      data: {
        registrationId: meta.registrationId,
        amount,
        method,
        checkNumber: '',
        // The day Stripe took the money, NOT today — otherwise a September
        // payment recovered in October lands in the wrong month.
        receivedAt: createdAt,
        notes: `Stripe · ${pi.id}${amount < charged ? ` · incl. $${(charged - amount).toFixed(2)} card fee (charged $${charged.toFixed(2)})` : ''} · via reconcile`,
      },
    })
    await notifyPaymentReceived({ registrationId: meta.registrationId, amount, method, charged, via: 'Stripe reconcile' })
    return { ok: true, recorded: { piId: pi.id, createdAt, charged, amount, method, kind: 'team', targetId: meta.registrationId, label: reg.clubName, context: '' } }
  }

  if (meta.type === 'individual_registration') {
    const row = await prisma.individualRegistration.findFirst({
      where: { stripeSessionId: pi.id },
      select: { id: true, firstName: true, lastName: true, paymentStatus: true },
    })
    if (!row) return { ok: false, error: 'No player registration points at this payment' }
    if (row.paymentStatus === 'paid') return { ok: false, error: 'Already recorded' }
    await prisma.individualRegistration.updateMany({
      where: { id: row.id },
      data: { paymentStatus: 'paid', stripePaymentIntent: pi.id },
    })
    return { ok: true, recorded: { piId: pi.id, createdAt, charged, amount, method, kind: 'individual', targetId: row.id, label: `${row.firstName} ${row.lastName}`.trim(), context: '' } }
  }

  if (meta.type === 'vendor_booth' && meta.vendorToken) {
    if (await vendorAlreadyPaid(meta.vendorToken)) return { ok: false, error: 'Already recorded' }
    const ok = await markVendorPaid(meta.vendorToken, pi.id)
    if (!ok) return { ok: false, error: 'Could not find that vendor booth' }
    return { ok: true, recorded: { piId: pi.id, createdAt, charged, amount, method, kind: 'vendor', targetId: meta.vendorToken, label: 'Vendor booth', context: '' } }
  }

  return { ok: false, error: 'This payment is not one the app tracks' }
}
