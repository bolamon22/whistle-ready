import { prisma } from '@/lib/db'
import { notifyPaymentReceived } from '@/lib/paymentNotify'
import { markVendorPaid } from '@/lib/formSubmissions'
import { recordTeamPayment } from './paymentGuard'

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

// ---------------------------------------------------------------------------
// THE OTHER DIRECTION: rows in OUR books that Stripe does not back.
//
// findUnrecordedPayments() below answers "did we miss money Stripe took". It
// cannot see the opposite failure, and that is the one that actually happened:
// on Sep 18 2026 the webhook and the checkout-return path both checked "is this
// intent recorded yet", both got a clean answer, and both wrote. LaxManiax's
// Fall Classic then read $5,980 paid against a $4,485 invoice, and the club
// director opened a portal showing a $1,495 credit he had not earned. Nothing
// in the app could have told you that; it took opening Stripe by hand.
//
// So this compares every payment row we hold against what Stripe actually
// charged, and reports four things:
//   duplicate      -- two or more rows citing ONE payment intent. Real money
//                     counted twice. This is the Sep 18 failure.
//   notInStripe    -- a card row citing an intent Stripe has no succeeded
//                     record of. Either a typo'd note or a payment that was
//                     reversed after we wrote it.
//   amountMismatch -- we recorded a different figure than Stripe settled.
//   unverified     -- cited an intent older than the scan window, so this run
//                     simply did not look. Reported rather than passed over in
//                     silence, because "no problems found" has to mean it.
// Manual rows (check, cash, an offline card) carry no intent and are listed
// separately -- they are not errors, they are just not Stripe's to confirm.
export type AuditProblem = {
  kind: 'duplicate' | 'notInStripe' | 'amountMismatch' | 'unverified'
  club: string
  piId: string
  detail: string
  /** Dollars the books are overstated by because of this row. 0 when unknown. */
  overstatedBy: number
}

export type EventAudit = {
  tournamentId: string
  name: string
  invoiced: number       // net of discounts
  recorded: number       // what our payment rows add up to
  balance: number        // invoiced - recorded
  verifiedByStripe: number
  manual: number
  problems: AuditProblem[]
}

export type PaymentAuditResult = {
  ok: boolean
  error?: string
  since: string
  stripeScanned: number
  events: EventAudit[]
}

const PI_IN_NOTES = /pi_[A-Za-z0-9]+/

export async function auditPayments(tournamentIds: string[], days = 180): Promise<PaymentAuditResult> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().split('T')[0]
  const { intents, error } = await fetchIntents(days)
  if (error) return { ok: false, error, since, stripeScanned: 0, events: [] }

  // What Stripe says succeeded, keyed by intent.
  const stripeByPi = new Map<string, { amount: number; charged: number }>()
  for (const pi of intents) {
    if (pi?.status !== 'succeeded') continue
    stripeByPi.set(pi.id, amountsOf(pi))
  }

  const events: EventAudit[] = []
  for (const tournamentId of tournamentIds) {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } })
    const regs = await prisma.teamRegistration.findMany({
      where: { tournamentId, deletedAt: null },
      select: {
        clubName: true, invoiceAmount: true, discountAmount: true,
        payments: { select: { id: true, amount: true, method: true, receivedAt: true, notes: true } },
      },
    })

    const problems: AuditProblem[] = []
    let invoiced = 0, recorded = 0, verified = 0, manual = 0

    for (const reg of regs) {
      invoiced += (reg.invoiceAmount || 0) - (reg.discountAmount || 0)
      // Rows are grouped per registration, not globally: the same intent CANNOT
      // legitimately appear twice on one club, but two clubs never share one.
      const seen = new Map<string, number>()
      for (const p of reg.payments) {
        recorded += p.amount || 0
        const piId = PI_IN_NOTES.exec(p.notes || '')?.[0] || ''
        if (!piId) { manual += p.amount || 0; continue }

        const n = (seen.get(piId) || 0) + 1
        seen.set(piId, n)
        if (n > 1) {
          problems.push({
            kind: 'duplicate', club: reg.clubName, piId,
            detail: `row ${n} citing the same payment intent ($${(p.amount || 0).toFixed(2)} on ${p.receivedAt})`,
            overstatedBy: p.amount || 0,
          })
          continue                    // counted once under whichever row was first
        }

        const st = stripeByPi.get(piId)
        if (!st) {
          // Older than the window is "not looked at", not "not there".
          const outsideWindow = String(p.receivedAt || '') < since
          problems.push({
            kind: outsideWindow ? 'unverified' : 'notInStripe',
            club: reg.clubName, piId,
            detail: outsideWindow
              ? `paid ${p.receivedAt}, before this ${days}-day scan window`
              : `no succeeded payment for this intent in Stripe ($${(p.amount || 0).toFixed(2)} on ${p.receivedAt})`,
            overstatedBy: outsideWindow ? 0 : (p.amount || 0),
          })
          continue
        }
        verified += p.amount || 0
        if (Math.abs((p.amount || 0) - st.amount) > 0.005) {
          problems.push({
            kind: 'amountMismatch', club: reg.clubName, piId,
            detail: `we recorded $${(p.amount || 0).toFixed(2)}, Stripe settled $${st.amount.toFixed(2)} (charged $${st.charged.toFixed(2)})`,
            overstatedBy: Math.max(0, (p.amount || 0) - st.amount),
          })
        }
      }
    }

    events.push({
      tournamentId, name: t?.name || '', invoiced, recorded,
      balance: invoiced - recorded, verifiedByStripe: verified, manual, problems,
    })
  }

  return { ok: true, since, stripeScanned: intents.length, events }
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
    const wrote = await recordTeamPayment({
      registrationId: meta.registrationId,
      amount,
      method,
      // The day Stripe took the money, NOT today — otherwise a September
      // payment recovered in October lands in the wrong month.
      receivedAt: createdAt,
      notes: `Stripe · ${pi.id}${amount < charged ? ` · incl. $${(charged - amount).toFixed(2)} card fee (charged $${charged.toFixed(2)})` : ''} · via reconcile`,
      piId: pi.id,
    })
    if (!wrote) return { ok: false, error: 'Already recorded' }
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
