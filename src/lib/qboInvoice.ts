// WHAT WHISTLE READY SENDS QUICKBOOKS for one registration.
//
// Pure (no database, no network) so it can be tested on its own; lib/qboSync
// does the reading and the calls. The invoice says what the PDF says
// (lib/invoicePdf's invoiceDocFor): one line per team at its price, a team on
// the waiting list at $0, or one line with the total when the office set the
// amount by hand; the discount as QuickBooks' own discount line.
import type { InvoiceDoc } from '@/lib/invoicePdf'

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
// QuickBooks reads a colon in a name as "parent:child", and refuses tabs and
// line breaks in names.
const cleanName = (s: string, max: number) => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/:/g, ' -').replace(/\s+/g, ' ').trim().slice(0, max)

/** "Monster Mash Lax Clash 2026": the event's name with its year, unless the name has one. */
export function eventLabel(t: { name: string; startDate?: string | null }): string {
  const name = String(t.name || '').trim()
  const year = /^(\d{4})/.exec(t.startDate || '')?.[1] || ''
  return cleanName(year && !name.includes(year) ? `${name} ${year}` : name, 100)
}

/** The QuickBooks item an event's team fees go under. */
export const eventItemName = eventLabel

/** YYYY-MM-DD plus days, on the calendar (no time zones). */
export function addDays(ymd: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '')
  if (!m) return ymd
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days))
  return d.toISOString().slice(0, 10)
}

/** Payment is due before the event: the day before it starts, or on the invoice
 *  date itself when that is already too late. */
export function dueDateFor(eventStart: string | null | undefined, txnDate: string): string {
  const start = /^\d{4}-\d{2}-\d{2}/.exec(eventStart || '')?.[0] || ''
  if (!start) return txnDate
  const before = addDays(start, -1)
  return before > txnDate ? before : txnDate
}

export type QboLine = { description: string; amount: number }

/** The invoice's lines, from the same document the PDF is drawn from. */
export function invoiceLines(doc: InvoiceDoc, label: string): QboLine[] {
  const teams = doc.lines
  if (doc.itemized) {
    return teams.map(l => ({
      description: `${label} - ${l.description.replace(/^Team registration: /, '')}${l.detail ? `, ${l.detail}` : ''}${l.note ? ` (${l.note.toLowerCase()})` : ''}`,
      amount: round2(l.amount || 0),
    }))
  }
  // Not itemized (an amount set by hand): one line carries the total and names the teams.
  const names = teams.map(l => `${l.description.replace(/^Team registration: /, '')}${l.detail ? ` (${l.detail})` : ''}`).join('; ')
  return [{
    description: `${label} - team registration${teams.length ? ` (${teams.length} team${teams.length === 1 ? '' : 's'}): ${names}` : ''}`,
    amount: round2(doc.invoiced),
  }]
}

/** The "message on invoice": how to pay, matching the PDF. */
export function invoiceMemo(doc: InvoiceDoc, docNumber: string): string {
  const parts = [
    doc.event.dates ? `${doc.event.name}, ${doc.event.dates}${doc.event.location ? `, ${doc.event.location}` : ''}.` : `${doc.event.name}.`,
    'Payment is due before the event.',
    doc.payUrl ? `Pay online (bank transfer, no fee, or card): ${doc.payUrl}` : '',
    doc.payTo.checkAddress ? `Or mail a check payable to ${doc.payTo.checkPayableTo} to ${doc.payTo.checkAddress}, with invoice ${docNumber} on the memo line.` : '',
  ]
  return parts.filter(Boolean).join(' ').slice(0, 1000)
}

export type InvoiceBodyIn = {
  customerId: string
  itemId: string
  lines: QboLine[]
  discount: number
  discountNote?: string
  dueDate: string
  memo: string
  privateNote: string
  billEmail?: string
  /** Only when creating: the number and the invoice date never change after. */
  docNumber?: string
  txnDate?: string
}

export function qboInvoiceBody(i: InvoiceBodyIn): Record<string, unknown> {
  const email = String(i.billEmail || '').trim()
  return {
    CustomerRef: { value: i.customerId },
    ...(i.docNumber ? { DocNumber: i.docNumber } : {}),
    ...(i.txnDate ? { TxnDate: i.txnDate } : {}),
    DueDate: i.dueDate,
    Line: [
      ...i.lines.map(l => ({
        DetailType: 'SalesItemLineDetail',
        Amount: round2(l.amount),
        Description: l.description.slice(0, 4000),
        SalesItemLineDetail: { ItemRef: { value: i.itemId }, Qty: 1, UnitPrice: round2(l.amount) },
      })),
      ...(i.discount > 0 ? [{
        DetailType: 'DiscountLineDetail',
        Amount: round2(i.discount),
        ...(i.discountNote ? { Description: `Discount: ${i.discountNote}`.slice(0, 4000) } : {}),
        DiscountLineDetail: { PercentBased: false },
      }] : []),
    ],
    CustomerMemo: { value: i.memo },
    PrivateNote: i.privateNote.slice(0, 4000),
    ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { BillEmail: { Address: email } } : {}),
    // Clubs pay through Whistle Ready's pay page (Stripe), which records the
    // payment in both places. QuickBooks' own "pay online" would be a third
    // way to pay that Whistle Ready never hears about.
    AllowOnlineCreditCardPayment: false,
    AllowOnlineACHPayment: false,
  }
}

