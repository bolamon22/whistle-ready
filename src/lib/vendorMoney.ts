// A VENDOR'S MONEY: what they owe, what has come in, what's left.
//
// Pure, with no imports, so the staff pages, the booth page, the payments the
// office records (lib/vendorInvoiceStore) and lib/formSubmissions can all use it
// without pulling in the PDF code (lib/vendorInvoice draws on this).

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export type VendorPayment = {
  id: string
  amount: number
  /** check | zelle | cash | ach | credit_card | other */
  method: string
  checkNumber?: string
  /** YYYY-MM-DD: the day it came in. */
  receivedAt: string
  note?: string
  /** Who recorded it, and when. */
  by?: string
  at?: string
  /** The QuickBooks payment it was sent as (lib/qboSync). */
  qboPaymentId?: string
}

export const VENDOR_PAY_METHODS = [
  { id: 'check', label: 'Check' },
  { id: 'zelle', label: 'Zelle' },
  { id: 'cash', label: 'Cash' },
  { id: 'ach', label: 'Bank transfer' },
  { id: 'credit_card', label: 'Card' },
  { id: 'other', label: 'Other' },
] as const

export function payMethodLabel(m: string): string {
  return VENDOR_PAY_METHODS.find(x => x.id === m)?.label || (m ? m[0].toUpperCase() + m.slice(1) : 'Payment')
}

/** The payments column as stored (JSON). A row that can't be read is dropped rather
 *  than failing the invoice. */
export function parseVendorPayments(raw: unknown): VendorPayment[] {
  let list: unknown = raw
  if (typeof raw === 'string') { try { list = raw.trim() ? JSON.parse(raw) : [] } catch { list = [] } }
  if (!Array.isArray(list)) return []
  return list.map((p: any) => ({
    id: String(p?.id || ''),
    amount: round2(Number(p?.amount) || 0),
    method: String(p?.method || 'check'),
    checkNumber: String(p?.checkNumber || '').trim() || undefined,
    receivedAt: /^\d{4}-\d{2}-\d{2}$/.test(String(p?.receivedAt || '')) ? String(p.receivedAt) : '',
    note: String(p?.note || '').trim() || undefined,
    by: String(p?.by || '') || undefined,
    at: String(p?.at || '') || undefined,
    qboPaymentId: String(p?.qboPaymentId || '') || undefined,
  })).filter(p => p.id && p.amount > 0)
}

export type VendorMoney = {
  /** The fee as approved. */
  due: number
  /** Recorded by the office: checks, Zelle, cash. */
  byHand: number
  /** Paid on the booth page (Stripe). */
  online: number
  paid: number
  balance: number
}

/**
 * Where a vendor's money stands. The booth page's payment has no amount of its
 * own on the row, only the paid flag and Stripe's reference; checkout charges
 * what was left after the payments recorded by hand, so that is what it paid.
 * Paid in full by hand sets the same flag with no Stripe reference.
 */
export function vendorMoney(v: { amountDue: number; paymentStatus?: string | null; stripeRef?: string | null }, payments: VendorPayment[]): VendorMoney {
  const due = round2(Math.max(0, Number(v.amountDue) || 0))
  const byHand = round2(payments.reduce((s, p) => s + Math.max(0, Number(p.amount) || 0), 0))
  const online = v.paymentStatus === 'paid' && String(v.stripeRef || '').trim() ? round2(Math.max(0, due - byHand)) : 0
  const paid = round2(byHand + online)
  return { due, byHand, online, paid, balance: round2(Math.max(0, due - paid)) }
}
