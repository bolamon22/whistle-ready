'use client'

import { useEffect, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { CheckCircle2, Shield, ChevronDown, Check, Camera, Download, ExternalLink, Link2 } from 'lucide-react'
import { uploadPlayerPhoto, uploadClubLogo } from '@/lib/photoClient'
import { cleanCardLink, qrLabelFor } from '@/lib/cardLink'
import type { PassCardData, CardTheme } from '@/lib/playerPassCard'
import CardPreview from './CardPreview'

type Fields = { gender: boolean; grade: boolean; teamName: boolean; parent2: boolean; hotelQuestion: boolean; newsletter: boolean; playerPass?: boolean; position?: boolean }
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const labelCls = 'block text-sm font-medium text-slate-700 mb-1'
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
export const POSITIONS = ['Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO', 'LSM', 'Multiple / not sure']

export type ClubOption = { name: string; logoUrl?: string; teams: { name: string; division: string }[] }
export type FormHeader = { logoUrl: string; title: string; eyebrow?: string }
/** What the live card preview needs that the form doesn't collect: event + org branding, and the event QR. */
export type CardContext = { tournamentName: string; tournamentLogoUrl: string; tournamentDates: string; location: string; orgName: string; orgLogoUrl: string; orgSite: string; eventQrUrl: string; eventQrLabel: string; theme: CardTheme }

// Club identity beside the picker and in the header: the club's logo when its director uploaded
// one at team registration, otherwise an initials badge in a color picked from the name.
const BADGE_COLORS = ['bg-teal-600', 'bg-blue-600', 'bg-indigo-600', 'bg-violet-600', 'bg-rose-600', 'bg-orange-500', 'bg-emerald-600', 'bg-slate-700']
function initials(name: string) { const w = name.trim().split(/\s+/).filter(Boolean); return ((w[0]?.[0] || '') + (w[1]?.[0] || '')).toUpperCase() || '?' }
function badgeColor(name: string) { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return BADGE_COLORS[h % BADGE_COLORS.length] }
function ClubMark({ name, logoUrl, size }: { name: string; logoUrl?: string; size: 'sm' | 'lg' }) {
  const box = size === 'lg' ? 'w-10 h-10 rounded-lg text-sm' : 'w-7 h-7 rounded-md text-[11px]'
  if (logoUrl) return <img src={logoUrl} alt="" className={`${box} object-contain bg-white p-0.5`} />
  return <span className={`${box} ${badgeColor(name)} text-white font-extrabold flex items-center justify-center`}>{initials(name)}</span>
}
const OTHER = '__other'

// The club picker is a custom dropdown (not a native <select>) so each row can show the club's
// logo. Keyboard: arrows move, Enter/Space picks, Escape closes, typing a letter jumps.
function ClubPicker({ clubs, value, otherName, onChange }: { clubs: ClubOption[]; value: string; otherName: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const options: { value: string; label: string; logoUrl?: string }[] = [...clubs.map(c => ({ value: c.name, label: c.name, logoUrl: c.logoUrl })), { value: OTHER, label: 'Other / not listed' }]
  const selected = clubs.find(c => c.name === value)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent | TouchEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('touchstart', onDoc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc) }
  }, [open])
  useEffect(() => {
    if (!open || active < 0) return
    listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])
  const openAt = (i: number) => { setActive(i); setOpen(true) }
  const pick = (v: string) => { onChange(v); setOpen(false) }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = active >= 0 ? active : Math.max(0, options.findIndex(o => o.value === value))
    if (e.key === 'ArrowDown') { e.preventDefault(); openAt(open ? Math.min(options.length - 1, cur + 1) : cur) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); openAt(open ? Math.max(0, cur - 1) : cur) }
    else if (e.key === 'Home' && open) { e.preventDefault(); setActive(0) }
    else if (e.key === 'End' && open) { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open && active >= 0) pick(options[active].value); else openAt(cur) }
    else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false) }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase(), start = open ? cur + 1 : 0
      const i = [...options.keys()].map(j => (start + j) % options.length).find(j => options[j].label.toLowerCase().startsWith(k))
      if (i !== undefined) { if (open) setActive(i); else pick(options[i].value) }
    }
  }
  const mark = value === OTHER && !otherName.trim()
    ? <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-400 flex items-center justify-center"><Shield size={15} /></span>
    : value ? <ClubMark name={selected ? selected.name : otherName} logoUrl={selected?.logoUrl} size="sm" />
    : <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-400 flex items-center justify-center"><Shield size={15} /></span>
  const label = value === OTHER ? 'Other / not listed' : selected ? selected.name : 'Select your club…'
  return (
    <div ref={ref} className="relative">
      <button type="button" role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls="club-picker-list" onClick={() => (open ? setOpen(false) : openAt(Math.max(0, options.findIndex(o => o.value === value))))} onKeyDown={onKeyDown}
        className={`${inputCls} pl-11 pr-9 text-left flex items-center ${open ? 'ring-2 ring-teal-400 border-teal-400' : ''}`}>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">{mark}</span>
        <span className={`truncate ${value ? 'text-slate-900' : 'text-slate-500'}`}>{label}</span>
        <ChevronDown size={16} className={`absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul ref={listRef} id="club-picker-list" role="listbox" className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-1.5">
          {options.map((o, i) => {
            const isSel = o.value === value
            return (
              <li key={o.value} role="option" aria-selected={isSel} onMouseEnter={() => setActive(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(o.value)}
                className={`flex items-center gap-2.5 px-2 py-2 rounded-lg cursor-pointer text-sm select-none ${active === i ? 'bg-teal-50 text-teal-900' : 'text-slate-800'} ${o.value === OTHER ? 'text-slate-500' : ''}`}>
                {o.value === OTHER
                  ? <span className="w-7 h-7 rounded-md bg-slate-100 text-slate-400 flex items-center justify-center"><Shield size={15} /></span>
                  : <ClubMark name={o.label} logoUrl={o.logoUrl} size="sm" />}
                <span className="truncate">{o.label}</span>
                {isSel && <Check size={16} className="ml-auto text-teal-600 flex-none" />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// The player card extras (tournament forms with the org's "Player pass" switch on): an
// optional photo, and the link the card's QR code should open. Both can be changed later
// from the card page. Photo prep + upload live in src/lib/photoClient.ts.
function CardFields({ photoUrl, cardLink, onPhoto, onLink, preview, qrText, qr2Text, theme, clubLogo }: {
  photoUrl: string; cardLink: string; onPhoto: (url: string) => void; onLink: (url: string) => void
  preview: Omit<PassCardData, 'qrDataUrl' | 'qr2DataUrl'>; qrText: string; qr2Text: string; theme: CardTheme
  /** Offer a club-logo upload when the chosen club has none (or was typed in). */
  clubLogo?: { clubName: string; url: string; onChange: (url: string) => void }
}) {
  const [busy, setBusy] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  async function pick(file: File) {
    setBusy(true)
    try { onPhoto(await uploadPlayerPhoto(file)) }
    catch (e: any) { toast.error(e?.message || 'Could not upload the photo') }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' }
  }
  async function pickLogo(file: File) {
    if (!clubLogo) return
    setLogoBusy(true)
    try { clubLogo.onChange(await uploadClubLogo(file)) }
    catch (e: any) { toast.error(e?.message || 'Could not upload the logo') }
    finally { setLogoBusy(false); if (logoRef.current) logoRef.current.value = '' }
  }
  return (
    <div className="mb-4 pb-4 border-b border-slate-100">
      {/* On phones and tablets the live card sits right here; on wide screens it rides along in the side column. */}
      <div className="lg:hidden mb-4">
        <CardPreview p={preview} qrText={qrText} qr2Text={qr2Text} theme={theme} className="w-56 mx-auto rounded-xl shadow-lg ring-1 ring-slate-200" />
        <p className="text-center text-xs text-slate-400 mt-2">Your card builds itself as you type.</p>
      </div>
      {clubLogo && (
        <div className="flex items-center gap-4 mb-4">
          <button type="button" onClick={() => logoRef.current?.click()} disabled={logoBusy} aria-label={clubLogo.url ? 'Change club logo' : 'Add club logo'}
            className="relative flex-none w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 overflow-hidden flex items-center justify-center text-slate-400 disabled:opacity-60">
            {clubLogo.url ? <img src={clubLogo.url} alt="" className="w-full h-full object-contain p-1" /> : <Shield size={22} />}
            {logoBusy && <span className="absolute inset-0 bg-white/75 flex items-center justify-center text-[10px] font-semibold text-slate-600">Uploading…</span>}
          </button>
          <div className="text-sm min-w-0">
            <div className="font-medium text-slate-700">{clubLogo.clubName ? `${clubLogo.clubName} logo` : 'Club logo'} <span className="text-slate-400 font-normal">(optional)</span></div>
            <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">We don't have a logo for this club yet — add one and it goes on the card{clubLogo.clubName ? ' (and on every card for the club)' : ''}.</p>
            <div className="mt-1.5 flex gap-3 text-xs font-semibold">
              <button type="button" onClick={() => logoRef.current?.click()} disabled={logoBusy} className="text-teal-700 hover:underline">{clubLogo.url ? 'Change logo' : 'Add logo'}</button>
              {clubLogo.url && <button type="button" onClick={() => clubLogo.onChange('')} className="text-slate-500 hover:underline">Remove</button>}
            </div>
          </div>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) pickLogo(f) }} />
        </div>
      )}
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} aria-label={photoUrl ? 'Change player photo' : 'Add player photo'}
          className="relative flex-none w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 overflow-hidden flex items-center justify-center text-slate-400 disabled:opacity-60">
          {photoUrl ? <img src={photoUrl} alt="" className="w-full h-full object-cover" /> : <Camera size={28} />}
          {busy && <span className="absolute inset-0 bg-white/75 flex items-center justify-center text-xs font-semibold text-slate-600">Uploading…</span>}
        </button>
        <div className="text-sm min-w-0">
          <div className="font-medium text-slate-700">Player photo <span className="text-slate-400 font-normal">(optional)</span></div>
          <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">Goes on the player card you get after registering. Take one now or pick from your photos — you can change it later.</p>
          <div className="mt-1.5 flex gap-3 text-xs font-semibold">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="text-teal-700 hover:underline">{photoUrl ? 'Change photo' : 'Add photo'}</button>
            {photoUrl && <button type="button" onClick={() => onPhoto('')} className="text-slate-500 hover:underline">Remove</button>}
          </div>
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) pick(f) }} />
      </div>
      <div className="mt-3">
        <label className={labelCls}><span className="inline-flex items-center gap-1.5"><Link2 size={14} className="text-slate-400" /> Link for the card's QR code <span className="text-slate-400 font-normal">(optional)</span></span></label>
        <input className={inputCls} value={cardLink} onChange={e => onLink(e.target.value)} inputMode="url" placeholder="Highlight reel, Instagram, Hudl… e.g. https://youtube.com/…" />
        <p className="text-xs text-slate-400 mt-1">Leave blank and the code opens the player's card.</p>
      </div>
    </div>
  )
}

export default function PlayerRegForm({ orgId, fields, waiverTitle, waiverHtml, confirmationTitle, confirmationHtml, teams, clubs, tournamentId, tournamentName, header, cardContext }: { orgId: string; fields: Fields; waiverTitle: string; waiverHtml: string; confirmationTitle: string; confirmationHtml: string; teams?: string[]; clubs?: ClubOption[]; tournamentId?: string; tournamentName?: string; header?: FormHeader; cardContext?: CardContext }) {
  // Tournament forms pass the registered clubs with their teams: the parent picks the club,
  // then the team on it, and we store "Club — Team" so staff rosters line up exactly.
  const clubMode = !!clubs && clubs.length > 0
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [passToken, setPassToken] = useState('')   // set when the submission got a player pass
  const [d, setD] = useState<any>({
    playerName: '', playerEmail: '', usLacrosse: '', dob: '', gender: '', grade: '', teamName: '', teamOther: '', clubName: '', teamPick: '', jerseyNumber: '', position: '', photoUrl: '', cardLink: '', clubLogoUrl: '',
    parentName: '', parentEmail: '', parentPhone: '',
    parent2Name: '', parent2Email: '', parent2Phone: '',
    emergencyName: '', emergencyPhone: '',
    hotel: '', hotelName: '', newsletter: false,
    agree: false, signature: '',
  })
  const set = (k: string, v: any) => setD((p: any) => ({ ...p, [k]: v }))
  // Staff can hand a parent a link / QR with ?club=&team= (game-day check-in): preselect
  // them when they match a registered club/team, otherwise leave the pickers untouched.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      const club = String(sp.get('club') || '').trim(), team = String(sp.get('team') || '').trim()
      if (!club && !team) return
      if (clubMode) {
        const c = clubs!.find(x => x.name === club)
        if (!c) return
        const t = team && c.teams.some(x => x.name === team) ? team : ''
        setD((p: any) => ({ ...p, clubName: c.name, teamPick: t }))
      } else if (team && Array.isArray(teams) && teams.includes(team)) {
        setD((p: any) => ({ ...p, teamName: team }))
      }
    } catch { /* no window / bad params */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const selectedClub = clubMode ? clubs!.find(c => c.name === d.clubName) : undefined
  const clubTeams = selectedClub?.teams ?? []
  // The club's logo: from its team registration, else the one the family uploads on this form.
  const clubLogoUrl: string = selectedClub?.logoUrl || String(d.clubLogoUrl || '')
  const clubsShown: ClubOption[] = clubMode ? clubs!.map(c => c.name === d.clubName && !c.logoUrl && d.clubLogoUrl ? { ...c, logoUrl: d.clubLogoUrl } : c) : []
  // What the header chip shows as the parent picks: club (or the typed "other" name), then team.
  const typedOther = String(d.teamOther || '').trim()
  const chipClub: string = selectedClub ? selectedClub.name : d.clubName === '__other' ? typedOther : ''
  const chipTeam: string = (() => {
    if (!selectedClub) return ''
    if (d.teamPick === '__other') return typedOther
    const t = clubTeams.find(x => x.name === d.teamPick)
    return t ? (t.division ? `${t.name} · ${t.division}` : t.name) : ''
  })()
  // Live card preview (tournament forms with the org's "Player pass" switch on): built from
  // what they've typed so far, placeholders for the rest.
  const cardOn = !!(cardContext && fields.playerPass && tournamentId)
  const previewLink = cleanCardLink(d.cardLink)
  const preview: Omit<PassCardData, 'qrDataUrl' | 'qr2DataUrl'> | null = cardOn ? {
    code: '···-···',
    playerName: String(d.playerName || '').trim() || 'Player name',
    clubName: chipClub || 'Your club',
    teamName: selectedClub ? (d.teamPick === '__other' ? typedOther : String(d.teamPick || '')) : '',
    division: selectedClub ? (clubTeams.find(x => x.name === d.teamPick)?.division || '') : '',
    jersey: String(d.jerseyNumber || '').trim().replace(/^#/, ''),
    position: String(d.position || ''),
    photoUrl: d.photoUrl,
    clubLogoUrl,
    tournamentName: cardContext!.tournamentName || tournamentName || '',
    tournamentLogoUrl: cardContext!.tournamentLogoUrl,
    tournamentDates: cardContext!.tournamentDates,
    location: cardContext!.location,
    orgName: cardContext!.orgName,
    orgLogoUrl: cardContext!.orgLogoUrl,
    orgSite: cardContext!.orgSite,
    signedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    qrLabel: previewLink ? qrLabelFor(previewLink) : 'My player card',
    qr2Label: cardContext!.eventQrLabel,
  } : null
  const previewQr = previewLink || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '')
  // Tournament forms render their own header (logo + title) so the club chip can live in it.
  const headerEl = header ? (
    <>
      <header className="bg-[#0b1220] text-white">
        <div className={`${cardOn ? 'max-w-2xl lg:max-w-5xl' : 'max-w-2xl'} mx-auto px-6 py-6 flex flex-wrap items-center gap-3`}>
          {header.logoUrl && <img src={header.logoUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-white/95 p-1" />}
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.2em] text-teal-300">{header.eyebrow || 'Player Waiver'}</div>
            <h1 className="text-xl font-extrabold leading-tight">{header.title}</h1>
          </div>
          {chipClub && !done && (
            <div className="basis-full sm:basis-auto sm:ml-auto flex items-center gap-2.5 bg-white/10 border border-white/15 rounded-xl pl-2 pr-3 py-2 min-w-0">
              <ClubMark name={chipClub} logoUrl={clubLogoUrl || undefined} size="lg" />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.16em] text-teal-300 leading-[14px]">Registering for</div>
                <div className="text-[15px] font-extrabold leading-tight truncate">{chipClub}</div>
                {chipTeam && <div className="text-xs text-slate-300 leading-snug truncate">{chipTeam}</div>}
              </div>
            </div>
          )}
        </div>
      </header>
      {!done && <p className={`${cardOn ? 'max-w-2xl lg:max-w-5xl' : 'max-w-2xl'} mx-auto px-6 pt-6 text-sm text-slate-500`}>All players must complete this waiver to compete. Required fields are marked *.</p>}
    </>
  ) : null
  const resolvedTeam: string = (() => {
    const other = String(d.teamOther || '').trim()
    if (clubMode) {
      if (d.clubName === '__other') return other
      if (!d.clubName) return ''
      if (d.teamPick === '__other') return other ? `${d.clubName} — ${other}` : d.clubName
      return d.teamPick ? `${d.clubName} — ${d.teamPick}` : d.clubName
    }
    return d.teamName === '__other' ? other : d.teamName
  })()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!d.agree || !d.signature.trim()) { toast.error('Please agree to the waiver and sign'); return }
    if (fields.teamName && clubMode && !d.clubName) { toast.error('Please select your club'); return }
    if (fields.teamName && clubMode && d.clubName !== '__other' && clubTeams.length > 0 && !d.teamPick) { toast.error('Please select your team'); return }
    if ((d.teamName === '__other' || d.clubName === '__other' || d.teamPick === '__other') && !String(d.teamOther || '').trim()) { toast.error('Please enter your team or club name'); return }
    setSubmitting(true)
    try {
      // "Other / not listed" stores the typed name, not the sentinel, so staff rosters read properly.
      const rest: any = { ...d }; delete rest.teamPick; delete rest.teamOther
      const data = { ...rest, teamName: resolvedTeam, clubName: clubMode && d.clubName !== '__other' ? d.clubName : '', tournamentId: tournamentId || '', tournamentName: tournamentName || '' }
      const res = await fetch('/api/org-forms/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, formType: 'player', data }) })
      if (res.ok) { const j = await res.json().catch(() => ({})); if (j.passToken) setPassToken(String(j.passToken)); setDone(true); try { window.scrollTo({ top: 0 }) } catch {} }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Submission failed') }
    } catch { toast.error('Submission failed') } finally { setSubmitting(false) }
  }

  const receiptRows: [string, string][] = [
    ['Player name', d.playerName], ['Player email', d.playerEmail], ['US Lacrosse #', d.usLacrosse], ['Date of birth', d.dob],
    ['Gender', d.gender], ['Grade', d.grade], ['Team', resolvedTeam], ['Jersey #', d.jerseyNumber], ['Position', d.position],
    ['Parent', d.parentName], ['Parent email', d.parentEmail], ['Parent phone', d.parentPhone],
    ['Parent 2', d.parent2Name], ['Parent 2 email', d.parent2Email], ['Parent 2 phone', d.parent2Phone],
    ['Emergency contact', d.emergencyName], ['Emergency phone', d.emergencyPhone],
    ['Hotel / rental', d.hotel], ['Where staying', d.hotelName], ['Signature', d.signature],
  ]
  if (done) return (
    <>
    {headerEl}
    <div className="max-w-xl mx-auto px-6 py-16">
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto text-teal-500" />
        <h1 className="text-2xl font-extrabold text-slate-900 mt-4">{confirmationTitle}</h1>
        <div className="text-slate-500 mt-3 leading-relaxed" dangerouslySetInnerHTML={{ __html: confirmationHtml }} />
      </div>

      {passToken && (
        <div className="mt-8 bg-[#0b1220] rounded-2xl p-5 text-white">
          <div className="text-xs uppercase tracking-[0.2em] text-teal-300">Player card</div>
          <p className="text-sm text-slate-300 mt-1 leading-relaxed">Save it, share it, show it off. Open the card to change the photo or the link its QR code opens — the link is in your confirmation email too.</p>
          <img src={`/pass/${passToken}/card.png`} alt="Player card" width={720} height={1140} className="w-full max-w-[300px] mx-auto mt-4 rounded-xl shadow-2xl shadow-black/50 bg-white" />
          <div className="grid grid-cols-2 gap-2.5 max-w-[300px] mx-auto mt-4">
            <a href={`/pass/${passToken}/card.png`} download="player-card.png" className="inline-flex items-center justify-center gap-1.5 bg-teal-500 hover:bg-teal-400 text-[#0b1220] font-bold rounded-xl py-2.5 text-sm"><Download size={15} /> Save to phone</a>
            <a href={`/pass/${passToken}`} target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 font-semibold rounded-xl py-2.5 text-sm"><ExternalLink size={15} /> Open card</a>
          </div>
        </div>
      )}

      <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">Your submission</h2>
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
          {receiptRows.filter(([, v]) => v && String(v).trim()).map(([label, v]) => (
            <div key={label} className="flex justify-between gap-4 text-sm border-b border-slate-50 py-1">
              <span className="text-slate-400">{label}</span><span className="text-slate-700 text-right">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 bg-teal-50 border border-teal-200 rounded-2xl p-5 text-center">
        <h3 className="font-bold text-slate-900">Create a parent account</h3>
        <p className="text-sm text-slate-600 mt-1">Manage your players, register faster for future tournaments, and update details anytime.</p>
        <a href={`/register?role=parent&name=${encodeURIComponent(d.parentName || d.playerName || '')}&email=${encodeURIComponent(d.parentEmail || d.playerEmail || '')}`}
          className="inline-block mt-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold px-6 py-2.5 rounded-full transition-colors">Create a parent account</a>
      </div>
    </div>
    </>
  )

  return (
    <>
    {headerEl}
    <div className={`${cardOn ? 'max-w-2xl lg:max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-8 lg:items-start' : 'max-w-2xl'} mx-auto px-6 py-10`}>
    <form onSubmit={submit} className="space-y-6 min-w-0">
      <Toaster position="top-right" />

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Player information</h2>
        {preview && <CardFields photoUrl={d.photoUrl} cardLink={d.cardLink} onPhoto={u => set('photoUrl', u)} onLink={u => set('cardLink', u)} preview={preview} qrText={previewQr} qr2Text={cardContext!.eventQrUrl} theme={cardContext!.theme}
          clubLogo={d.clubName && !selectedClub?.logoUrl ? { clubName: selectedClub ? selectedClub.name : '', url: d.clubLogoUrl, onChange: u => set('clubLogoUrl', u) } : undefined} />}
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Player full name *</label><input className={inputCls} value={d.playerName} onChange={e => set('playerName', e.target.value)} required /></div>
          <div><label className={labelCls}>Player email</label><input className={inputCls} type="email" value={d.playerEmail} onChange={e => set('playerEmail', e.target.value)} /></div>
          <div><label className={labelCls}>US Lacrosse member # *</label><input className={inputCls} value={d.usLacrosse} onChange={e => set('usLacrosse', e.target.value)} required /></div>
          <div><label className={labelCls}>Date of birth *</label><input className={inputCls} type="date" value={d.dob} onChange={e => set('dob', e.target.value)} required /></div>
          {fields.gender && <div><label className={labelCls}>Gender *</label><select className={inputCls} value={d.gender} onChange={e => set('gender', e.target.value)} required><option value="">Select…</option><option>Female</option><option>Male</option></select></div>}
          {fields.grade && <div><label className={labelCls}>Player grade *</label><select className={inputCls} value={d.grade} onChange={e => set('grade', e.target.value)} required><option value="">Select…</option>{GRADES.map(g => <option key={g}>{g}</option>)}</select></div>}
          {fields.teamName && clubMode && (
            <>
              <div><label className={labelCls}>Club *</label>
                <ClubPicker clubs={clubsShown} value={d.clubName} otherName={typedOther} onChange={c => setD((p: any) => ({ ...p, clubName: c, teamPick: '', teamOther: '', clubLogoUrl: '' }))} />
              </div>
              {d.clubName && d.clubName !== '__other' && clubTeams.length > 0 && (
                <div><label className={labelCls}>Team *</label>
                  <select className={inputCls} value={d.teamPick} onChange={e => set('teamPick', e.target.value)} required>
                    <option value="">Select your team…</option>
                    {clubTeams.map(t => <option key={t.name} value={t.name}>{t.name}{t.division ? ` · ${t.division}` : ''}</option>)}
                    <option value="__other">Other / not listed</option>
                  </select>
                </div>
              )}
              {(d.clubName === '__other' || d.teamPick === '__other') && (
                <div><label className={labelCls}>{d.clubName === '__other' ? 'Enter your club and team name *' : 'Enter your team name *'}</label>
                  <input className={inputCls} value={d.teamOther} onChange={e => set('teamOther', e.target.value)} placeholder={d.clubName === '__other' ? 'e.g. Tampa Elite 2031' : 'e.g. 2031 Blue'} required />
                </div>
              )}
            </>
          )}
          {fields.teamName && !clubMode && <div><label className={labelCls}>Team or club name *</label>{teams && teams.length > 0
            ? <select className={inputCls} value={d.teamName} onChange={e => set('teamName', e.target.value)} required><option value="">Select your team…</option>{teams.map(tm => <option key={tm} value={tm}>{tm}</option>)}<option value="__other">Other / not listed</option></select>
            : <input className={inputCls} value={d.teamName} onChange={e => set('teamName', e.target.value)} required />}</div>}
          {fields.teamName && !clubMode && d.teamName === '__other' && <div><label className={labelCls}>Enter your team or club name *</label><input className={inputCls} value={d.teamOther} onChange={e => set('teamOther', e.target.value)} placeholder="e.g. Tampa Elite 2031" required /></div>}
          <div><label className={labelCls}>Jersey number</label><input className={inputCls} value={d.jerseyNumber} onChange={e => set('jerseyNumber', e.target.value)} /></div>
          {fields.position !== false && <div><label className={labelCls}>Position</label><select className={inputCls} value={d.position} onChange={e => set('position', e.target.value)}><option value="">Select…</option>{POSITIONS.map(p => <option key={p}>{p}</option>)}</select></div>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Parent information</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Parent name *</label><input className={inputCls} value={d.parentName} onChange={e => set('parentName', e.target.value)} required /></div>
          <div><label className={labelCls}>Parent email *</label><input className={inputCls} type="email" value={d.parentEmail} onChange={e => set('parentEmail', e.target.value)} required /></div>
          <div><label className={labelCls}>Parent mobile phone *</label><input className={inputCls} type="tel" value={d.parentPhone} onChange={e => set('parentPhone', e.target.value)} required /></div>
        </div>
        {fields.parent2 && (
          <div className="grid sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
            <div><label className={labelCls}>Parent 2 name</label><input className={inputCls} value={d.parent2Name} onChange={e => set('parent2Name', e.target.value)} /></div>
            <div><label className={labelCls}>Parent 2 email</label><input className={inputCls} type="email" value={d.parent2Email} onChange={e => set('parent2Email', e.target.value)} /></div>
            <div><label className={labelCls}>Parent 2 mobile phone</label><input className={inputCls} type="tel" value={d.parent2Phone} onChange={e => set('parent2Phone', e.target.value)} /></div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">Emergency contact</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><label className={labelCls}>Name *</label><input className={inputCls} value={d.emergencyName} onChange={e => set('emergencyName', e.target.value)} required /></div>
          <div><label className={labelCls}>Phone *</label><input className={inputCls} type="tel" value={d.emergencyPhone} onChange={e => set('emergencyPhone', e.target.value)} required /></div>
        </div>
      </div>

      {fields.hotelQuestion && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <label className={labelCls}>Is your family staying at a hotel or vacation rental during the tournament? *</label>
          <select className={inputCls} value={d.hotel} onChange={e => set('hotel', e.target.value)} required><option value="">Select…</option><option>Yes</option><option>No</option><option>Maybe</option></select>
          {d.hotel === 'Yes' && <div className="mt-3"><label className={labelCls}>Which hotel / where are you staying? *</label><input className={inputCls} value={d.hotelName} onChange={e => set('hotelName', e.target.value)} placeholder="Hotel or rental name" required /></div>}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-base font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">{waiverTitle}</h2>
        <div className="bg-slate-50 rounded-xl p-4 text-xs text-slate-600 leading-relaxed mb-4 max-h-56 overflow-y-auto" dangerouslySetInnerHTML={{ __html: waiverHtml }} />
        <label className="flex items-start gap-3 cursor-pointer mb-4">
          <input type="checkbox" checked={d.agree} onChange={e => set('agree', e.target.checked)} className="mt-0.5 accent-teal-500 w-4 h-4" />
          <span className="text-sm text-slate-700">I have read and agree to the waiver and release of liability above *</span>
        </label>
        <label className={labelCls}>Type your full name as signature *</label>
        <input className={inputCls} value={d.signature} onChange={e => set('signature', e.target.value)} placeholder="Full legal name" required />
      </div>

      {fields.newsletter && (
        <label className="flex items-start gap-3 cursor-pointer px-1">
          <input type="checkbox" checked={d.newsletter} onChange={e => set('newsletter', e.target.checked)} className="mt-0.5 accent-teal-500 w-4 h-4" />
          <span className="text-sm text-slate-600">Keep me in the loop with updates and offers.</span>
        </label>
      )}

      <button type="submit" disabled={submitting || !d.agree} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-colors">
        {submitting ? 'Submitting…' : 'Submit registration'}
      </button>
    </form>
    {preview && (
      <aside className="hidden lg:block sticky top-6">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500 mb-2">Your player card</div>
        <CardPreview p={preview} qrText={previewQr} qr2Text={cardContext!.eventQrUrl} theme={cardContext!.theme} className="w-full rounded-2xl shadow-xl ring-1 ring-slate-200" />
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">Builds itself as you type. The player ID and QR code are set when you submit; you can change the photo or the link any time after.</p>
      </aside>
    )}
    </div>
    </>
  )
}