/** What decides whether QuickBooks needs an update. Order matters only in the
 *  sense that the same input always gives the same string. */
export function syncFingerprint(i: InvoiceBodyIn): string {
  return JSON.stringify([i.customerId, i.itemId, i.lines.map(l => [l.description, round2(l.amount)]), round2(i.discount), i.discountNote || '', i.dueDate, i.memo, String(i.billEmail || '').trim().toLowerCase()])
}

export type PaymentBodyIn = {
  customerId: string
  invoiceId: string
  amount: number
  /** How much of it goes against the invoice; the rest stays as the club's credit. */
  applied: number
  date: string
  refNum?: string
  note: string
  methodId?: string
}

export function qboPaymentBody(p: PaymentBodyIn): Record<string, unknown> {
  return {
    CustomerRef: { value: p.customerId },
    TotalAmt: round2(p.amount),
    TxnDate: p.date,
    ...(p.refNum ? { PaymentRefNum: String(p.refNum).slice(0, 21) } : {}),
    PrivateNote: p.note.slice(0, 4000),
    ...(p.methodId ? { PaymentMethodRef: { value: p.methodId } } : {}),
    Line: round2(p.applied) > 0 ? [{ Amount: round2(p.applied), LinkedTxn: [{ TxnId: p.invoiceId, TxnType: 'Invoice' }] }] : [],
  }
}

/** A new QuickBooks customer for a club: the club's name, with the contact as the person. */
export function qboCustomerBody(c: { clubName: string; contact?: string | null; email?: string | null; phone?: string | null; place?: string | null }, displayName?: string): Record<string, unknown> {
  const [first, ...rest] = String(c.contact || '').trim().split(/\s+/).filter(Boolean)
  const email = String(c.email || '').trim()
  const phone = String(c.phone || '').trim()
  const [city, ...state] = String(c.place || '').split(',').map(s => s.trim()).filter(Boolean)
  return {
    DisplayName: cleanName(displayName || c.clubName, 500),
    CompanyName: cleanName(c.clubName, 100),
    ...(first ? { GivenName: first.slice(0, 100) } : {}),
    ...(rest.length ? { FamilyName: rest.join(' ').slice(0, 100) } : {}),
    ...(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { PrimaryEmailAddr: { Address: email } } : {}),
    ...(phone ? { PrimaryPhone: { FreeFormNumber: phone.slice(0, 30) } } : {}),
    ...(city ? { BillAddr: { City: city.slice(0, 255), ...(state.length ? { CountrySubDivisionCode: state.join(', ').slice(0, 255) } : {}) } } : {}),
  }
}

// Whistle Ready's payment methods, and the names QuickBooks companies use for them.
const METHOD_NAMES: Record<string, string[]> = {
  check: ['check', 'cheque'],
  cash: ['cash'],
  credit_card: ['credit card', 'card', 'visa', 'mastercard'],
  ach: ['ach', 'bank transfer', 'eft', 'direct deposit', 'e-check', 'echeck'],
  zelle: ['zelle'],
  paypal: ['paypal'],
  venmo: ['venmo'],
}

/** The QuickBooks payment method id for a Whistle Ready method, if the company has one by that name. */
export function matchPaymentMethod(method: string, qbMethods: { Id: string; Name: string }[]): string {
  const want = METHOD_NAMES[String(method || '').toLowerCase()] || [String(method || '').toLowerCase()]
  for (const w of want) {
    const hit = qbMethods.find(m => String(m.Name || '').trim().toLowerCase() === w)
    if (hit) return String(hit.Id)
  }
  return ''
}

/** The highest plain-number DocNumber among QuickBooks sales forms. */
export function highestDocNumber(rows: { DocNumber?: string | null }[]): number {
  let max = 0
  for (const r of rows) {
    const s = String(r.DocNumber || '').trim()
    if (/^\d{1,9}$/.test(s)) max = Math.max(max, Number(s))
  }
  return max
}
