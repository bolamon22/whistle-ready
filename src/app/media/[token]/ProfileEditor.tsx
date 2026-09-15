'use client'

import { useState } from 'react'
import { Check, ExternalLink, Plus, Trash2 } from 'lucide-react'

type Pkg = { id: string; name: string; price: number; note: string }
type Profile = {
  slug: string; name: string; business: string; location: string; bio: string
  website: string; instagram: string; bookingEmail: string
  avatarUrl: string; coverUrl: string; packages: Pkg[]; samples: string[]
}

// The photographer editing their own booking page from their credential link.
// Everything here is theirs; the URL and whether they're listed stay with the org
// (enforced server-side in savePhotographerSelf, not by hiding the fields).
export default function ProfileEditor({ token, initial, pageUrl }: { token: string; initial: Profile; pageUrl: string }) {
  const [p, setP] = useState<Profile>(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: keyof Profile, v: any) => { setP(s => ({ ...s, [k]: v })); setSaved(false) }
  const setPkg = (i: number, patch: Partial<Pkg>) =>
    setP(s => ({ ...s, packages: s.packages.map((x, j) => (j === i ? { ...x, ...patch } : x)) }))

  async function save() {
    setBusy(true); setErr('')
    try {
      const r = await fetch(`/api/media/${token}/profile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save')
      setSaved(true)
    } catch (e: any) { setErr(e?.message || 'Could not save') } finally { setBusy(false) }
  }

  const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-[14.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500'
  const lbl = 'block text-[12px] font-semibold text-slate-600 mb-1'

  return (
    <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-bold text-slate-900">Your booking page</h2>
          <p className="text-[13.5px] text-slate-500 mt-1 leading-relaxed">
            Live now. Teams and families book you through it &mdash; we take no cut of anything you book.
          </p>
          <a href={pageUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-700 hover:text-teal-900 mt-2 break-all">
            {pageUrl.replace(/^https?:\/\//, '')} <ExternalLink size={12} className="shrink-0" />
          </a>
        </div>
        <button onClick={() => setOpen(o => !o)}
          className="text-[13px] font-semibold border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0">
          {open ? 'Close' : 'Edit page'}
        </button>
      </div>

      {open && (
        <div className="mt-5 pt-5 border-t border-slate-100 space-y-3.5">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={lbl}>Business name</label><input className={input} value={p.business} onChange={e => set('business', e.target.value)} /></div>
            <div><label className={lbl}>Your name</label><input className={input} value={p.name} onChange={e => set('name', e.target.value)} /></div>
            <div><label className={lbl}>Where you&rsquo;re based</label><input className={input} value={p.location} onChange={e => set('location', e.target.value)} placeholder="City, State" /></div>
            <div><label className={lbl}>Booking email <span className="font-normal text-slate-400">requests come here</span></label><input className={input} value={p.bookingEmail} onChange={e => set('bookingEmail', e.target.value)} /></div>
            <div><label className={lbl}>Website</label><input className={input} value={p.website} onChange={e => set('website', e.target.value)} placeholder="yoursite.com" /></div>
            <div>
              <label className={lbl}>Instagram</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[14.5px]">@</span>
                <input className={`${input} pl-7`} value={p.instagram} onChange={e => set('instagram', e.target.value.replace(/^@/, ''))} />
              </div>
            </div>
          </div>

          <div>
            <label className={lbl}>Short bio <span className="font-normal text-slate-400">a couple of sentences &mdash; this is what sells you</span></label>
            <textarea className={`${input} min-h-[80px]`} value={p.bio} maxLength={600}
              onChange={e => set('bio', e.target.value)}
              placeholder="What you shoot, how long you've been doing it, what a family gets." />
          </div>

          <div>
            <label className={lbl}>Packages <span className="font-normal text-slate-400">leave a price at 0 to show &ldquo;Ask&rdquo;</span></label>
            <div className="space-y-2">
              {p.packages.map((pk, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-2.5">
                  <div className="flex gap-2">
                    <input className={`${input} flex-1`} value={pk.name} placeholder="Player package" onChange={e => setPkg(i, { name: e.target.value })} />
                    <input className={`${input} w-24 tabular-nums`} type="number" min={0} step={25} value={pk.price} onChange={e => setPkg(i, { price: Math.max(0, Number(e.target.value) || 0) })} />
                    <button type="button" onClick={() => set('packages', p.packages.filter((_, j) => j !== i))}
                      className="w-9 text-slate-400 hover:text-red-600"><Trash2 size={14} className="mx-auto" /></button>
                  </div>
                  <input className={`${input} mt-2`} value={pk.note} placeholder="What's included" onChange={e => setPkg(i, { note: e.target.value })} />
                </div>
              ))}
              {p.packages.length < 8 && (
                <button type="button" onClick={() => set('packages', [...p.packages, { id: `pkg-${p.packages.length + 1}`, name: '', price: 0, note: '' }])}
                  className="text-[13.5px] font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><Plus size={13} /> Add a package</button>
              )}
            </div>
          </div>

          {err && <p className="text-[13.5px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button onClick={save} disabled={busy}
              className="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold text-[14px] rounded-full px-5 py-2.5">
              {busy ? 'Saving…' : 'Save my page'}
            </button>
            {saved && <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-teal-700"><Check size={14} strokeWidth={3} /> Saved</span>}
          </div>
          <p className="text-[12px] text-slate-400">
            Sample photos and your headshot come from what you upload to the gallery &mdash; ask us and we&rsquo;ll set them.
          </p>
        </div>
      )}
    </div>
  )
}
