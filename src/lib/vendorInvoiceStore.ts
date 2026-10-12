// A VENDOR'S INVOICE: the rows behind it, and the payments the office records.
//
// lib/vendorInvoice decides what the invoice says. This reads the rows once, so
// the booth page's download, the office's Email invoice and the QuickBooks sync
// (lib/qboSync) all hand out the same document. It also keeps the payments the
// office records against a vendor by hand (a check, Zelle, cash), which live on
// the vendor's own row as JSON, next to the booth page's paid flag.
// Server only (database).
import { prisma } from '@/lib/db'
import { getSubmission, ensureVendorInvoiceColumns, type FormSubmission } from '@/lib/formSubmissions'
import { loadVendorApproval, type VendorApproval } from '@/lib/vendorApproval'
import { orgBaseUrl } from '@/lib/orgDomains'
import { logoFor } from '@/lib/invoice'
import type { InvoiceDoc } from '@/lib/invoicePdf'
import { vendorInvoiceDoc } from '@/lib/vendorInvoice'
import { vendorMoney, parseVendorPayments, VENDOR_PAY_METHODS, type VendorPayment } from '@/lib/vendorMoney'

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))

export type LoadedVendorInvoice = {
  doc: InvoiceDoc
  approval: VendorApproval
  tournament: { id: string; name: string; startDate: string; endDate: string; logoUrl: string }
}

/** The invoice for one approved vendor, by their booth page's token. null when there
 *  is nothing to invoice: not approved, or no fee. */
export async function loadVendorInvoice(token: string, now = new Date()): Promise<LoadedVendorInvoice | null> {
  const a = await loadVendorApproval(token)
  if (!a || !a.approved || !(a.amount > 0)) return null
  const t = a.tournamentId ? await prisma.tournament.findUnique({
    where: { id: a.tournamentId },
    select: { name: true, startDate: true, endDate: true, location: true, logoUrl: true },
  }).catch(() => null) : null

  // Where a check goes: the same columns the club invoice reads, and never more. The
  // Organization row also holds the org's own bank account, which has no business
  // on a document that gets forwarded.
  let payTo = { zelleHandle: '', checkPayableTo: '', checkAddress: '' }
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "zelleHandle", "checkPayableTo", "checkAddress" FROM "Organization" WHERE id = ?`, a.orgId)
    const r = rows?.[0]
    if (r) payTo = { zelleHandle: s(r.zelleHandle), checkPayableTo: s(r.checkPayableTo), checkAddress: s(r.checkAddress) }
  } catch { /* columns not there yet: the invoice points to the booth page only */ }

  const sub = a.submission
  const base = orgBaseUrl(a.org?.slug)
  const tournament = {
    id: a.tournamentId,
    name: s(t?.name) || a.tournamentName || 'Event',
    startDate: s(t?.startDate), endDate: s(t?.endDate), logoUrl: s(t?.logoUrl),
  }
  const doc = vendorInvoiceDoc({
    sub: {
      id: sub.id, data: sub.data, amountDue: a.amount, statusAt: sub.statusAt, submittedAt: sub.submittedAt,
      paymentStatus: sub.paymentStatus, paidAt: sub.paidAt, stripeRef: sub.stripeRef,
    },
    payments: a.payments,
    tournament: { name: tournament.name, startDate: tournament.startDate, endDate: tournament.endDate, location: s(t?.location) },
    org: { ...(a.org || {}), ...payTo },
    payUrl: `${base}/vendor/${token}`,
    now,
    logo: await logoFor(tournament.logoUrl, base),
    number: sub.qboDocNumber || null,
    issuedOn: sub.qboDocNumber ? (sub.qboTxnDate || null) : null,
  })
  return { doc, approval: a, tournament }
}

/** The approval behind a vendor row, found by its id within the org. */
export async function vendorApprovalById(orgId: string, subId: string): Promise<VendorApproval | null> {
  const sub = await getSubmission(orgId, subId)
  if (!sub || sub.formType !== 'vendor' || !sub.passToken) return null
  return loadVendorApproval(sub.passToken)
}

type Fail = { ok: false; status: number; error: string }

/** Change a vendor's payments list. Written only if nobody else changed it since it
 *  was read (two people recording at once), and tried again if they did. */
async function changePayments(orgId: string, subId: string, change: (list: VendorPayment[]) => VendorPayment[] | Fail): Promise<{ ok: true; list: VendorPayment[] } | Fail> {
  await ensureVendorInvoiceColumns()
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "vendorPayments" FROM "OrgFormSubmission" WHERE "orgId" = ? AND "id" = ? LIMIT 1`, orgId, subId)
    if (!rows?.[0]) return { ok: false, status: 404, error: 'Vendor not found' }
    const raw = s(rows[0].vendorPayments)
    const next = change(parseVendorPayments(raw))
    if (!Array.isArray(next)) return next
    const n = await prisma.$executeRawUnsafe(
      `UPDATE "OrgFormSubmission" SET "vendorPayments" = ?, "updatedAt" = ? WHERE "orgId" = ? AND "id" = ? AND "vendorPayments" = ?`,
      JSON.stringify(next), new Date().toISOString(), orgId, subId, raw)
    if (Number(n) === 1) return { ok: true, list: next }
  }
  return { ok: false, status: 409, error: 'This vendor was changed by someone else at the same moment. Try again.' }
}

/**
 * Paid in full by hand marks the booth paid, the way the booth page's payment does,
 * so every list that reads the flag agrees. Taking a payment off un-marks it again,
 * but never a booth the booth page took payment for.
 */
