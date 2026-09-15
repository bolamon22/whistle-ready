'use client'
import { useMemo, useState } from 'react'
import { Check, Instagram, Globe, MapPin } from 'lucide-react'
import type { Photographer, PhotoPackage } from '@/lib/photographers'
import { packagePrice, displayName } from '@/lib/photographers'

type OrgEvent = { id: string; name: string; dates: string }
type Props = {
  orgId: string
  orgName: string
  photographer: Photographer
  events: OrgEvent[]
  /** teamName -> division, for the club autocomplete and the division auto-fill. */
  teamsByEvent: Record<string, { name: string; division: string }[]>
  disclaimer: string
}

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500'
const label = 'block text-[12.5px] font-semibold text-slate-700 mb-1.5'

export default function BookingForm(p: Props) {
  const ph = p.photographer
  const [eventId, setEventId] = useState(p.events[0]?.id || '')
  const [pkgId, setPkgId] = useState(ph.packages[0]?.id || '')
  const [f, setF] = useState({
    contactName: '', phone: '', email: '',
    playerName: '', club: '', division: '', jersey: '', notes: '',
  })
  const set = (k: keyof typeof f, v: string) => setF(s => ({ ...s, [k]: v }))
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const ev = p.events.find(e => e.id === eventId) || null
  const pkg: PhotoPackage | null = ph.packages.find(x => x.id === pkgId) || null
  const teams = useMemo(() => p.teamsByEvent[eventId] || [], [p.teamsByEvent, eventId])

  // Picking a registered team fills the division in. The old form asked for both
  // and got them typed inconsistently ("14U", "U14", "u-14") on every submission.
  function onClub(v: string) {
    set('club', v)
    const hit = teams.find(t => t.name.toLowerCase() === v.trim().toLowerCase())
    if (hit?.division) set('division', hit.division)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr('')
    if (!eventId) { setErr('Pick an event.'); return }
    if (!pkg) { setErr('Pick a package.'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/org-forms/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: p.orgId, formType: 'photo-request',
          data: {
            ...f,
            photographerSlug: ph.slug,
            photographerName: displayName(ph),
            photographerEmail: ph.bookingEmail,
            packageId: pkg.id,
            packageName: pkg.name,
            packagePrice: pkg.price,
            tournamentId: eventId,
            tournamentName: ev?.name || '',
          },
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not send that')
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong. Try again, or email them directly.')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-6 py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto mb-5"><Check size={26} /></div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Request sent</h1>
        <p className="text-slate-600 mt-3 leading-relaxed">
          {displayName(ph)} has it and will reply to you directly{f.email ? ` at ${f.email}` : ''}.
          {ev ? ` See you at ${ev.name}.` : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Cover + identity */}
      <div className="bg-slate-900">
        {ph.coverUrl && <div className="h-36 sm:h-44 bg-cover bg-center opacity-80" style={{ backgroundImage: `url(${ph.coverUrl})` }} />}
      </div>
      <div className="max-w-4xl mx-auto px-6">
        <div className={ph.coverUrl ? '-mt-10' : 'pt-10'}>
          {ph.avatarUrl
            ? <img src={ph.avatarUrl} alt="" className="w-20 h-20 rounded-2xl object-cover border-4 border-slate-50 bg-white shadow-sm" />
            : <div className="w-20 h-20 rounded-2xl bg-slate-900 text-teal-300 border-4 border-slate-50 flex items-center justify-center text-2xl font-extrabold shadow-sm">
                {displayName(ph).slice(0, 2).toUpperCase()}
              </div>}
        </div>
        <div className="mt-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl sm:text-[27px] font-extrabold tracking-tight text-slate-900">{displayName(ph)}</h1>
            <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-2.5 py-1 text-[11px] font-bold">
              <Check size={11} strokeWidth={3} /> Credentialed by {p.orgName}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-slate-500 mt-2">
            {ph.business && ph.name && ph.business !== ph.name && <span>{ph.name}</span>}
            {ph.location && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {ph.location}</span>}
            {ph.website && <a href={/^https?:/.test(ph.website) ? ph.website : `https://${ph.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900"><Globe size={12} /> Website</a>}
            {ph.instagram && <a href={`https://instagram.com/${ph.instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900"><Instagram size={12} /> @{ph.instagram}</a>}
          </div>
          {ph.bio && <p className="text-[15px] text-slate-600 mt-4 max-w-[62ch] leading-relaxed">{ph.bio}</p>}
        </div>

        {ph.samples.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mt-6">
            {ph.samples.slice(0, 6).map((u, i) => (
              <div key={i} className="aspect-square rounded-xl bg-slate-200 bg-cover bg-center" style={{ backgroundImage: `url(${u})` }} />
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-[1fr_.9fr] gap-8 md:gap-10 mt-10 pb-16 items-start">
          {/* Packages */}
          <div>
            <h2 className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">Packages</h2>
            <div className="space-y-2.5">
              {ph.packages.map(x => (
                <button key={x.id} type="button" onClick={() => setPkgId(x.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition-all ${pkgId === x.id ? 'border-teal-500 bg-white ring-1 ring-teal-500' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <span className="flex items-baseline justify-between gap-4">
                    <span className="font-bold text-slate-900 text-[15px]">{x.name}</span>
                    <span className={`font-extrabold tabular-nums whitespace-nowrap ${x.price > 0 ? 'text-teal-700' : 'text-slate-400 text-[14px]'}`}>{packagePrice(x)}</span>
                  </span>
                  {x.note && <span className="block text-[13px] text-slate-500 mt-1.5 leading-relaxed">{x.note}</span>}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-3 leading-relaxed">{p.disclaimer}</p>
          </div>

          {/* The request */}
          <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
            <h2 className="text-lg font-bold text-slate-900">Request a shoot</h2>
            <p className="text-[13px] text-slate-500 mt-1 mb-4">Goes straight to {displayName(ph)}. They reply to you directly.</p>

            <div className="space-y-3.5">
              <div>
                <label className={label}>Event *</label>
                <select className={input} required value={eventId} onChange={e => { setEventId(e.target.value); set('club', ''); set('division', '') }}>
                  {p.events.length === 0 && <option value="">No events open right now</option>}
                  {p.events.map(e => <option key={e.id} value={e.id}>{e.name}{e.dates ? ` · ${e.dates}` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Package *</label>
                <select className={input} required value={pkgId} onChange={e => setPkgId(e.target.value)}>
                  {ph.packages.map(x => <option key={x.id} value={x.id}>{x.name}{x.price > 0 ? ` — ${packagePrice(x)}` : ''}</option>)}
                </select>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className={label}>Your name *</label><input className={input} required value={f.contactName} onChange={e => set('contactName', e.target.value)} /></div>
                <div><label className={label}>Phone *</label><input className={input} type="tel" required value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
              </div>
              <div><label className={label}>Email *</label><input className={input} type="email" required value={f.email} onChange={e => set('email', e.target.value)} /></div>

              <div className="pt-1 border-t border-slate-100" />
              <div><label className={label}>Player name *</label><input className={input} required value={f.playerName} onChange={e => set('playerName', e.target.value)} /></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Club / team *</label>
                  <input className={input} required list="teams-list" value={f.club} onChange={e => onClub(e.target.value)}
                    placeholder={teams.length ? 'Start typing…' : ''} />
                  <datalist id="teams-list">
                    {teams.map(t => <option key={t.name} value={t.name} />)}
                  </datalist>
                </div>
                <div><label className={label}>Division *</label><input className={input} required value={f.division} onChange={e => set('division', e.target.value)} placeholder="e.g. Boys HS A" /></div>
              </div>
              <div>
                <label className={label}>Jersey number <span className="font-normal text-slate-400">if you know it</span></label>
                <input className={input} inputMode="numeric" value={f.jersey} onChange={e => set('jersey', e.target.value)} />
              </div>
              <div>
                <label className={label}>Anything else</label>
                <textarea className={`${input} min-h-[76px]`} value={f.notes} onChange={e => set('notes', e.target.value)}
                  placeholder="Sibling on another team? Specific game you want covered?" />
              </div>
            </div>

            {err && <p className="text-[14px] text-red-600 bg-red-50 border border-red-200 rounded-lg px-3.5 py-2.5 mt-4">{err}</p>}

            <button type="submit" disabled={busy || !p.events.length}
              className="w-full mt-5 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-bold rounded-full py-3.5 transition-colors">
              {busy ? 'Sending…' : pkg && pkg.price > 0 ? `Request ${pkg.name} · ${packagePrice(pkg)}` : 'Send request'}
            </button>
            <p className="text-[11.5px] text-slate-400 text-center mt-2.5">Nothing is charged here. They confirm price and details with you first.</p>
          </form>
        </div>
      </div>
    </div>
  )
}
