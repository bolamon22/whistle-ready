'use client'

import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { CheckCircle2 } from 'lucide-react'

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

export default function VendorForm({ orgId, levels, paymentOptions, disclaimerHtml, confirmationTitle, confirmationHtml, tournamentId, tournamentName }: { orgId: string; levels: string[]; paymentOptions: string[]; disclaimerHtml: string; confirmationTitle: string; confirmationHtml: string; tournamentId?: string; tournamentName?: string }) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [d, setD] = useState<any>({ companyName: '', companyContact: '', phone: '', email: '', website: '', level: '', products: '', paymentOption: '', agree: false })
  const set = (k: string, v: any) => setD((p: any) => ({ ...p, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!d.agree) { toast.error('Please agree to the vendor terms'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/org-forms/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, formType: 'vendor', data: { ...d, tournamentId: tournamentId || '', tournamentName: tournamentName || '' } }) })
      if (res.ok) setDone(true)
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Submission failed') }
    } catch { toast.error('Submission failed') } finally { setSubmitting(false) }
  }

  const receiptRows: [string, string][] = [
    ['Company', d.companyName], ['Contact', d.companyContact], ['Phone', d.phone], ['Email', d.email],
    ['Website', d.website], ['Level', d.level], ['Products', d.products], ['Payment', d.paymentOption],
  ]
  if (done) return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto text-teal-500" />
        <h1 className="text-2xl font-extrabold text-slate-900 mt-4">{confirmationTitle}</h1>
        <div className="text-slate-500 mt-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: confirmationHtml }} />
      </div>
      <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">Your request</h2>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {receiptRows.filter(([, v]) => v && String(v).trim()).map(([label, v]) => (
            <div key={label} className="flex justify-between gap-4 text-sm border-b border-slate-50 py-1"><span className="text-slate-400">{label}</span><span className="text-slate-700 text-right">{v}</span></div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <form onSubmit={submit} className="max-w-2xl mx-auto px-6 py-10 space-y-6">
      <Toaster position="top-right" />
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Vendor / sponsor</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Company name *</label><input className={inputCls} value={d.companyName} onChange={e => set('companyName', e.target.value)} required /></div>
          <div><label className={labelCls}>Company contact *</label><input className={inputCls} value={d.companyContact} onChange={e => set('companyContact', e.target.value)} required /></div>
          <div><label className={labelCls}>Mobile phone *</label><input className={inputCls} type="tel" value={d.phone} onChange={e => set('phone', e.target.value)} required /></div>
          <div><label className={labelCls}>Contact email *</label><input className={inputCls} type="email" value={d.email} onChange={e => set('email', e.target.value)} required /></div>
          <div><label className={labelCls}>Website</label><input className={inputCls} value={d.website} onChange={e => set('website', e.target.value)} placeholder="https://…" /></div>
          {levels.length > 0 && <div><label className={labelCls}>Vendor / sponsor level *</label><select className={inputCls} value={d.level} onChange={e => set('level', e.target.value)} required><option value="">Select…</option>{levels.map(l => <option key={l}>{l}</option>)}</select></div>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Products &amp; terms</h2>
        <label className={labelCls}>Please list the products you plan to sell *</label>
        <textarea className={`${inputCls} min-h-[110px]`} value={d.products} onChange={e => set('products', e.target.value)} required />
        <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 leading-relaxed my-4" dangerouslySetInnerHTML={{ __html: disclaimerHtml }} />
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={d.agree} onChange={e => set('agree', e.target.checked)} className="mt-0.5 accent-teal-500 w-4 h-4" />
          <span className="text-sm text-slate-700">I have read and agree to the vendor terms above *</span>
        </label>
      </div>

      {paymentOptions.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <label className={labelCls}>Payment option *</label>
          <select className={inputCls} value={d.paymentOption} onChange={e => set('paymentOption', e.target.value)} required><option value="">Select…</option>{paymentOptions.map(o => <option key={o}>{o}</option>)}</select>
        </div>
      )}

      <button type="submit" disabled={submitting || !d.agree} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-colors">{submitting ? 'Submitting…' : 'Submit request'}</button>
    </form>
  )
}