async function settlePaidFlag(orgId: string, subId: string, a: VendorApproval, list: VendorPayment[]): Promise<void> {
  const sub = a.submission
  const money = vendorMoney({ amountDue: a.amount, paymentStatus: sub.paymentStatus, stripeRef: sub.stripeRef }, list)
  const now = new Date().toISOString()
  if (money.balance <= 0 && sub.paymentStatus !== 'paid') {
    const last = list.map(p => p.receivedAt).filter(Boolean).sort().pop()
    await prisma.$executeRawUnsafe(
      `UPDATE "OrgFormSubmission" SET "paymentStatus" = 'paid', "paidAt" = ?, "updatedAt" = ? WHERE "orgId" = ? AND "id" = ?`,
      last ? `${last}T12:00:00.000Z` : now, now, orgId, subId)
  } else if (money.balance > 0 && sub.paymentStatus === 'paid' && !s(sub.stripeRef).trim()) {
    await prisma.$executeRawUnsafe(
      `UPDATE "OrgFormSubmission" SET "paymentStatus" = '', "paidAt" = NULL, "updatedAt" = ? WHERE "orgId" = ? AND "id" = ?`,
      now, orgId, subId)
  }
}

/** Today on the office's (Eastern) calendar. */
function todayET(): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const g = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

const money$ = (n: number) => `$${round2(n).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

export type PaymentInput = { amount?: unknown; method?: unknown; checkNumber?: unknown; receivedAt?: unknown; note?: unknown }

/** The office records a payment from an approved vendor: a check, Zelle, cash. Never
 *  more than what's left to pay. */
export async function recordVendorPayment(orgId: string, subId: string, input: PaymentInput, by?: string):
  Promise<{ ok: true; submission: FormSubmission; payment: VendorPayment } | Fail> {
  const a = await vendorApprovalById(orgId, subId)
  if (!a) return { ok: false, status: 404, error: 'Vendor not found' }
  if (!a.approved) return { ok: false, status: 409, error: 'Approve this vendor before recording a payment.' }
  if (!(a.amount > 0)) return { ok: false, status: 409, error: 'There is no booth fee on this approval.' }
  const amount = round2(Number(input.amount))
  if (!(amount > 0)) return { ok: false, status: 400, error: 'Enter the amount received.' }
  const method = String(input.method || '')
  if (!VENDOR_PAY_METHODS.some(m => m.id === method)) return { ok: false, status: 400, error: 'Pick how they paid.' }
  const receivedAt = /^\d{4}-\d{2}-\d{2}$/.test(String(input.receivedAt || '')) ? String(input.receivedAt) : todayET()
  const payment: VendorPayment = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    amount, method, receivedAt,
    ...(method === 'check' && String(input.checkNumber || '').trim() ? { checkNumber: String(input.checkNumber).trim().slice(0, 30) } : {}),
    ...(String(input.note || '').trim() ? { note: String(input.note).trim().slice(0, 300) } : {}),
    ...(by ? { by } : {}),
    at: new Date().toISOString(),
  }
  const sub = a.submission
  const changed = await changePayments(orgId, subId, list => {
    const left = vendorMoney({ amountDue: a.amount, paymentStatus: sub.paymentStatus, stripeRef: sub.stripeRef }, list).balance
    if (left <= 0) return { ok: false, status: 409, error: 'Nothing is left to pay on this booth.' }
    if (amount > left + 0.005) return { ok: false, status: 400, error: `That's more than the ${money$(left)} left to pay.` }
    return [...list, payment]
  })
  if (!changed.ok) return changed
  await settlePaidFlag(orgId, subId, a, changed.list)
  const updated = await getSubmission(orgId, subId)
  return updated ? { ok: true, submission: updated, payment } : { ok: false, status: 404, error: 'Vendor not found' }
}

/** Take a payment recorded by hand off again (entered by mistake). */
export async function removeVendorPayment(orgId: string, subId: string, paymentId: string):
  Promise<{ ok: true; submission: FormSubmission; removed: VendorPayment } | Fail> {
  const a = await vendorApprovalById(orgId, subId)
  if (!a) return { ok: false, status: 404, error: 'Vendor not found' }
  // The booth page charged what was left after this payment; taking it off would
  // count that online payment as more than Stripe took.
  if (a.submission.paymentStatus === 'paid' && s(a.submission.stripeRef).trim()) {
    return { ok: false, status: 409, error: 'The rest of this booth fee was paid online, so this payment can’t come off here.' }
  }
  const removed = a.payments.find(p => p.id === paymentId)
  if (!removed) return { ok: false, status: 404, error: 'Payment not found' }
  const changed = await changePayments(orgId, subId, list => {
    if (!list.some(p => p.id === paymentId)) return { ok: false, status: 404, error: 'Payment not found' }
    return list.filter(p => p.id !== paymentId)
  })
  if (!changed.ok) return changed
  await settlePaidFlag(orgId, subId, a, changed.list)
  const updated = await getSubmission(orgId, subId)
  return updated ? { ok: true, submission: updated, removed } : { ok: false, status: 404, error: 'Vendor not found' }
}

/** QuickBooks' payment id on one payment recorded by hand (lib/qboSync). */
export async function setVendorPaymentQboId(orgId: string, subId: string, paymentId: string, qboPaymentId: string): Promise<void> {
  const r = await changePayments(orgId, subId, list => list.map(p => (p.id === paymentId ? { ...p, qboPaymentId } : p)))
  if (!r.ok) throw new Error(r.error)
}

/** "Invoice emailed Oct 12" on the vendor's row. */
export async function markVendorInvoiceSent(orgId: string, subId: string, at: string): Promise<void> {
  await ensureVendorInvoiceColumns()
  await prisma.$executeRawUnsafe(`UPDATE "OrgFormSubmission" SET "invoiceSentAt" = ? WHERE "orgId" = ? AND "id" = ?`, at, orgId, subId)
}
