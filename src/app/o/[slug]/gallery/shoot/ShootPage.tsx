'use client'
import { useState } from 'react'
import { Camera, Check, Lock } from 'lucide-react'
import type { MediaConfig } from '@/lib/mediaForm'

type OrgEvent = { id: string; name: string; dates: string }
type Props = {
  orgId: string
  orgName: string
  orgLogo: string
  contactEmail: string
  cfg: MediaConfig
  keepPct: number
  events: OrgEvent[]
  /** Preselected weekends. Arriving from an event page means that one. */
  defaultEventIds?: string[]
  liveStats: { teams: number; clubs: number; events: number }
}

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500'
const label = 'block text-[12.5px] font-semibold text-slate-700 mb-1.5'
const num = (n: number) => n.toLocaleString('en-US')

export default function ShootPage(p: Props) {
  const [f, setF] = useState({
    name: '', company: '', email: '', phone: '', portfolio: '',
    gear: '', insurance: '', notes: '',
  })
  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }))
  const [eventIds, setEventIds] = useState<string[]>(p.defaultEventIds?.length ? p.defaultEventIds : p.events.map(e => e.id))
  // Contributing is the point of the credential, so it starts ticked; the other
  // two are opt-in and one of them may be closed.
  const [levels, setLevels] = useState<string[]>(['contribute'])
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const toggle = (arr: string[], setArr: (v: string[]) => void, id: string) =>
    setArr(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!eventIds.length) { setErr('Pick at least one event.'); return }
    if (!levels.length) { setErr('Tell us what you want to do.'); return }
    if (!agree) { setErr('Please confirm you have read the terms.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/org-forms/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: p.orgId, formType: 'media',
          data: {
            ...f, tournamentIds: eventIds, levels,
            levelNames: p.cfg.levels.filter(l => levels.includes(l.id)).map(l => l.name).join(', '),
          },
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not send that')
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong. Try again, or email us.')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-20">
        <div className="max-w-lg text-center">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto mb-5"><Check size={26} /></div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">{p.cfg.confirmationTitle}</h1>
          <p className="text-slate-600 mt-3 leading-relaxed">{p.cfg.confirmationMessage}</p>
          {p.contactEmail && (
            <p className="text-sm text-slate-400 mt-6">
              Questions in the meantime? <a href={`mailto:${p.contactEmail}`} className="text-teal-700 underline">{p.contactEmail}</a>
            </p>
          )}
        </div>
      </div>
    )
  }

  const stats: { value: string; label: string }[] = [
    ...(p.liveStats.teams > 0 ? [{ value: num(p.liveStats.teams), label: p.liveStats.teams === 1 ? 'Team' : 'Teams' }] : []),
    ...(p.liveStats.clubs > 0 ? [{ value: num(p.liveStats.clubs), label: p.liveStats.clubs === 1 ? 'Club' : 'Clubs' }] : []),
    ...(p.liveStats.events > 0 ? [{ value: String(p.liveStats.events), label: p.liveStats.events === 1 ? 'Event coming up' : 'Events coming up' }] : []),
    ...p.cfg.stats,
  ]

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <header className="relative bg-slate-950 text-white overflow-hidden">
        {p.cfg.heroImage && (
          <div className="absolute inset-0 bg-cover bg-center opacity-[0.28]" style={{ backgroundImage: `url(${p.cfg.heroImage})` }} aria-hidden />
        )}
        <div className="relative max-w-5xl mx-auto px-6 pt-14 pb-12">
          {p.orgLogo && <img src={p.orgLogo} alt="" className="h-11 w-11 rounded-lg object-contain bg-white p-1 mb-6" />}
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.18em] text-teal-300 border border-teal-300/35 rounded-full px-3 py-1.5 mb-5">
            <Camera size={12} /> Media credentials
          </span>
          <h1 className="text-[clamp(26px,5vw,42px)] font-extrabold tracking-tight leading-[1.08] max-w-[19ch]">{p.cfg.headline}</h1>
          <p className="text-slate-300 text-base sm:text-lg mt-4 max-w-[52ch] leading-relaxed">{p.cfg.subhead}</p>
          <a href="#apply" className="inline-flex items-center gap-2 mt-7 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-full px-7 py-3.5 transition-colors">
            Apply for a credential &rarr;
          </a>
        </div>
        {stats.length > 0 && (
          <div className="relative border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-px bg-white/10">
            {stats.slice(0, 4).map((s, i) => (
              <div key={i} className="bg-slate-950 px-5 py-4">
                <span className="block text-xl font-extrabold tabular-nums">{s.value}</span>
                <span className="block text-[11px] uppercase tracking-wider text-slate-500 mt-1">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </header>

      {/* What you get */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-[22px] font-bold tracking-tight text-slate-900">What you get</h2>
        <ul className="mt-5 grid sm:grid-cols-2 gap-x-8 gap-y-3">
          {p.cfg.benefits.map((b, i) => (
            <li key={i} className="flex gap-2.5 text-[15px] text-slate-600">
              <span className="mt-1 w-[17px] h-[17px] rounded-full bg-teal-100 border border-teal-300 shrink-0 flex items-center justify-center">
                <Check size={11} className="text-teal-700" strokeWidth={3} />
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Levels */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-12">
          <h2 className="text-[22px] font-bold tracking-tight text-slate-900">Pick how far you want to take it</h2>
          <p className="text-slate-500 text-[14.5px] mt-1.5 max-w-[60ch]">
            Every option starts with the same free credential. You are never required to sell anything.
          </p>
          <div className="grid sm:grid-cols-3 gap-3.5 mt-6">
            {p.cfg.levels.map(l => (
              <div key={l.id} className={`rounded-2xl border p-5 ${l.closed ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-start gap-2">
                  {l.closed && <Lock size={13} className="text-slate-400 mt-1 shrink-0" />}
                  <h3 className="font-bold text-slate-900 text-[15.5px] leading-snug">{l.name}</h3>
                </div>
                <p className="text-[13.5px] text-slate-500 mt-2 leading-relaxed">
                  {l.id === 'sell' && !l.closed ? l.note.replace(/most of it/, `${p.keepPct}%`) : l.note}
                </p>
                {l.closed && <span className="inline-block mt-3 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Not open yet</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Application */}
      <section id="apply" className="max-w-2xl mx-auto px-6 py-14 scroll-mt-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Media credential application</h2>
        <p className="text-slate-500 text-[14.5px] mt-1.5">{p.cfg.approvalNotice}</p>

        <form onSubmit={submit} className="mt-7 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Your name *</label><input className={input} required value={f.name} onChange={e => set('name', e.target.value)} /></div>
            <div><label className={label}>Business name <span className="font-normal text-slate-400">if any</span></label><input className={input} value={f.company} onChange={e => set('company', e.target.value)} /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Email *</label><input className={input} type="email" required value={f.email} onChange={e => set('email', e.target.value)} /></div>
            <div><label className={label}>Phone *</label><input className={input} type="tel" required value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
          </div>
          <div>
            <label className={label}>Portfolio or social link * <span className="font-normal text-slate-400">the work you want us to judge you on</span></label>
            <input className={input} required placeholder="instagram.com/… or yoursite.com" value={f.portfolio} onChange={e => set('portfolio', e.target.value)} />
          </div>

          {p.events.length > 0 && (
            <div>
              <label className={label}>Which events are you shooting? *</label>
              <div className="space-y-2">
                {p.events.map(ev => (
                  <label key={ev.id} className={`flex gap-3 items-start border rounded-xl px-3.5 py-3 cursor-pointer transition-colors ${eventIds.includes(ev.id) ? 'border-teal-500 bg-teal-50/60' : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="checkbox" className="mt-1 accent-teal-600 w-4 h-4 shrink-0" checked={eventIds.includes(ev.id)} onChange={() => toggle(eventIds, setEventIds, ev.id)} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-[14.5px] text-slate-900">{ev.name}</span>
                      {ev.dates && <span className="block text-[12.5px] text-slate-500 mt-0.5">{ev.dates}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className={label}>What do you want to do? *</label>
            <div className="space-y-2">
              {p.cfg.levels.map(l => (
                <label key={l.id} className={`flex gap-3 items-start border rounded-xl px-3.5 py-3 transition-colors ${l.closed ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-70' : levels.includes(l.id) ? 'border-teal-500 bg-teal-50/60 cursor-pointer' : 'border-slate-200 hover:border-slate-300 cursor-pointer'}`}>
                  <input type="checkbox" className="mt-1 accent-teal-600 w-4 h-4 shrink-0" disabled={l.closed}
                    checked={levels.includes(l.id)} onChange={() => toggle(levels, setLevels, l.id)} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-[14.5px] text-slate-900">{l.name}</span>
                    <span className="block text-[12.5px] text-slate-500 mt-0.5 leading-relaxed">
                      {l.id === 'sell' && !l.closed ? l.note.replace(/most of it/, `${p.keepPct}%`) : l.note}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Primary gear <span className="font-normal text-slate-400">body and longest lens</span></label><input className={input} value={f.gear} onChange={e => set('gear', e.target.value)} /></div>
            <div>
              <label className={label}>Liability insurance?</label>
              <select className={input} value={f.insurance} onChange={e => set('insurance', e.target.value)}>
                <option value="">Select…</option>
                <option>Yes — I can send a COI</option>
                <option>No</option>
              </select>
            </div>
          </div>
          <div>
            <label className={label}>Anything else <span className="font-normal text-slate-400">optional</span></label>
            <textarea className={`${input} min-h-[84px]`} value={f.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Shot with us before? Working with a club already? Tell us here." />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[12.5px] text-slate-600 leading-relaxed space-y-3">
            <p><strong className="text-slate-900">What you agree to.</strong> {p.cfg.terms}</p>
            <p><strong className="text-slate-900">Photos of minors.</strong> {p.cfg.minorsNotice}</p>
          </div>

          <label className="flex gap-3 items-start border border-slate-200 rounded-xl px-3.5 py-3 cursor-pointer hover:border-slate-300">
            <input type="checkbox" className="mt-1 accent-teal-600 w-4 h-4 shrink-0" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span className="text-[14px] font-semibold text-slate-900">I have read and agree to the above</span>
          </label>

          {err && <p className="text-[14px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5">{err}</p>}

          <button type="submit" disabled={busy}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold rounded-full py-3.5 transition-colors">
            {busy ? 'Sending…' : 'Send my application'}
          </button>
        </form>
      </section>
    </div>
  )
}
