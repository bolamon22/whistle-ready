'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, Mail, Plus, ExternalLink, Download, RefreshCw, Trash2 } from 'lucide-react'
import { VENDOR_PAY_METHODS, payMethodLabel } from '@/lib/vendorMoney'

// An approved vendor's invoice on Vendor requests: the PDF, Email invoice, payments
// recorded by hand, and where it stands with QuickBooks. Bo, Oct 12 2026: "I need
// to create invoices to send to vendors in the vendor area." For staff who can see
// money (api/tournaments/[id]/vendor-requests sends the invoice only to them).

export type VendorInvoice = {
  number: string
  money: { due: number; byHand: number; online: number; paid: number; balance: number }
  payments: { id: string; amount: number; method: string; checkNumber?: string; receivedAt: string; note?: string; qboPaymentId?: string }[]
  onlineAt: string | null
  sentAt: string
  pdf: string
  qbo: { state: 'in' | 'payments' | 'queued' | 'out' | 'none' | 'error'; docNumber: string; error: string; syncedAt: string }
}

const usd = (n: number) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Oct 12": a YYYY-MM-DD as the calendar day it is, a timestamp in local time. */
const shortDay = (v: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''))
  if (m) return `${MONTHS[+m[2] - 1]} ${+m[3]}`
  const d = new Date(String(v || ''))
  return isNaN(d.getTime()) ? '' : `${MONTHS[d.getMonth()]} ${d.getDate()}`
}
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const btn = 'text-xs font-semibold rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50'

