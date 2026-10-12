// What the Vendor requests page shows of an approved vendor's invoice: its
// number, the money, the payments recorded by hand and where it stands with
// QuickBooks. Server only (lib/qboSync).
import type { FormSubmission } from '@/lib/formSubmissions'
import { vendorQboState, type QboSettings, type VendorQboState } from '@/lib/qboSync'
import { vendorInvoiceNumber } from '@/lib/vendorInvoice'
import { vendorMoney, type VendorMoney, type VendorPayment } from '@/lib/vendorMoney'

export type VendorInvoiceSummary = {
  /** What the PDF says: QuickBooks' number once it has the invoice. */
  number: string
  money: VendorMoney
  /** Recorded by the office. */
  payments: VendorPayment[]
  /** When the booth page took the online payment, if it did. */
  onlineAt: string | null
  /** When the invoice was last emailed. */
  sentAt: string
  /** The PDF, by the booth page's token. */
  pdf: string
  qbo: VendorQboState
}

/** null for anything without an invoice: not approved, or no fee. */
export function vendorInvoiceSummary(sub: FormSubmission, orgName: string, settings: QboSettings): VendorInvoiceSummary | null {
  if (sub.formType !== 'vendor' || sub.status !== 'approved' || !sub.passToken) return null
  // The fee as approved; rows approved before it was frozen fall back to the quote.
  const fee = Number(sub.amountDue) > 0 ? Number(sub.amountDue) : Number(sub.data?.boothFee) || 0
  if (!(fee > 0)) return null
  const payments = sub.vendorPayments || []
  const money = vendorMoney({ amountDue: fee, paymentStatus: sub.paymentStatus, stripeRef: sub.stripeRef }, payments)
  const qbo = vendorQboState(sub, settings)
  return {
    number: qbo.docNumber || vendorInvoiceNumber(orgName, sub.id),
    money,
    payments,
    onlineAt: money.online > 0 ? sub.paidAt || null : null,
    sentAt: sub.invoiceSentAt || '',
    pdf: `/api/vendor/${sub.passToken}/invoice`,
    qbo,
  }
}
