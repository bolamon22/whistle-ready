'use client'

import { useMemo, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { Camera, CheckCircle2, Shield } from 'lucide-react'
import { uploadPlayerPhoto } from '@/lib/photoClient'
import CredentialPreview from '@/app/o/[slug]/gallery/shoot/CredentialPreview'
import type { ClubOption } from '@/app/o/[slug]/register/player/PlayerRegForm'
import {
  COACH_ROLES, COACH_LEVELS, COACH_CERTS, CERT_SHORT,
  COACH_SIGNATURE_PROMPT, COACH_WAIVER_VERSION,
  type CoachConfig, type WaiverSection,
} from '@/lib/coachForm'

// Coach waiver + sideline credential.
//
// TEAMS ARE A MULTI-SELECT, unlike the player form's single team. A coach can be
// on the sideline for three teams in a weekend and should carry ONE credential
// listing all of them rather than three cards to lose.
//
// The credential is the same CredentialCard the media and vendor passes use, so
// a gate marshal reads one layout all weekend; the role band is what differs.
// It stays `pending` — visibly colourless — until all three agreements are
// ticked and the typed signature matches the name at the top. That gate is the
// point: someone at the gate only has to read one word.

export type CoachCardContext = {
  eventNames: string
  eventDates: string
  location: string
  orgName: string
  orgLogoUrl: string
  orgSite: string
  passBase: string
}

const digits = (s: string) => s.replace(/\D/g, '')
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim())

type TeamPick = { club: string; team: string; division: string }

