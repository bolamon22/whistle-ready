'use client'

import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Camera, Wand2, Loader2, X } from 'lucide-react'
import { uploadPlayerPhoto, uploadClubLogo } from '@/lib/photoClient'

// The example player card an org shows on its registration form.
//
// WHY IT IS EDITED HERE RATHER THAN POINTED AT A REAL CARD: an example tied to a
// live waiver record breaks silently the day somebody archives that record, and
// a second org on Whistle Ready cannot borrow the first org's registrant. These
// are the org's own fields — seeded from a real card in one click, then theirs.
//
// BOTH QR CODES ARE EDITABLE. Bo will put live links in later, and an example
// whose codes open nothing quietly teaches families that the codes are
// decoration (Bo, Sep 18 2026). Blank falls back to the org's own event link, so
// the example never ships a dead code.

export type CardSample = {
  playerName: string; clubName: string; teamName: string; division: string
  jersey: string; position: string; photoUrl: string; clubLogoUrl: string
  qrLink: string; qrLabel: string; qr2Link: string; qr2Label: string; code: string
}

const EMPTY: CardSample = {
  playerName: '', clubName: '', teamName: '', division: '', jersey: '', position: '',
  photoUrl: '', clubLogoUrl: '', qrLink: '', qrLabel: '', qr2Link: '', qr2Label: '', code: '',
}

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const label = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1'

export default function SampleCardEditor({ value, onChange }: { value?: Partial<CardSample>; onChange: (v: CardSample) => void }) {
  const v: CardSample = { ...EMPTY, ...(value || {}) }
  const set = (k: keyof CardSample, val: string) => onChange({ ...v, [k]: val })

  const [seedLink, setSeedLink] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [busy, setBusy] = useState<'' | 'photo' | 'logo'>('')
  const photoRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  // One click copies a finished card's details in. A COPY, deliberately — after
  // this the fields belong to the org and nothing can change them underneath.
  async function seed() {
    const raw = seedLink.trim()
    if (!raw) { toast.error('Paste the link to a finished player card first'); return }
    setSeeding(true)
    try {
      const res = await fetch(`/api/org-forms/sample-seed?token=${encodeURIComponent(raw)}`)
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j?.error || 'Could not read that card'); return }
      onChange({ ...EMPTY, ...(j.sample || {}) })
      setSeedLink('')
      toast.success('Filled from that card — edit anything below')
    } catch {
      toast.error('Could not read that card')
    } finally { setSeeding(false) }
  }

  async function pick(kind: 'photo' | 'logo', file: File) {
    setBusy(kind)
    try {
      const url = kind === 'photo' ? await uploadPlayerPhoto(file) : await uploadClubLogo(file)
      set(kind === 'photo' ? 'photoUrl' : 'clubLogoUrl', url)
    } catch (e: any) {
      toast.error(e?.message || 'Could not upload that image')
    } finally {
      setBusy('')
      const r = kind === 'photo' ? photoRef : logoRef
      if (r.current) r.current.value = ''
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
      {/* Seed from a real card */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px]">
          <label className={label}>Fill from a finished card</label>
          <input className={input} value={seedLink} onChange={e => setSeedLink(e.target.value)}
            placeholder="Paste a player card link, e.g. …/pass/abc123" />
        </div>
        <button type="button" onClick={seed} disabled={seeding}
          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-3 py-2">
          {seeding ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Fill
        </button>
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">
        Copies that card&rsquo;s details in once. Nothing stays linked &mdash; edit freely afterwards, and the example
        keeps working even if that registration is later removed.
      </p>

      {/* Images */}
      <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-100">
        {([['photo', 'Player photo', v.photoUrl, photoRef] as const, ['logo', 'Club logo', v.clubLogoUrl, logoRef] as const]).map(([kind, text, url, ref]) => (
          <div key={kind} className="flex items-center gap-2.5">
            <button type="button" onClick={() => ref.current?.click()} disabled={!!busy}
              className="relative w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 overflow-hidden flex items-center justify-center text-slate-400 disabled:opacity-60">
              {url ? <img src={url} alt="" className={`w-full h-full ${kind === 'photo' ? 'object-cover' : 'object-contain p-1'}`} /> : <Camera size={20} />}
              {busy === kind && <span className="absolute inset-0 bg-white/75 flex items-center justify-center text-[10px] font-semibold text-slate-600">…</span>}
            </button>
            <div className="text-xs">
              <div className="font-semibold text-slate-600">{text}</div>
              <button type="button" onClick={() => ref.current?.click()} className="text-teal-700 hover:underline font-semibold">{url ? 'Change' : 'Add'}</button>
              {url && <button type="button" onClick={() => set(kind === 'photo' ? 'photoUrl' : 'clubLogoUrl', '')} className="ml-2 text-slate-400 hover:underline">Remove</button>}
            </div>
            <input ref={ref} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pick(kind, f) }} />
          </div>
        ))}
      </div>

      {/* Who */}
      <div className="grid sm:grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-100">
        <div><label className={label}>Player name</label><input className={input} value={v.playerName} onChange={e => set('playerName', e.target.value)} placeholder="Leave blank for a drawn stand-in" /></div>
        <div><label className={label}>Club</label><input className={input} value={v.clubName} onChange={e => set('clubName', e.target.value)} /></div>
        <div><label className={label}>Team</label><input className={input} value={v.teamName} onChange={e => set('teamName', e.target.value)} /></div>
        <div><label className={label}>Division</label><input className={input} value={v.division} onChange={e => set('division', e.target.value)} /></div>
        <div><label className={label}>Jersey number</label><input className={input} value={v.jersey} onChange={e => set('jersey', e.target.value)} /></div>
        <div><label className={label}>Position</label><input className={input} value={v.position} onChange={e => set('position', e.target.value)} /></div>
        <div><label className={label}>Player ID on the card</label><input className={input} value={v.code} onChange={e => set('code', e.target.value)} placeholder="K7M-3PX" /></div>
      </div>

      {/* Both codes */}
      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">The example&rsquo;s two QR codes</div>
        <p className="text-[11px] text-slate-400 mt-1">
          Both are yours to point wherever you like. Leave either blank and it falls back to your event link, so the
          example never shows a code that opens nothing.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <div><label className={label}>First code opens</label><input className={input} value={v.qrLink} onChange={e => set('qrLink', e.target.value)} placeholder="https://…" /></div>
          <div><label className={label}>Caption under it</label><input className={input} value={v.qrLabel} onChange={e => set('qrLabel', e.target.value)} placeholder="Highlight reel" /></div>
          <div><label className={label}>Second code opens</label><input className={input} value={v.qr2Link} onChange={e => set('qr2Link', e.target.value)} placeholder="https://…" /></div>
          <div><label className={label}>Caption under it</label><input className={input} value={v.qr2Label} onChange={e => set('qr2Label', e.target.value)} placeholder="Follow us" /></div>
        </div>
      </div>

      {v.playerName && (
        <button type="button" onClick={() => onChange({ ...EMPTY })}
          className="inline-flex items-center gap-1.5 mt-4 text-xs font-semibold text-slate-500 hover:text-slate-700">
          <X size={13} /> Clear the example (back to the drawn stand-in)
        </button>
      )}
    </div>
  )
}
