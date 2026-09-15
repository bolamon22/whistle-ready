'use client'

import { useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { CheckCircle2, Lock } from 'lucide-react'
import type { VendorType, SponsorTier } from '@/lib/vendorForm'
import { priceLabel } from '@/lib/vendorForm'

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400'
const labelCls = 'block text-sm font-semibold text-slate-700 mb-1.5'
const card = 'bg-white rounded-2xl border border-slate-200'
const h2 = 'text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight'
const eyebrow = 'text-[11px] font-bold uppercase tracking-[0.15em] text-teal-700'

type Props = {
  orgId: string
  types: VendorType[]
  approvalNotice: string
  disclaimerHtml: string
  confirmationTitle: string
  confirmationHtml: string
  heroImage: string
  headline: string
  subhead: string
  orgName: string
  orgLogo?: string
  sponsorShow: boolean
  sponsorBlurb: string
  sponsorTiers: SponsorTier[]
  sponsorEmail: string
  tournamentId?: string
  tournamentName?: string
  eventDates?: string
}

export default function VendorForm(p: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [d, setD] = useState<any>({ companyName: '', companyContact: '', phone: '', email: '', website: '', vendorType: '', products: '', agree: false })
  const set = (k: string, v: any) => setD((prev: any) => ({ ...prev, [k]: v }))

  const open = p.types.filter(t => !t.closed)
  const chosen = p.types.find(t => t.id === d.vendorType) || null
  // A showcase vendor doesn't sell, so "list the products you plan to sell" is the wrong
  // question — and as a required field it blocked them from submitting at all.
  const selling = chosen ? chosen.selling : true

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!chosen) { toast.error('Please choose a booth type'); return }
    if (chosen.closed) { toast.error('That category is not accepting applications for this event'); return }
    if (!d.agree) { toast.error('Please agree to the vendor terms'); return }
    setSubmitting(true)
    try {
      const payload = {
        ...d,
        // `level` stays in step with the chosen type so existing staff lists, exports
        // and saved views keep reading the field they always have.
        level: chosen.name,
        vendorTypeName: chosen.name,
        boothFee: chosen.price || 0,
        selling: chosen.selling,
        tournamentId: p.tournamentId || '',
        tournamentName: p.tournamentName || '',
      }
      const res = await fetch('/api/org-forms/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId: p.orgId, formType: 'vendor', data: payload }) })
      if (res.ok) { setDone(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }
      else { const err = await res.json().catch(() => ({})); toast.error(err.error || 'Submission failed') }
    } catch { toast.error('Submission failed') } finally { setSubmitting(false) }
  }

  if (done) return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <CheckCircle2 size={52} className="mx-auto text-teal-500" />
        <h1 className="text-3xl font-extrabold text-slate-900 mt-5 tracking-tight">{p.confirmationTitle}</h1>
        <div className="text-slate-500 mt-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: p.confirmationHtml }} />
        <div className={`${card} p-5 mt-8 text-left`}>
          <h2 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">Your application</h2>
          <div className="space-y-1.5">
            {([
              ['Company', d.companyName], ['Contact', d.companyContact], ['Email', d.email], ['Phone', d.phone],
              ['Booth type', chosen?.name || ''],
              ['Booth fee', chosen ? (priceLabel(chosen.price) || 'Confirmed on approval') : ''],
              [selling ? 'Products' : 'Showcasing', d.products],
            ] as [string, string][]).filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 text-sm border-b border-slate-50 py-1"><span className="text-slate-400">{k}</span><span className="text-slate-700 text-right">{v}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <Toaster position="top-right" />

      {/* Hero — the photo does the selling; the copy just names the offer. */}
      <header className="relative overflow-hidden bg-[#0b1220]">
        {p.heroImage && <img src={p.heroImage} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" style={{ objectPosition: '50% 38%' }} />}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(103deg,rgba(8,19,31,.95) 0%,rgba(8,19,31,.85) 42%,rgba(8,19,31,.55) 100%)' }} />
        <div className="relative max-w-3xl mx-auto px-6 py-14 sm:py-20">
          <div className="flex items-center gap-3 mb-5">
            {p.orgLogo && <img src={p.orgLogo} alt="" className="w-11 h-11 rounded-lg object-contain bg-white/95 p-1" />}
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-300">Vendor booths · {p.orgName}</div>
          </div>
          <h1 className="text-[2.1rem] sm:text-5xl font-extrabold text-white leading-[1.02] tracking-tight max-w-[15ch]">{p.headline}</h1>
          <p className="text-slate-300 mt-5 text-base sm:text-lg max-w-[52ch] leading-relaxed">{p.subhead}</p>
          {(p.tournamentName || p.eventDates) && (
            <div className="flex flex-wrap gap-2 mt-7">
              {p.tournamentName && <span className="bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-white text-sm font-semibold">{p.tournamentName}</span>}
              {p.eventDates && <span className="bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-teal-200 text-sm font-semibold">{p.eventDates}</span>}
            </div>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">

        {p.approvalNotice.trim() && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-amber-700 mb-1.5">Approval required</div>
            <p className="text-sm text-amber-900 leading-relaxed">{p.approvalNotice}</p>
          </div>
        )}

        {/* Booth types — the price is the headline of each card. */}
        <section>
          <div className={eyebrow}>Booths</div>
          <h2 className={`${h2} mt-1.5`}>What a spot costs</h2>
          <p className="text-slate-500 mt-2 mb-5">One price, per event. Nothing is charged until we&rsquo;ve approved you.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {p.types.map(t => {
              const picked = d.vendorType === t.id
              const fee = priceLabel(t.price)
              return (
                <label key={t.id}
                  className={`relative block rounded-2xl border p-5 transition-all ${t.closed ? 'border-dashed border-slate-200 bg-slate-50 cursor-not-allowed' : picked ? 'border-teal-500 bg-white ring-1 ring-teal-500 shadow-sm cursor-pointer' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm cursor-pointer'}`}>
                  <input type="radio" name="vendorType" className="sr-only" disabled={t.closed} checked={picked} onChange={() => set('vendorType', t.id)} />
                  {picked && <span className="absolute top-4 right-4 w-6 h-6 rounded-full bg-teal-600 text-white text-sm font-bold flex items-center justify-center">✓</span>}
                  {t.closed
                    ? <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-slate-500 bg-slate-200 rounded-full px-2.5 py-1 mb-3"><Lock size={10} />Not open</span>
                    : <div className={`text-3xl font-extrabold tracking-tight tabular-nums ${picked ? 'text-teal-700' : 'text-slate-900'}`}>{fee || <span className="text-base font-semibold text-slate-400">Fee on approval</span>}</div>}
                  <h3 className={`mt-2.5 font-bold ${t.closed ? 'text-slate-400' : 'text-slate-800'}`}>{t.name}</h3>
                  {t.note && <p className={`text-sm mt-1.5 leading-relaxed ${t.closed ? 'text-slate-500' : 'text-slate-500'}`}>{t.note}</p>}
                </label>
              )
            })}
          </div>
          {open.length === 0 && <p className="text-sm text-slate-500 mt-4">We aren&rsquo;t accepting vendor applications for this event right now.</p>}
        </section>

        {/* How it works */}
        <section>
          <div className={eyebrow}>How it works</div>
          <h2 className={`${h2} mt-1.5`}>Approval first, payment second</h2>
          <p className="text-slate-500 mt-2 mb-5">We read every application. What you sell has to work at a youth event, and it can&rsquo;t collide with something already under contract.</p>
          <div className={`${card} overflow-hidden grid sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100`}>
            {[
              ['Step 1', 'You apply', 'Two minutes. No card, no deposit.'],
              ['Step 2', 'We review', 'You hear back either way.'],
              ['Step 3', "You're approved", 'Booth location, load-in and load-out times.'],
              ['Step 4', 'You pay', 'Card or bank transfer. That holds your space.'],
            ].map(([n, t, b]) => (
              <div key={n} className="p-5">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-teal-700">{n}</div>
                <h3 className="font-bold text-slate-800 mt-1.5">{t}</h3>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Sponsorship is a different sale — point at it, don't try to take the order. */}
        {p.sponsorShow && (
          <section className="bg-[#0b4a37] text-white rounded-2xl p-7 sm:p-8 grid md:grid-cols-[1.35fr_1fr] gap-7 items-center">
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight">Looking to sponsor, not sell?</h2>
              <p className="text-teal-100/80 mt-2.5 leading-relaxed text-[15px]">{p.sponsorBlurb}</p>
              {p.sponsorEmail && (
                <a href={`mailto:${p.sponsorEmail}?subject=Sponsorship%20%E2%80%94%20${encodeURIComponent(p.tournamentName || p.orgName)}`}
                  className="inline-block mt-5 border border-white/40 hover:bg-white/10 text-white font-bold text-sm rounded-lg px-5 py-2.5 transition-colors">
                  Request the sponsorship deck
                </a>
              )}
            </div>
            {p.sponsorTiers.length > 0 && (
              <div className="bg-white/10 border border-white/15 rounded-xl p-5">
                {p.sponsorTiers.map(t => (
                  <div key={t.name} className="flex justify-between gap-4 py-2 border-b border-white/10 last:border-0 text-sm font-semibold">
                    <span className="text-teal-50">{t.name}</span>
                    <span className="tabular-nums text-amber-300">{t.price > 0 ? priceLabel(t.price) : "Let's talk"}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* The form */}
        <section id="apply">
          <div className={eyebrow}>Apply</div>
          <h2 className={`${h2} mt-1.5 mb-5`}>Vendor application</h2>
          <form onSubmit={submit} className={`${card} p-6 sm:p-7`}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div><label className={labelCls} htmlFor="v-company">Company name *</label><input id="v-company" className={inputCls} value={d.companyName} onChange={e => set('companyName', e.target.value)} required /></div>
              <div><label className={labelCls} htmlFor="v-contact">Company contact *</label><input id="v-contact" className={inputCls} value={d.companyContact} onChange={e => set('companyContact', e.target.value)} required /></div>
              <div><label className={labelCls} htmlFor="v-phone">Mobile phone *</label><input id="v-phone" className={inputCls} type="tel" value={d.phone} onChange={e => set('phone', e.target.value)} required /></div>
              <div><label className={labelCls} htmlFor="v-email">Contact email *</label><input id="v-email" className={inputCls} type="email" value={d.email} onChange={e => set('email', e.target.value)} required /></div>
              <div className="sm:col-span-2"><label className={labelCls} htmlFor="v-site">Website or Instagram</label><input id="v-site" className={inputCls} value={d.website} onChange={e => set('website', e.target.value)} placeholder="https://…" /></div>
            </div>

            <div className="mt-5 pt-5 border-t border-slate-100">
              <label className={labelCls} htmlFor="v-products">{selling ? 'What do you plan to sell? *' : 'What will you be showcasing? *'}</label>
              <textarea id="v-products" className={`${inputCls} min-h-[110px]`} value={d.products} onChange={e => set('products', e.target.value)}
                placeholder={selling ? 'Be specific — anything not listed here has to stay in the truck.' : 'What you’ll be presenting, demoing or handing out.'} required />
              {!chosen && <p className="text-xs text-amber-700 mt-2">Choose a booth type above first.</p>}
            </div>

            <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 leading-relaxed mt-5" dangerouslySetInnerHTML={{ __html: p.disclaimerHtml }} />
            <label className="flex items-start gap-3 cursor-pointer mt-4">
              <input type="checkbox" id="v-agree" checked={d.agree} onChange={e => set('agree', e.target.checked)} className="mt-0.5 accent-teal-500 w-4 h-4" />
              <span className="text-sm text-slate-700">I have read and agree to the vendor terms above *</span>
            </label>

            <button type="submit" disabled={submitting || !d.agree || !chosen || open.length === 0}
              className="w-full mt-6 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-xl transition-colors">
              {submitting ? 'Submitting…' : chosen && chosen.price > 0 ? `Apply for ${chosen.name} · ${priceLabel(chosen.price)}` : 'Submit application'}
            </button>
            <p className="text-center text-xs text-slate-400 mt-3">No payment is taken now. Approved vendors get a link to pay.</p>
          </form>
        </section>

        <p className="text-center text-xs text-slate-400 pb-4">{p.orgName}</p>
      </div>
    </div>
  )
}