export default function CoachRegForm({
  orgId, tournamentId, tournamentName, clubs, cfg, sections, card,
}: {
  orgId: string
  tournamentId: string
  tournamentName: string
  clubs: ClubOption[]
  cfg: CoachConfig
  sections: WaiverSection[]
  card: CoachCardContext
}) {
  const [d, setD] = useState({
    coachFullName: '', email: '', mobilePhone: '', clubName: '', coachingRole: '',
    division: '', emergencyContactName: '', emergencyContactPhone: '',
    accommodationStatus: '', highestLevelCoached: '', signature: '',
  })
  const [picks, setPicks] = useState<TeamPick[]>([])
  const [certs, setCerts] = useState<string[]>([])
  const [agreed, setAgreed] = useState<Record<string, boolean>>({})
  const [photoUrl, setPhotoUrl] = useState('')
  const [divTouched, setDivTouched] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof typeof d) => (e: { target: { value: string } }) =>
    setD(p => ({ ...p, [k]: e.target.value }))

  const key = (t: TeamPick) => `${t.club}||${t.team}||${t.division}`
  const isPicked = (t: TeamPick) => picks.some(x => key(x) === key(t))

  function toggleTeam(t: TeamPick) {
    setPicks(prev => {
      const next = isPicked(t) ? prev.filter(x => key(x) !== key(t)) : [...prev, t]
      // Division follows the teams chosen, until the coach edits it themselves —
      // someone spanning two age groups needs to be able to write their own.
      if (!divTouched) {
        const ds: string[] = []
        next.forEach(x => { if (x.division && !ds.includes(x.division)) ds.push(x.division) })
        setD(p => ({ ...p, division: ds.join(', ') }))
      }
      // The club line on the credential follows the first team picked, unless
      // they typed something.
      if (next.length && !d.clubName) setD(p => ({ ...p, clubName: next[0].club }))
      return next
    })
  }

  async function pickPhoto(file: File) {
    setPhotoBusy(true)
    try { setPhotoUrl(await uploadPlayerPhoto(file)) }
    catch (e: any) { toast.error(e?.message || 'Could not upload the photo') }
    finally { setPhotoBusy(false); if (photoRef.current) photoRef.current.value = '' }
  }

  const sigOk = !!norm(d.signature) && norm(d.signature) === norm(d.coachFullName)
  const allAgreed = sections.every(s => agreed[s.key])
  const ready = allAgreed && sigOk

  const missing = useMemo(() => {
    const m: string[] = []
    if (!d.coachFullName.trim()) m.push('your name')
    if (!isEmail(d.email)) m.push('a valid email')
    if (digits(d.mobilePhone).length < 10) m.push('a 10-digit mobile')
    if (!d.clubName.trim()) m.push('your club')
    if (!d.coachingRole) m.push('your role')
    if (!picks.length) m.push('at least one team')
    if (!d.emergencyContactName.trim() || digits(d.emergencyContactPhone).length < 10) m.push('an emergency contact')
    if (cfg.hotelQuestion && !d.accommodationStatus) m.push('the hotel question')
    const n = sections.filter(s => agreed[s.key]).length
    if (n < sections.length) m.push(`${sections.length - n} of ${sections.length} agreements`)
    if (!sigOk) m.push('a signature matching your name')
    return m
  }, [d, picks, agreed, sigOk, sections, cfg.hotelQuestion])

  async function submit() {
    if (missing.length || saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/org-forms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          formType: 'coach',
          data: {
            ...d,
            photoUrl,
            tournamentId,
            tournamentName,
            // teamName in the same "Club — Team" shape the player waiver files
            // under, so club-scoped matching and the waiver counts keep working.
            // Every team they cover rides in teams[].
            teamName: picks.length ? `${picks[0].club} — ${picks[0].team}` : '',
            teams: picks,
            certifications: certs,
            agreements: sections.map(s => ({ key: s.key, title: s.title, agreed: !!agreed[s.key] })),
            waiverVersion: COACH_WAIVER_VERSION,
          },
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j?.error || 'Could not submit — try again'); return }
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      toast.error('Could not submit — try again')
    } finally {
      setSaving(false)
    }
  }

  const lab = 'block text-xs font-semibold text-slate-600 mb-1.5'
  const inp = 'w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500'
  const card_ = 'bg-white rounded-2xl border border-slate-200 shadow-sm mb-5 overflow-hidden'
  const hd = 'px-6 py-4 border-b border-slate-100 text-sm font-bold text-slate-900'

  const credential = {
    code: '',
    role: 'coach' as const,
    status: (ready ? 'approved' : 'pending') as 'approved' | 'pending',
    name: d.coachFullName || 'Your name',
    business: d.clubName || '',
    title: d.coachingRole || 'Coach',
    photoUrl,
    eventNames: card.eventNames,
    eventDates: card.eventDates,
    location: card.location,
    // At most three fit on the badge; the rest live on the submission.
    clearances: picks.slice(0, 3).map(t => t.team),
    orgName: card.orgName,
    orgLogoUrl: card.orgLogoUrl,
    orgSite: card.orgSite,
    qrLabel: 'Check in',
    qr2Label: card.orgSite || card.orgName,
    issuedOn: ready ? new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '',
  }

  if (done) {
    return (
      <div className="max-w-2xl mx-auto px-5 py-16 text-center">
        <Toaster />
        <CheckCircle2 size={44} className="mx-auto text-emerald-500" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">{cfg.confirmationTitle}</h1>
        <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">{cfg.confirmationMessage}</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-5 pt-8 pb-20">
      <Toaster />
      <header className="mb-6">
        <p className="text-[11px] font-bold tracking-[0.11em] uppercase text-teal-600 mb-1.5">{card.orgName}</p>
        <h1 className="text-[27px] leading-tight font-extrabold text-slate-900 tracking-tight">{cfg.title}</h1>
        <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">{cfg.intro}</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_332px] gap-6 items-start">
        <div>
          <section className={card_}>
            <h2 className={hd}>Coach &amp; Contact</h2>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={lab}>Coach Full Name <span className="text-rose-500">*</span></label>
                <input className={inp} value={d.coachFullName} onChange={set('coachFullName')} autoComplete="name" />
              </div>
              <div>
                <label className={lab}>Email Address <span className="text-rose-500">*</span></label>
                <input type="email" className={inp} value={d.email} onChange={set('email')} autoComplete="email" />
                {!!d.email && !isEmail(d.email) && <p className="text-xs text-rose-600 mt-1.5">Enter a working email — your credential is sent here.</p>}
              </div>
              <div>
                <label className={lab}>Mobile Phone <span className="text-rose-500">*</span></label>
                <input type="tel" className={inp} value={d.mobilePhone} onChange={set('mobilePhone')} autoComplete="tel" />
                {!!d.mobilePhone && digits(d.mobilePhone).length < 10 && <p className="text-xs text-rose-600 mt-1.5">Ten digits, please — game-day changes go out by text.</p>}
              </div>

              <div className="sm:col-span-2">
                <label className={lab}>Teams You Are Coaching <span className="text-rose-500">*</span></label>
                <div className="border border-slate-300 rounded-xl max-h-60 overflow-y-auto bg-white">
                  {clubs.map(c => (
                    <div key={c.name}>
                      <div className="sticky top-0 bg-slate-100 text-[11px] font-bold tracking-wider uppercase text-slate-500 px-3 py-1.5">{c.name}</div>
                      {c.teams.map(t => {
                        const pick = { club: c.name, team: t.name, division: t.division }
                        return (
                          <label key={t.id} className="flex items-center gap-2.5 px-3 py-2 text-sm cursor-pointer border-b border-slate-50 last:border-b-0 hover:bg-teal-50">
                            <input type="checkbox" className="accent-teal-600 w-4 h-4 shrink-0" checked={isPicked(pick)} onChange={() => toggleTeam(pick)} />
                            <span className="flex-1 truncate">{t.name}</span>
                            <span className="text-[11px] text-slate-400 shrink-0">{t.division}</span>
                          </label>
                        )
                      })}
                    </div>
                  ))}
                  {!clubs.length && <p className="text-xs text-slate-400 p-4 text-center">No teams registered for this event yet.</p>}
                </div>
                <p className="text-xs text-slate-400 mt-1.5">The same list the players pick from. Tick every team you will be on the sideline for — you get one credential covering all of them.</p>
              </div>

              <div>
                <label className={lab}>Club / Organization <span className="text-rose-500">*</span></label>
                <input className={inp} value={d.clubName} onChange={set('clubName')} />
              </div>
              <div>
                <label className={lab}>Coaching Role <span className="text-rose-500">*</span></label>
                <select className={inp} value={d.coachingRole} onChange={set('coachingRole')}>
                  <option value="">Select…</option>
                  {COACH_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={lab}>Team Division / Age Group</label>
                <input className={inp} value={d.division}
                  onChange={e => { setDivTouched(true); setD(p => ({ ...p, division: e.target.value })) }} />
                <p className="text-xs text-slate-400 mt-1.5">Filled in from the teams you picked — edit it if you span more than one.</p>
              </div>

              <div>
                <label className={lab}>Emergency Contact Name <span className="text-rose-500">*</span></label>
                <input className={inp} value={d.emergencyContactName} onChange={set('emergencyContactName')} />
              </div>
              <div>
                <label className={lab}>Emergency Contact Phone <span className="text-rose-500">*</span></label>
                <input type="tel" className={inp} value={d.emergencyContactPhone} onChange={set('emergencyContactPhone')} />
              </div>

              {cfg.hotelQuestion && (
                <div className="sm:col-span-2">
                  <label className={lab}>Is your team staying at a hotel or vacation rental during the tournament? <span className="text-rose-500">*</span></label>
                  <select className={inp} value={d.accommodationStatus} onChange={set('accommodationStatus')}>
                    <option value="">Select…</option>
                    <option>Yes</option><option>No</option><option>Maybe</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1.5">Goes to our housing partner so they can hold rooms for your families.</p>
                </div>
              )}

              {cfg.photo && (
                <div className="sm:col-span-2">
                  <label className={lab}>Credential Photo <span className="font-medium text-slate-400">— optional</span></label>
                  <label className="flex items-center gap-2 text-sm text-slate-600 border border-dashed border-slate-300 rounded-xl px-3 py-2.5 cursor-pointer hover:border-teal-400">
                    <Camera size={15} className="text-slate-400" />
                    {photoBusy ? 'Uploading…' : photoUrl ? 'Photo added — choose another' : 'Add a photo'}
                    <input ref={photoRef} type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) pickPhoto(f) }} />
                  </label>
                  <p className="text-xs text-slate-400 mt-1.5">A face on the credential makes you checkable at the gate in a second.</p>
                </div>
              )}
            </div>
          </section>

          {cfg.qualifications && (
            <section className={card_}>
              <h2 className={hd}>Experience &amp; Certifications <span className="font-semibold text-slate-400">— optional</span></h2>
              <div className="p-6">
                <p className="text-[13px] text-slate-500 mb-4">None of this affects your credential. It helps us put the right officials on the right games.</p>
                <div className="max-w-md mb-4">
                  <label className={lab}>Highest Level Coached</label>
                  <select className={inp} value={d.highestLevelCoached} onChange={set('highestLevelCoached')}>
                    <option value="">Prefer not to say</option>
                    {COACH_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <label className={lab}>Coaching &amp; Safety Certifications</label>
                <div className="grid gap-2">
                  {COACH_CERTS.map(c => {
                    const on = certs.includes(c)
                    return (
                      <label key={c} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm cursor-pointer transition-colors ${on ? 'border-teal-300 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}>
                        <input type="checkbox" className="accent-teal-600 w-4 h-4" checked={on}
                          onChange={() => setCerts(p => on ? p.filter(x => x !== c) : [...p, c])} />
                        {c}
                      </label>
                    )
                  })}
                </div>
              </div>
            </section>
          )}

          <section className={card_}>
            <h2 className={hd}>Waiver &amp; Agreements</h2>
            <div className="p-6">
              <p className="text-[13px] text-slate-500 mb-4">
                All {sections.length} are required. Your credential stays <strong className="text-slate-700">pending</strong> until every box is ticked and signed.
              </p>

              {sections.map((s, i) => (
                <div key={s.key} className="border border-slate-200 rounded-xl mb-3.5 overflow-hidden">
                  <div className="flex gap-3 items-start px-4 py-3.5 bg-slate-50 border-b border-slate-100">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900 leading-snug">{s.title}</span>
                      <span className="block text-[12.5px] text-slate-500 mt-0.5">{s.intro}</span>
                    </span>
                  </div>
                  {/* Scrollable, not collapsed. A clause one click away is a weaker
                      clause if the release is ever tested. */}
                  <div className="px-4 py-4 max-h-64 overflow-y-auto">
                    {s.body.map((para, k) => (
                      <p key={k} className="text-[13.5px] leading-relaxed text-slate-600 mb-2.5 last:mb-0">{para}</p>
                    ))}
                  </div>
                  <div className="px-4 py-3 border-t border-slate-100 bg-slate-50">
                    <label className={`flex gap-2.5 items-start px-3 py-2.5 rounded-lg border text-sm cursor-pointer transition-colors ${agreed[s.key] ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                      <input type="checkbox" className="accent-teal-600 w-4 h-4 mt-0.5 shrink-0" checked={!!agreed[s.key]}
                        onChange={e => setAgreed(p => ({ ...p, [s.key]: e.target.checked }))} />
                      {s.agree}
                    </label>
                  </div>
                </div>
              ))}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-[13px] text-slate-500 mb-3">{COACH_SIGNATURE_PROMPT}</p>
                <input className={`${inp} font-serif italic text-xl`} value={d.signature} onChange={set('signature')}
                  placeholder={d.coachFullName || 'Your full legal name'} />
                {!!d.signature && !sigOk && <p className="text-xs text-rose-600 mt-1.5">Your signature has to match the name you entered at the top.</p>}
              </div>

              <div className="flex gap-3.5 items-center flex-wrap mt-5">
                <button onClick={submit} disabled={!!missing.length || saving}
                  className="bg-slate-900 text-white rounded-xl px-7 py-3 text-[15px] font-bold hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors">
                  {saving ? 'Submitting…' : 'Submit & get my credential'}
                </button>
                <div className={`flex-1 min-w-[210px] text-[12.5px] rounded-xl px-3.5 py-2.5 border ${missing.length ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
                  {missing.length ? `Still needed: ${missing.join(', ')}.` : 'All set — your credential is ready to issue.'}
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-5 order-first lg:order-none">
          <p className="text-[11px] font-bold tracking-[0.11em] uppercase text-slate-400 mb-2 pl-0.5">Your credential</p>
          <CredentialPreview
            p={credential}
            qrText={`${card.passBase}/coach/pending`}
            qr2Text={card.orgSite ? `https://${card.orgSite}` : card.passBase}
            className="shadow-xl"
          />
          <p className="text-xs text-slate-400 mt-3 px-0.5 leading-relaxed flex gap-2">
            <Shield size={13} className="shrink-0 mt-0.5 text-slate-300" />
            <span>
              {ready
                ? 'Signed. Submit and the scannable version is emailed to you.'
                : 'It stays grey until the waiver is signed — that is what the gate checks.'}
              {certs.length > 0 && ` Certified: ${certs.map(c => CERT_SHORT[c] || c).join(', ')}.`}
            </span>
          </p>
        </aside>
      </div>
    </div>
  )
}