export default function VendorInvoicePanel({ tournamentId, sub, inv, onUpdate }: {
  tournamentId: string
  sub: { id: string; data: any }
  inv: VendorInvoice
  onUpdate: (submission: any, invoice: VendorInvoice | null) => void
}) {
  const company = String(sub.data?.companyName || 'this vendor')
  const email = String(sub.data?.email || '').trim()
  const [busy, setBusy] = useState<string | null>(null)
  const [emailOpen, setEmailOpen] = useState(false)
  const [toVendor, setToVendor] = useState(true)
  const [also, setAlso] = useState('')
  const [note, setNote] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [pay, setPay] = useState({ amount: '', method: 'check', checkNumber: '', receivedAt: '', note: '' })

  async function call(action: string, payload: Record<string, unknown> = {}) {
    const res = await fetch(`/api/tournaments/${tournamentId}/vendor-requests/invoice`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, subId: sub.id, ...payload }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || 'That didn’t go through. Try again.')
    if (j.submission) onUpdate(j.submission, j.invoice ?? null)
    return j
  }

  async function sendEmail() {
    setBusy('email')
    try {
      const j = await call('email', { toVendor, also, note })
      toast.success(`Invoice ${j.number || inv.number} emailed to ${(j.to || []).join(', ')}`, { duration: 5000 })
      if (j.qboNote) toast.error(`It went with Whistle Ready's number. QuickBooks: ${j.qboNote}`, { duration: 9000 })
      setEmailOpen(false)
    } catch (e: any) { toast.error(e?.message || 'The invoice did not go out') }
    finally { setBusy(null) }
  }

  async function recordPayment() {
    setBusy('pay')
    try {
      const j = await call('pay', { ...pay, amount: Number(pay.amount) })
      toast.success(j.invoice && j.invoice.money.balance <= 0 ? `Payment recorded. ${company} is paid in full.` : 'Payment recorded.')
      setPayOpen(false)
    } catch (e: any) { toast.error(e?.message || 'Could not record that payment') }
    finally { setBusy(null) }
  }

  async function removePayment(p: VendorInvoice['payments'][number]) {
    const what = `${usd(p.amount)} ${p.method === 'check' && p.checkNumber ? `check #${p.checkNumber}` : payMethodLabel(p.method).toLowerCase()}`
    const qbo = p.qboPaymentId ? '\n\nIt is in QuickBooks too. Taking it off here doesn’t take it off there; delete it in QuickBooks as well.' : ''
    if (!confirm(`Take the ${what} payment off ${company}?${qbo}`)) return
    setBusy(`unpay:${p.id}`)
    try { await call('unpay', { paymentId: p.id }); toast.success('Payment taken off.') }
    catch (e: any) { toast.error(e?.message || 'Could not take that payment off') }
    finally { setBusy(null) }
  }

  async function syncQbo() {
    setBusy('qbo')
    try {
      const j = await call('qbo')
      const n = j.result?.docNumber || j.invoice?.qbo?.docNumber
      toast.success(j.result?.status === 'created' ? `In QuickBooks as invoice ${n}.` : 'QuickBooks is up to date.')
    } catch (e: any) { toast.error(e?.message || 'QuickBooks sync failed', { duration: 9000 }) }
    finally { setBusy(null) }
  }

  const openPay = () => {
    setPay({ amount: inv.money.balance ? String(inv.money.balance) : '', method: 'check', checkNumber: '', receivedAt: todayLocal(), note: '' })
    setPayOpen(true)
  }
  const openEmail = () => { setToVendor(true); setAlso(''); setNote(''); setEmailOpen(true) }

  const q = inv.qbo
  const qboLine = q.state === 'in' ? { text: `In QuickBooks as invoice ${q.docNumber}`, cls: 'text-slate-500', action: '' }
    : q.state === 'payments' ? { text: `In QuickBooks as invoice ${q.docNumber}. A payment is waiting to go.`, cls: 'text-amber-700', action: 'Sync now' }
    : q.state === 'queued' ? { text: 'Goes to QuickBooks on the next sync.', cls: 'text-slate-500', action: 'Send now' }
    : q.state === 'out' ? { text: 'Not in QuickBooks yet.', cls: 'text-slate-500', action: 'Send to QuickBooks' }
    : q.state === 'error' ? { text: `QuickBooks: ${q.error}`, cls: 'text-red-700', action: 'Try again' }
    : null
  const paid = inv.money.paid > 0
  const rows = [
    ...inv.payments.map(p => ({ key: p.id, when: shortDay(p.receivedAt), sort: p.receivedAt, what: p.method === 'check' && p.checkNumber ? `Check #${p.checkNumber}` : payMethodLabel(p.method), amount: p.amount, note: p.note || '', p })),
    ...(inv.money.online > 0 ? [{ key: 'online', when: shortDay(inv.onlineAt), sort: String(inv.onlineAt || '').slice(0, 10), what: 'Online (booth page)', amount: inv.money.online, note: '', p: null }] : []),
  ].sort((a, b) => a.sort.localeCompare(b.sort))

  return (
    <div className="mt-3 bg-white border border-slate-200 rounded-xl p-3 sm:p-4" onClick={e => e.stopPropagation()} data-testid="vendor-invoice">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><FileText size={15} className="text-teal-600 shrink-0" /> Invoice {inv.number}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Booth fee {usd(inv.money.due)}
            {paid ? <> · Paid {usd(inv.money.paid)}</> : null}
            {' · '}<span className={inv.money.balance > 0 ? 'font-semibold text-slate-700' : 'font-semibold text-green-700'}>{inv.money.balance > 0 ? `${usd(inv.money.balance)} due` : 'Paid in full'}</span>
            {inv.sentAt ? <> · Emailed {shortDay(inv.sentAt)}</> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`${inv.pdf}?view=1`} target="_blank" rel="noreferrer" className={`${btn} text-slate-600 hover:bg-slate-100 border border-slate-200`}><ExternalLink size={13} /> Open PDF</a>
          <button onClick={openEmail} disabled={!!busy} className={`${btn} bg-teal-600 hover:bg-teal-700 text-white`}><Mail size={13} /> Email invoice</button>
          {inv.money.balance > 0 && (
            <button onClick={openPay} disabled={!!busy} className={`${btn} text-slate-600 hover:bg-slate-100 border border-slate-200`}><Plus size={13} /> Record payment</button>
          )}
        </div>
      </div>

      {rows.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Payments</div>
          {rows.map(r => (
            <div key={r.key} className="flex items-center gap-3 text-sm py-1">
              <span className="w-14 shrink-0 text-slate-500 tabular-nums">{r.when}</span>
              <span className="flex-1 min-w-0 truncate text-slate-700">{r.what}{r.note ? <span className="text-slate-400"> · {r.note}</span> : null}</span>
              <span className="tabular-nums text-slate-700">{usd(r.amount)}</span>
              {r.p ? (
                <button onClick={() => removePayment(r.p!)} disabled={!!busy} title="Take this payment off" aria-label="Take this payment off" className="text-slate-400 hover:text-red-600 disabled:opacity-50"><Trash2 size={14} /></button>
              ) : <span className="w-[14px]" />}
            </div>
          ))}
        </div>
      )}

      {qboLine && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className={qboLine.cls}>{qboLine.text}</span>
          {qboLine.action && (
            <button onClick={syncQbo} disabled={!!busy} className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-800 disabled:opacity-50">
              <RefreshCw size={12} className={busy === 'qbo' ? 'animate-spin' : ''} /> {busy === 'qbo' ? 'Sending…' : qboLine.action}
            </button>
          )}
        </div>
      )}

      {emailOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => busy !== 'email' && setEmailOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-1">Invoice {inv.number} · {company}</h3>
            <p className="text-sm text-slate-500 mb-3">
              A PDF with the booth fee, payments so far, and how to pay by check, Zelle or online. {company} can also download it from their booth page.
              {inv.sentAt ? <> Last emailed {shortDay(inv.sentAt)}.</> : null}
            </p>
            <div className="flex flex-wrap gap-2 mb-5">
              <a href={`${inv.pdf}?view=1`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50"><ExternalLink size={14} /> Open PDF</a>
              <a href={inv.pdf} className="inline-flex items-center gap-1.5 text-sm border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-50"><Download size={14} /> Download</a>
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Email it</div>
            <label className="flex items-start gap-2 text-sm text-slate-700 mb-3 cursor-pointer">
              <input type="checkbox" checked={toVendor} onChange={e => setToVendor(e.target.checked)} className="mt-0.5 accent-teal-600" />
              <span>To the vendor: <span className="font-medium">{email || 'no email on the application'}</span></span>
            </label>
            <label className="block text-xs font-medium text-slate-600 mb-1">Also send to (their accounting office, say)</label>
            <input value={also} onChange={e => setAlso(e.target.value)} placeholder="accounting@company.com" className={`${inputCls} mb-3`} />
            <label className="block text-xs font-medium text-slate-600 mb-1">Note (optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1500} placeholder="Added to the email above the payment details" className={`${inputCls} mb-2`} />
            <p className="text-xs text-slate-400 mb-4">A copy goes to the office inbox.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEmailOpen(false)} disabled={busy === 'email'} className="text-sm border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={sendEmail} disabled={busy === 'email' || (!(toVendor && email) && !also.trim())}
                className="text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg inline-flex items-center gap-1.5"><Mail size={14} /> {busy === 'email' ? 'Sending…' : 'Email invoice'}</button>
            </div>
          </div>
        </div>
      )}

      {payOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => busy !== 'pay' && setPayOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-1">Record a payment · {company}</h3>
            <p className="text-sm text-slate-500 mb-4">For a check, Zelle or cash. Payments on their booth page are recorded by themselves. {usd(inv.money.balance)} is left to pay.</p>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount</label>
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input type="number" min="0.01" step="0.01" max={inv.money.balance} value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} className={`${inputCls} pl-7`} />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">How they paid</label>
                <select value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))} className={inputCls}>
                  {VENDOR_PAY_METHODS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Date received</label>
                <input type="date" value={pay.receivedAt} onChange={e => setPay(p => ({ ...p, receivedAt: e.target.value }))} className={inputCls} />
              </div>
            </div>
            {pay.method === 'check' && (
              <>
                <label className="block text-xs font-medium text-slate-600 mb-1">Check number (optional)</label>
                <input value={pay.checkNumber} onChange={e => setPay(p => ({ ...p, checkNumber: e.target.value }))} className={`${inputCls} mb-3`} />
              </>
            )}
            <label className="block text-xs font-medium text-slate-600 mb-1">Note (optional)</label>
            <input value={pay.note} onChange={e => setPay(p => ({ ...p, note: e.target.value }))} maxLength={300} className={`${inputCls} mb-4`} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setPayOpen(false)} disabled={busy === 'pay'} className="text-sm border border-slate-300 text-slate-600 px-4 py-2 rounded-lg hover:bg-slate-50">Cancel</button>
              <button onClick={recordPayment} disabled={busy === 'pay' || !(Number(pay.amount) > 0)}
                className="text-sm bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold px-4 py-2 rounded-lg">{busy === 'pay' ? 'Saving…' : 'Record payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
