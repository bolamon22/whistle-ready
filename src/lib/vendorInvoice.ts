// A VENDOR'S INVOICE, worked out from plain rows.
//
// Bo, Oct 12 2026: "I need to create invoices to send to vendors in the vendor
// area." Approved vendors only, billed the booth fee as approved: the booth type,
// with the web sponsorship on a line of its own when they added it. Payments the
// office records by hand (a check, Zelle, cash) and the booth page's online
// payment come off the balance.
//
// Pure (no database), like lib/invoicePdf, so the booth page's download, the
// office's Email invoice and the QuickBooks sync (lib/qboSync) all hand out the
// same document. lib/vendorInvoiceStore reads the rows.
import { invoiceDate, eventDates, invoicePhone, type InvoiceDoc, type InvoiceLine } from '@/lib/invoicePdf'
import { vendorMoney, payMethodLabel, type VendorPayment } from '@/lib/vendorMoney'

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/**
 * "Vendor booth: Food truck" at its price, with the web sponsorship on a line of
 * its own when they added it and the approved amount is what they were quoted.
 * Any other amount (the office typed one at approval) is one line for the fee.
 * What they sell goes in the second column.
 */
export function vendorLines(data: any, amount: number): InvoiceLine[] {
  const d = data || {}
  const full = String(d.vendorTypeName || d.level || '').trim()
  const [base, ...rest] = full.split(' + ')
  const addOnFee = d.webSponsor === true || d.webSponsor === 'true' ? round2(Number(d.webSponsorFee) || 0) : 0
  const quoted = round2(Number(d.boothFee) || 0)
  const total = round2(amount)
  const products = String(d.products || '').replace(/\s+/g, ' ').trim()
  const detail = products.length > 90 ? `${products.slice(0, 88).trim()}…` : products
  if (addOnFee > 0 && rest.length && Math.abs(total - quoted) < 0.005 && total > addOnFee) {
    const addOn = rest.join(' + ').trim()
    return [
      { description: `Vendor booth: ${base.trim() || 'Booth'}`, detail, amount: round2(total - addOnFee) },
      { description: addOn ? addOn[0].toUpperCase() + addOn.slice(1) : 'Web sponsorship', detail: '', amount: addOnFee },
    ]
  }
  return [{ description: `Vendor booth: ${full || 'Booth'}`, detail, amount: total }]
}

/** YYYY-MM-DD of an instant on the office's (Eastern) calendar. */
function ymdET(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

/** SEG-V-3K9QZT: the org's initials and the end of the application's id, until
 *  QuickBooks gives the invoice its number. The V keeps it apart from the clubs'. */
export function vendorInvoiceNumber(orgName: string | null | undefined, subId: string): string {
  const initials = String(orgName || '').split(/[^A-Za-z0-9]+/).filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 4) || 'INV'
  return `${initials}-V-${String(subId || '').slice(-6).toUpperCase()}`
}

export type VendorInvoiceSource = {
  sub: {
    id: string
    data: any
    /** The fee as approved (lib/vendorApproval's amount). */
    amountDue: number
    statusAt?: string | null
    submittedAt?: string | null
    paymentStatus?: string | null
    paidAt?: string | null
    stripeRef?: string | null
  }
  payments: VendorPayment[]
  tournament: { name: string; startDate?: string | null; endDate?: string | null; location?: string | null }
  org: {
    name?: string | null; contactEmail?: string | null; contactPhone?: string | null; website?: string | null
    zelleHandle?: string | null; checkPayableTo?: string | null; checkAddress?: string | null
  } | null
  /** The vendor's booth page: where they pay online. */
  payUrl: string
  now?: Date
  logo?: InvoiceDoc['logo']
  /** QuickBooks' number and invoice date, once it has the invoice (lib/qboSync). */
  number?: string | null
  issuedOn?: string | null
}

export function vendorInvoiceDoc(src: VendorInvoiceSource): InvoiceDoc {
  const now = src.now || new Date()
  const { sub, tournament: t } = src
  const d = sub.data || {}
  const company = String(d.companyName || '').trim() || 'Vendor'
  const orgName = String(src.org?.name || '').trim() || t.name || 'Vendor invoice'
  const number = String(src.number || '').trim() || vendorInvoiceNumber(src.org?.name || t.name, sub.id)
  const money = vendorMoney(sub, src.payments)
  const lines = vendorLines(d, money.due)

  const payments = [
    ...src.payments.map(p => ({
      date: invoiceDate(p.receivedAt), sort: p.receivedAt, amount: round2(p.amount),
      method: p.method === 'check' && p.checkNumber ? `Check #${p.checkNumber}` : payMethodLabel(p.method),
    })),
    ...(money.online > 0 ? [{ date: invoiceDate(sub.paidAt || ''), sort: String(sub.paidAt || '').slice(0, 10), amount: money.online, method: 'Online' }] : []),
  ].sort((a, b) => a.sort.localeCompare(b.sort)).map(({ sort: _s, ...p }) => p)

  // The fee was set the day they were approved: that's the invoice date until
  // QuickBooks has one of its own.
  const approved = String(sub.statusAt || sub.submittedAt || '')
  const start = /^\d{4}-\d{2}-\d{2}/.exec(t.startDate || '')?.[0] || ''
  const dueText = money.balance <= 0 ? (money.due > 0 ? 'Paid' : 'No balance due')
    : start && start > ymdET(now) ? `Before ${invoiceDate(start)}`
    : 'Upon receipt'
  const checkAddress = String(src.org?.checkAddress || '').trim()

  return {
    number,
    issuedOn: invoiceDate(src.issuedOn || approved || now),
    dueText,
    org: {
      name: orgName,
      address: checkAddress,
      email: String(src.org?.contactEmail || '').trim(),
      phone: invoicePhone(src.org?.contactPhone),
      website: String(src.org?.website || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
    },
    billTo: { name: company, attn: String(d.companyContact || '').trim(), place: '' },
    event: {
      name: t.name,
      dates: eventDates(t.startDate, t.endDate),
      location: String(t.location || '').trim(),
      registeredOn: approved ? invoiceDate(approved) : '',
      sinceLabel: 'Approved',
    },
    lines,
    itemized: true,
    invoiced: money.due,
    discount: 0,
    discountNote: '',
    payments,
    clearing: null,
    balance: money.balance,
    payTo: {
      checkPayableTo: String(src.org?.checkPayableTo || '').trim() || orgName,
      checkAddress,
      zelleHandle: String(src.org?.zelleHandle || '').trim(),
    },
    payUrl: src.payUrl,
    memo: `${number}, ${company}`,
    logo: src.logo || null,
    detailHeading: lines.some(l => l.detail) ? 'DETAILS' : '',
    // The booth page charges the fee as it is, card or bank: no card fee.
    onlineText: 'Card or bank transfer',
  }
}
