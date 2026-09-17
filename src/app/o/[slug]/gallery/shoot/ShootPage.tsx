'use client'
import { useState } from 'react'
import { Camera, Check, Info, Lock, Plus, ShieldCheck, Instagram, Handshake } from 'lucide-react'
import type { MediaConfig } from '@/lib/mediaForm'
import { commitmentLines, levelAsks } from '@/lib/mediaForm'
import CredentialPreview from './CredentialPreview'

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
  /** What the invite email already knew about them. Someone who was asked by
   *  name should not have to type that name back in. */
  prefill?: { name?: string; company?: string; email?: string }
  liveStats: { teams: number; clubs: number; events: number }
}

const input = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-[15px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500'
const label = 'block text-[12.5px] font-semibold text-slate-700 mb-1.5'
const num = (n: number) => n.toLocaleString('en-US')

export default function ShootPage(p: Props) {
  const [f, setF] = useState({
    name: p.prefill?.name || '', company: p.prefill?.company || '', email: p.prefill?.email || '',
    phone: '', portfolio: '', instagram: '',
    gear: '', shoots: '', insurance: '', notes: '',
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
            agreedCommitments: commits.join(' | '),
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

  const commits = commitmentLines(p.cfg.commitments)

  // The card builds as they type. Everything on it comes from the form except the
  // credential id and the approval, which are set by us — that is the whole point of
  // showing it: they can see exactly what they are applying for.
  const chosen = p.events.filter(e => eventIds.includes(e.id))
  const cardData = {
    code: '',
    role: 'media' as const,
    status: 'pending' as const,
    name: f.name,
    business: f.company,
    title: levels.includes('sell') ? 'Photographer \u00b7 Sales' : levels.includes('book') ? 'Photographer \u00b7 Bookings' : 'Photographer',
    photoUrl: '',
    eventNames: chosen.map(e => e.name).join(', '),
    eventDates: chosen.length === 1 ? chosen[0].dates : chosen.length > 1 ? `${chosen.length} events` : '',
    location: '',
    clearances: p.cfg.levels.filter(l => levels.includes(l.id)).map(l => l.name),
    orgName: p.orgName,
    orgLogoUrl: p.orgLogo,
    orgSite: '',
    qrLabel: 'My credential',
    qr2Label: p.cfg.commitments.socialHandle ? `Follow @${p.cfg.commitments.socialHandle}` : 'Event info',
    issuedOn: '',
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

      {/* What we ask in return. Stated up front and as numbers -- a credential is a
          trade, and the people worth having on your sideline would rather know the terms than
          be chased for photos afterwards. */}
      {commits.length > 0 && (
        <section className="max-w-5xl mx-auto px-6 py-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-1.5">
              <Handshake size={18} className="text-teal-600" />
              <h2 className="text-[22px] font-bold tracking-tight text-slate-900">What we ask in return</h2>
            </div>
            <p className="text-slate-500 text-[14.5px] mb-5 max-w-[62ch]">
              The credential is free because it&rsquo;s a trade. Here is our half of it, in numbers rather than good intentions.
            </p>
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
              {commits.map((c, i) => (
                <li key={i} className="flex gap-2.5 text-[15px] text-slate-700">
                  <span className="mt-1 w-[17px] h-[17px] rounded-full bg-teal-100 border border-teal-300 shrink-0 flex items-center justify-center">
                    <Check size={11} className="text-teal-700" strokeWidth={3} />
                  </span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            {p.cfg.commitments.socialHandle && (
              <p className="text-[13.5px] text-slate-500 mt-5 pt-4 border-t border-slate-100 leading-relaxed">
                <Instagram size={13} className="inline -mt-0.5 mr-1.5 text-slate-400" />
                A Collab post runs on both grids at once and shares its likes and comments. Instagram only
                lets whoever makes the post send the invite, so on yours it has to come from you — which is
                where it matters anyway: it puts your name in front of an audience that has not seen your
                work. Our account is{' '}
                <a href={`https://instagram.com/${p.cfg.commitments.socialHandle}`} target="_blank" rel="noreferrer"
                  className="font-semibold text-teal-700 hover:text-teal-900">@{p.cfg.commitments.socialHandle}</a>.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Application */}
      <section id="apply" className="max-w-2xl mx-auto px-6 py-14 scroll-mt-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Media credential application</h2>
        <p className="text-slate-500 text-[14.5px] mt-1.5">{p.cfg.approvalNotice}</p>

        <div className="mt-7 grid lg:grid-cols-[1fr_300px] lg:gap-10 items-start">
        <form onSubmit={submit} className="space-y-4 order-2 lg:order-1">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Your name *</label><input className={input} required value={f.name} onChange={e => set('name', e.target.value)} /></div>
            <div><label className={label}>Business name <span className="font-normal text-slate-400">if any</span></label><input className={input} value={f.company} onChange={e => set('company', e.target.value)} /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className={label}>Email *</label><input className={input} type="email" required value={f.email} onChange={e => set('email', e.target.value)} /></div>
            <div><label className={label}>Phone *</label><input className={input} type="tel" required value={f.phone} onChange={e => set('phone', e.target.value)} /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Portfolio link * <span className="font-normal text-slate-400">what we judge you on</span></label>
              <input className={input} required placeholder="yoursite.com" value={f.portfolio} onChange={e => set('portfolio', e.target.value)} />
            </div>
            <div>
              {/* Asked for on its own, not folded into the portfolio link: we need the
                  handle itself to tag them and send Collab invites. */}
              <label className={label}>Instagram handle {p.cfg.commitments.socialHandle ? '*' : <span className="font-normal text-slate-400">optional</span>}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[15px]">@</span>
                <input className={`${input} pl-7`} required={!!p.cfg.commitments.socialHandle} placeholder="yourhandle"
                  value={f.instagram} onChange={e => set('instagram', e.target.value.replace(/^@/, ''))} />
              </div>
            </div>
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
              {p.cfg.levels.map(l => {
                const asks = levelAsks(l.id, p.cfg.commitments)
                const on = levels.includes(l.id)
                return (
                <div key={l.id} className={`border rounded-xl overflow-hidden transition-colors ${l.closed ? 'border-slate-200 bg-slate-50' : on ? 'border-teal-500 bg-teal-50/60' : 'border-slate-200'}`}>
                  <label className={`flex gap-3 items-start px-3.5 py-3 ${l.closed ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
                    <input type="checkbox" className="mt-1 accent-teal-600 w-4 h-4 shrink-0" disabled={l.closed}
                      checked={on} onChange={() => toggle(levels, setLevels, l.id)} />
                    <span className="min-w-0">
                      <span className="block font-semibold text-[14.5px] text-slate-900">
                        {l.name}
                        {l.status && (
                          <span className={`ml-2 align-middle text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${l.closed ? 'text-violet-700 bg-violet-50 border border-violet-200' : l.gate ? 'text-amber-700 bg-amber-50 border border-amber-200' : 'text-teal-700 bg-teal-50 border border-teal-200'}`}>
                            {l.status}
                          </span>
                        )}
                      </span>
                      <span className="block text-[12.5px] text-slate-500 mt-0.5 leading-relaxed">
                        {l.id === 'sell' && !l.closed ? l.note.replace(/most of it/, `${p.keepPct}%`) : l.note}
                      </span>
                      {/* The badge is the reward made visible. A line of text
                          saying you become certified is abstract; the thing you
                          would actually wear is not. */}
                      {l.badge && !l.closed && (
                        <span className="inline-flex items-center gap-1.5 mt-2.5 bg-slate-900 text-white rounded-full px-3 py-1.5 text-[12px] font-semibold">
                          <ShieldCheck size={13} className="shrink-0 text-teal-300" />
                          {l.badge.replace('{org}', p.orgName || 'Certified').trim()}
                        </span>
                      )}
                      {/* The misreading worth heading off sits with the offer, not
                          in the gate below it: someone who thinks we are gating
                          their business stops reading before the gate. */}
                      {l.clarify && (
                        <span className="flex gap-2 items-start mt-2.5 rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-2 text-[12px] leading-relaxed text-slate-600">
                          <Info size={13} className="shrink-0 mt-0.5 text-teal-600" />
                          <span>{l.clarify}</span>
                        </span>
                      )}
                    </span>
                  </label>
                  {l.gate && (
                    <div className="flex gap-2 items-start border-t border-dashed border-slate-200 mx-3.5 py-2.5 text-[12px] leading-relaxed text-slate-600">
                      <Lock size={13} className="shrink-0 mt-0.5 text-amber-600" />
                      <span>{l.gate}</span>
                    </div>
                  )}
                  {asks.length > 0 && (
                    <div className="border-t border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">What we ask, on top</p>
                      <ul className="space-y-1">
                        {asks.map((a, i) => (
                          <li key={i} className="flex gap-2 text-[12.5px] text-slate-600 leading-relaxed">
                            <Plus size={12} className="shrink-0 mt-1 text-amber-600" />
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {/* Stills or video is a coverage question, not a nicety: the ask is
                worded "photos or clips", the gallery has its own video album, and
                without this Bo can credential eight stills shooters and nobody
                filming and only find out on the day (Bo, Sep 17 2026). Asked as
                one control so it captures what they CAN do and which they are
                better at in a single answer. */}
            <div>
              <label className={label}>Stills or video? <span className="font-normal text-slate-400">what you are strongest at</span></label>
              <select className={input} value={f.shoots} onChange={e => set('shoots', e.target.value)}>
                <option value="">Select…</option>
                <option>Mostly stills</option>
                <option>Mostly video</option>
                <option>Both, equally comfortable</option>
              </select>
            </div>
            {/* "Primary gear / body and longest lens" read like shorthand between
                two people who already know each other. The question is a real
                screen -- a kit lens does not reach from a sideline -- so it is
                worth asking in words a professional would use. */}
            <div><label className={label}>Camera and lenses <span className="font-normal text-slate-400">body, and your longest lens</span></label><input className={input} value={f.gear} onChange={e => set('gear', e.target.value)} placeholder="e.g. Canon R6 · 70-200mm f/2.8" /></div>
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
            {commits.length > 0 && (
              <p><strong className="text-slate-900">Your half of the trade.</strong> {commits.join('. ')}.</p>
            )}
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

        <aside className="order-1 lg:order-2 mb-8 lg:mb-0 lg:sticky lg:top-6">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-2.5">Your credential</div>
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
            <CredentialPreview p={cardData} qrText="" qr2Text={p.cfg.commitments.socialHandle ? `https://instagram.com/${p.cfg.commitments.socialHandle}` : ''} />
          </div>
          <p className="text-[12.5px] text-slate-500 mt-3 leading-relaxed">
            Builds itself as you type. It says <strong className="text-slate-700">not valid yet</strong> until we approve you &mdash;
            then the colour turns on, the credential number is set, and you can print it.
          </p>
        </aside>
        </div>
      </section>
    </div>
  )
}
