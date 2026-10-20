// Browser side of a receipt: shrink a phone photo, upload it to the private receipt
// store (api/expenses/receipts) and ask for it to be read. No database import, so the
// staff card and the Financials Expenses tab can use it.

import { fitJpeg } from '@/lib/photoClient'
import { RECEIPT_MAX_BYTES, type ExpenseView, type ReceiptRead } from '@/lib/expenseTypes'

export const RECEIPT_PHOTO_ACCEPT = 'image/*'
export const RECEIPT_FILE_ACCEPT = 'image/*,application/pdf'

export const receiptUrl = (id: string) => `/api/expenses/receipts/${encodeURIComponent(id)}`

/** Uploads a receipt. A photo is fitted inside 2000px as a JPEG first: a 4 MB phone
 *  picture goes up as a few hundred KB that is still easy to read, without its GPS.
 *  Throws with a message meant to be shown. */
export async function uploadReceipt(file: File): Promise<{ id: string; type: 'image' | 'pdf' }> {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
  let blob: Blob = file
  if (!isPdf) {
    try { blob = await fitJpeg(file, 2000, 0.82) } catch { throw new Error('That photo can’t be opened here. Take a new photo of the receipt.') }
  }
  if (blob.size > RECEIPT_MAX_BYTES) throw new Error(isPdf ? 'That PDF is over 4 MB. Take a photo of the receipt instead.' : 'That photo is too big. Take it again a little closer.')
  const fd = new FormData()
  fd.append('file', new File([blob], isPdf ? 'receipt.pdf' : 'receipt.jpg', { type: isPdf ? 'application/pdf' : 'image/jpeg' }))
  const res = await fetch('/api/expenses/receipts', { method: 'POST', body: fd })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.id) throw new Error(j.error || 'The receipt didn’t upload. Try again.')
  return { id: String(j.id), type: j.type === 'pdf' ? 'pdf' : 'image' }
}

/** What the receipt reader saw, or the reason it couldn't read it. */
export async function readReceipt(id: string): Promise<{ read: ReceiptRead } | { error: string }> {
  try {
    const res = await fetch(`${receiptUrl(id)}/read`, { method: 'POST' })
    const j = await res.json().catch(() => ({}))
    if (!res.ok || !j.read) return { error: j.error || 'Couldn’t read that receipt. Type the details in.' }
    return { read: j.read as ReceiptRead }
  } catch { return { error: 'Couldn’t read that receipt. Type the details in.' } }
}

/** Sends a change to one receipt; resolves to it as saved, or throws the reason. */
export async function patchExpense(id: string, body: Record<string, unknown>): Promise<ExpenseView> {
  const res = await fetch(`/api/expenses/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.expense) throw new Error(j.error || 'Couldn’t save that. Try again.')
  return j.expense as ExpenseView
}

export async function removeExpense(id: string): Promise<void> {
  const res = await fetch(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Couldn’t delete it. Try again.')
}

/** "$1,234.50" */
export const usd = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** A stored YYYY-MM-DD as the calendar day it is ("Oct 18"), with the year when it isn't this year. */
export function shortDay(ymd: string, thisYear = new Date().getFullYear()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '')
  if (!m) return ''
  const d = new Date(+m[1], +m[2] - 1, +m[3])
  return d.toLocaleDateString('en-US', +m[1] === thisYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}
