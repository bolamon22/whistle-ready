'use client'

import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { CheckCircle2, Lock } from 'lucide-react'
import type { VendorType } from '@/lib/vendorForm'
import { priceLabel } from '@/lib/vendorForm'

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'

export default function VendorForm({ orgId, types, approvalNotice, disclaimerHtml, confirmationTitle, confirmationHtml, tournamentId, tournamentName }: { orgId: string; types: VendorType[]; approvalNotice: string; disclaimerHtml: string; confirmationTitle: string; confirmationHtml: string; tournamentId?: string; tournamentName?: string }) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [d, setD] = useState<any>({ companyName: '', companyContact: '', phone: '', email: '', website: '', vendorType: '', products: '', agree: false })
  const set = (k: string, v: any) => setD((p: any) => ({ ...p, [k]: v }))

  const open = types.filter(t => !t.closed)
  const chosen = types.find(t => t.id === d.vendorType) || null
  // Showcase vendors don't sell, so "list the products you plan to sell" is the
  // wrong question for them -- and making it required blocked the form entirely.
  const selling = chosen ? chosen.selling : true

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!chosen) { toast.error('Please choose a vendor type'); return }
    if (chosen.closed) { toast.error('That category is not accepting applications for this event'); return }
    if (!d.agree) { toast.error('Please agree to the vendor terms'); return }
    setSubmitting(true)
    try {
      const payload = {
        ...d,
        // `level` is kept in step with the chosen type so existing staff lists,
        // exports and saved views keep reading the same field they always have.
        level: chosen.name,
        vendorTypeName: chosen.name,
        boothFee: chosen.price || 0,
        selling: chosen.selling,
        tournamentId: tournamentId || '',
        tournamentName: tournamentName || '',
      }
      const res = await fetch('/api/org-forms/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, formType: 'vendor', data: payload }) })
      if (res.ok) setDone(true)
      else { const err = await res.json().catch(() => ({})); toast.error(err.error || 'Submission failed') }
    } catch { toast.error('Submission failed') } finally { setSubmitting(false) }
  }

  const receiptRows: [string, string][] = [
    ['Company', d.companyName], ['Contact', d.companyContact], ['Phone', d.phone], ['Email', d.email],
    ['Website', d.website], ['Vendor type', chosen?.name || ''],
    ['Booth fee', chosen && chosen.price > 0 ? priceLabel(chosen.price) : 'Confirmed on approval'],
    [selling ? 'Products' : 'Showcasing', d.products],
  ]
  if (done) return (
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto text-teal-500" />
        <h1 className="text-2xl font-extrabold text-slate-900 mt-4">{confirmationTitle}</h1>
        <div className="text-slate-500 mt-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: confirmationHtml }} />
      </div>
      <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">Your application</h2>
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

      {approvalNotice.trim() && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="text-xs uppercase tracking-[0.14em] text-amber-700 font-bold mb-1.5">Approval required</div>
          <p className="text-sm text-amber-900 leading-relaxed">{approvalNotice}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Your company</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Company name *</label><input className={inputCls} value={d.companyName} onChange={e => set('companyName', e.target.value)} required /></div>
          <div><label className={labelCls}>Company contact *</label><input className={inputCls} value={d.companyContact} onChange={e => set('companyContact', e.target.value)} required /></div>
          <div><label className={labelCls}>Mobile phone *</label><input className={inputCls} type="tel" value={d.phone} onChange={e => set('phone', e.target.value)} required /></div>
          <div><label className={labelCls}>Contact email *</label><input className={inputCls} type="email" value={d.email} onChange={e => set('email', e.target.value)} required /></div>
          <div className="sm:col-span-2"><label className={labelCls}>Website</label><input className={inputCls} value={d.website} onChange={e => set('website', e.target.value)} placeholder="https://…" /></div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-1 pb-2 border-b border-slate-100">What kind of vendor are you?</h2>
        <p className="text-xs text-slate-500 mt-2 mb-4">Pick the one that fits best. If you&rsquo;re not sure, choose the closest and tell us in the box below.</p>
        <div className="space-y-2.5">
          {types.map(t => {
            const picked = d.vendorType === t.id
            const fee = priceLabel(t.price)
            return (
              <label
                key={t.id}
                className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${t.closed ? 'border-slate-200 bg-slate-50 cursor-not-allowed' : picked ? 'border-teal-500 bg-teal-50/60 cursor-pointer' : 'border-slate-200 hover:border-slate-300 cursor-pointer'}`}
              >
                <input
                  type="radio"
                  name="vendorType"
                  className="mt-1 accent-teal-500 w-4 h-4 shrink-0"
                  disabled={t.closed}
                  checked={picked}
                  onChange={() => set('vendorType', t.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center flex-wrap gap-x-2 gap-y-1">
                    <span className={`text-sm font-semibold ${t.closed ? 'text-slate-400' : 'text-slate-800'}`}>{t.name}</span>
                    {t.closed
                      ? <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-slate-500 bg-slate-200 rounded-full px-2 py-0.5"><Lock size={10} />Not open</span>
                      : fee
                        ? <span className="text-[11px] font-bold text-teal-700 bg-teal-100 rounded-full px-2 py-0.5">{fee}</span>
                        : <span className="text-[11px] text-slate-500">Fee confirmed on approval</span>}
                  </span>
                  {t.note && <span className={`block text-xs mt-1 leading-relaxed ${t.closed ? 'text-slate-500' : 'text-slate-600'}`}>{t.note}</span>}
                </span>
              </label>
            )
          })}
        </div>
        {open.length === 0 && <p className="text-sm text-slate-500 mt-4">We aren&rsquo;t accepting vendor applications for this event right now.</p>}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">{selling ? 'Products & terms' : 'What you’re bringing'}</h2>
        <label className={labelCls}>{selling ? 'Please list the products you plan to sell *' : 'What will you be showcasing? *'}</label>
        <textarea
          className={`${inputCls} min-h-[110px]`}
          value={d.products}
          onChange={e => set('products', e.target.value)}
          placeholder={selling ? 'Be specific — anything not listed here has to stay in the truck.' : 'What you’ll be presenting, demoing or handing out.'}
          required
        />
        <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 leading-relaxed my-4" dangerouslySetInnerHTML={{ __html: disclaimerHtml }} />
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={d.agree} onChange={e => set('agree', e.target.checked)} className="mt-0.5 accent-teal-500 w-4 h-4" />
          <span className="text-sm text-slate-700">I have read and agree to the vendor terms above *</span>
        </label>
      </div>

      <button type="submit" disabled={submitting || !d.agree || !chosen || open.length === 0} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-colors">{submitting ? 'Submitting…' : 'Submit application'}</button>
      <p className="text-center text-xs text-slate-400 -mt-2">No payment is taken now. Approved vendors get a link to pay.</p>
    </form>
  )
}
