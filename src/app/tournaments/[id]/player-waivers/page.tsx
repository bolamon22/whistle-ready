'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import TournamentNav from '../TournamentNav'
import { Inbox, ChevronRight, ChevronDown, ExternalLink, Download, Search, X, Phone, Mail, Pencil, ClipboardCheck, CheckCircle2, Circle, Share2, QrCode, RefreshCw, ScanLine, Printer } from 'lucide-react'

type Sub = { id: string; submittedAt: string; data: any; edits?: { at: string; by?: string; fields: string[] }[]; checkedInAt?: string | null; checkedInBy?: string | null }

// Friendly labels for the detail view (anything not listed falls back to a de-camelCased key).
const LABELS: Record<string, string> = {
  playerName: 'Player', playerEmail: 'Player email', usLacrosse: 'US Lacrosse #', dob: 'Date of birth', gender: 'Gender',
  grade: 'Grade', clubName: 'Club', teamName: 'Team', jerseyNumber: 'Jersey #', parentName: 'Parent', parentEmail: 'Parent email',
  parentPhone: 'Parent phone', parent2Name: 'Parent 2', parent2Email: 'Parent 2 email', parent2Phone: 'Parent 2 phone',
  emergencyName: 'Emergency contact', emergencyPhone: 'Emergency phone', hotel: 'Hotel / rental', hotelName: 'Where staying',
  newsletter: 'Newsletter', signature: 'Signature', cardLink: 'Card QR link',
}
const DETAIL_ORDER = Object.keys(LABELS)
const HIDDEN_KEYS = ['tournamentId', 'tournamentName', 'agree', 'teamOther', 'teamPick', 'photoUrl']
const CSV_COLS = ['playerName', 'playerEmail', 'usLacrosse', 'dob', 'gender', 'grade', 'teamName', 'jerseyNumber', 'parentName', 'parentEmail', 'parentPhone', 'parent2Name', 'parent2Email', 'parent2Phone', 'emergencyName', 'emergencyPhone', 'hotel', 'hotelName', 'signature']
const PAGE = 100

const teamLabel = (t: any) => { const s = String(t || '').trim(); return !s ? '—' : s === '__other' ? 'Other / not listed' : s }
// Player photo from the waiver (parents can add one for the pass), else initials.
const initialsOf = (name: string) => { const w = String(name || '').trim().split(/\s+/).filter(Boolean); return ((w[0]?.[0] || '') + (w[1]?.[0] || '')).toUpperCase() || '?' }
function Avatar({ d, size }: { d: any; size: number }) {
  const cls = `flex-shrink-0 rounded-lg object-cover bg-slate-200 text-slate-600 font-bold flex items-center justify-center`
  if (d?.photoUrl) return <img src={d.photoUrl} alt="" width={size} height={size} style={{ width: size, height: size }} className={cls} />
  return <span style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} className={cls}>{initialsOf(d?.playerName)}</span>
}
const isPhone = (k: string) => /phone/i.test(k)
const isEmail = (k: string) => /email/i.test(k)

function detailEntries(d: any): [string, any][] {
  const keys = Object.keys(d || {}).filter(k => !HIDDEN_KEYS.includes(k))
  keys.sort((a, b) => { const ia = DETAIL_ORDER.indexOf(a), ib = DETAIL_ORDER.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) })
  return keys.map(k => [k, k === 'teamName' ? teamLabel(d[k]) : d[k]])
}

// Staff edit — the fields a parent filled in (never the signature / agreement).
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
const EDIT_FIELDS: { key: string; label: string; type?: string; options?: string[]; team?: boolean }[] = [
  { key: 'playerName', label: 'Player' }, { key: 'playerEmail', label: 'Player email', type: 'email' },
  { key: 'usLacrosse', label: 'US Lacrosse #' }, { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'gender', label: 'Gender', options: ['', 'Female', 'Male'] }, { key: 'grade', label: 'Grade', options: ['', ...GRADES] },
  { key: 'teamName', label: 'Team', team: true }, { key: 'jerseyNumber', label: 'Jersey #' },
  { key: 'parentName', label: 'Parent' }, { key: 'parentEmail', label: 'Parent email', type: 'email' }, { key: 'parentPhone', label: 'Parent phone', type: 'tel' },
  { key: 'parent2Name', label: 'Parent 2' }, { key: 'parent2Email', label: 'Parent 2 email', type: 'email' }, { key: 'parent2Phone', label: 'Parent 2 phone', type: 'tel' },
  { key: 'emergencyName', label: 'Emergency contact' }, { key: 'emergencyPhone', label: 'Emergency phone', type: 'tel' },
  { key: 'hotel', label: 'Hotel / rental' }, { key: 'hotelName', label: 'Where staying' },
]

type TeamGroup = { club: string; teams: string[] }

function WaiverEditForm({ form, setForm, teamGroups, otherTeams, onSave, onCancel, saving }: {
  form: Record<string, string>; setForm: (f: Record<string, string>) => void
  teamGroups: TeamGroup[]; otherTeams: string[]
  onSave: () => void; onCancel: () => void; saving: boolean
}) {
  const teamOptions = [...teamGroups.flatMap(g => [g.club, ...g.teams.map(t => `${g.club} — ${t}`)]), ...otherTeams]
  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400'
  // Team is a real <select> (a datalist never shows as a picker on iPhone). A name that
  // isn't in the list — or "Other / type a name…" — switches to a free-text box.
  const teamVal = form.teamName || ''
  const [customTeam, setCustomTeam] = useState(() => !!teamVal && !teamOptions.includes(teamVal))
  const teamSelectValue = customTeam ? '__custom__' : (teamOptions.includes(teamVal) ? teamVal : '')
  return (
    <form onSubmit={e => { e.preventDefault(); onSave() }} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {EDIT_FIELDS.map(f => {
          const v = form[f.key] || ''
          const options = f.options ? (f.options.includes(v) ? f.options : [...f.options, v]) : null
          return (
            <div key={f.key} className={f.team ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
              {f.team ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select className={inp} value={teamSelectValue}
                    onChange={e => {
                      const val = e.target.value
                      if (val === '__custom__') { setCustomTeam(true); setForm({ ...form, teamName: '' }) }
                      else { setCustomTeam(false); setForm({ ...form, teamName: val }) }
                    }}>
                    <option value="">— pick a team —</option>
                    {teamGroups.map(g => (
                      <optgroup key={g.club} label={g.club}>
                        <option value={g.club}>{g.club} (club)</option>
                        {g.teams.map(t => <option key={t} value={`${g.club} — ${t}`}>{t}</option>)}
                      </optgroup>
                    ))}
                    {otherTeams.length > 0 && (
                      <optgroup label="Already used on waivers">
                        {otherTeams.map(t => <option key={t} value={t}>{t}</option>)}
                      </optgroup>
                    )}
                    <option value="__custom__">Other / type a name…</option>
                  </select>
                  {customTeam && (
                    <input className={inp} type="text" value={teamVal} autoFocus placeholder="Team or club name"
                      onChange={e => setForm({ ...form, teamName: e.target.value })} />
                  )}
                </div>
              ) : options ? (
                <select className={inp} value={v} onChange={e => setForm({ ...form, [f.key]: e.target.value })}>
                  {options.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                </select>
              ) : (
                <input className={inp} type={f.type || 'text'} value={v}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </div>
          )
        })}
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50">Cancel</button>
        <button type="submit" disabled={saving} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg px-4 py-2">{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  )
}

// Full waiver detail — every field, with tap-to-call / tap-to-email on phones and emails.
function Detail({ d }: { d: any }) {
  return (
    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1 text-sm">
      {detailEntries(d).map(([k, v]) => {
        const val = v === true ? 'Yes' : v === false ? 'No' : String(v ?? '').trim() || '—'
        return (
          <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-1.5">
            <span className="text-slate-400 flex-shrink-0">{LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</span>
            {val !== '—' && isPhone(k) ? <a href={`tel:${val}`} className="text-teal-700 text-right">{val}</a>
              : val !== '—' && isEmail(k) ? <a href={`mailto:${val}`} className="text-teal-700 text-right break-all">{val}</a>
              : <span className="text-slate-700 text-right break-words min-w-0">{val}</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function PlayerWaiverEntries() {
  const { id } = useParams() as { id: string }
  const [name, setName] = useState('Tournament')
  const [logo, setLogo] = useState<string | undefined>(undefined)
  const [subs, setSubs] = useState<Sub[]>([])          // the loaded page(s) of results
  const [total, setTotal] = useState(0)                 // matching the current search / team
  const [grandTotal, setGrandTotal] = useState(0)       // every waiver for this tournament
  const [teams, setTeams] = useState<{ name: string; count: number }[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [q, setQ] = useState('')
  const [qDebounced, setQDebounced] = useState('')
  const [team, setTeam] = useState('')                  // raw teamName value ('' = all)
  const [sort, setSort] = useState<'newest' | 'name' | 'jersey'>('newest')
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [teamGroups, setTeamGroups] = useState<TeamGroup[]>([])
  // Game-day check-in mode: tap players as they arrive; see who hasn't shown up yet.
  const [checkMode, setCheckMode] = useState(false)
  const [checkedIn, setCheckedIn] = useState(0)                 // checked in, within the current search / team
  const [showOnly, setShowOnly] = useState<'all' | 'out' | 'in'>('all')
  const [helpOpen, setHelpOpen] = useState(false)               // "player not on the list?" panel
  const [confirmClear, setConfirmClear] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  useEffect(() => { try { setCheckMode(localStorage.getItem('wr-waiver-checkin') === '1') } catch {} }, [])
  // A scanned player pass lands here as ?player=<submission id>: show that one player with a
  // big check-in button, above the list.
  const [passOn, setPassOn] = useState(false)   // the org's "Player pass" switch (Forms settings)
  const [scanId, setScanId] = useState('')
  const [scan, setScan] = useState<Sub | null>(null)
  const [scanErr, setScanErr] = useState('')
  useEffect(() => { try { setScanId(String(new URLSearchParams(window.location.search).get('player') || '')) } catch {} }, [])
  useEffect(() => {
    if (!scanId) { setScan(null); setScanErr(''); return }
    let cancelled = false
    setScan(null); setScanErr('')
    fetch(`/api/tournaments/${id}/player-waivers?id=${encodeURIComponent(scanId)}`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (cancelled) return
      if (r.ok && j.submission) setScan(j.submission)
      else setScanErr(j.error || 'Player not found in this tournament')
    }).catch(() => { if (!cancelled) setScanErr('Could not load that player') })
    return () => { cancelled = true }
  }, [scanId, id])
  const closeScan = () => {
    setScanId('')
    try { const u = new URL(window.location.href); u.searchParams.delete('player'); window.history.replaceState(null, '', u.toString()) } catch {}
  }
  const toggleCheckMode = () => {
    const next = !checkMode
    setCheckMode(next)
    try { localStorage.setItem('wr-waiver-checkin', next ? '1' : '0') } catch {}
    if (!next) { setShowOnly('all'); setHelpOpen(false) }
  }

  // Search / team / sort are answered by the server, a page at a time, so this stays quick
  // with thousands of waivers. A roster (team selected) reads best in jersey order.
  const effSort = sort === 'newest' && team ? 'jersey' : sort
  const queryUrl = (offset: number, limit = PAGE) =>
    `/api/tournaments/${id}/player-waivers?q=${encodeURIComponent(qDebounced)}&team=${encodeURIComponent(team)}&sort=${effSort}&limit=${limit}&offset=${offset}`
  useEffect(() => { const t = setTimeout(() => setQDebounced(q.trim()), 250); return () => clearTimeout(t) }, [q])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(queryUrl(0)).then(r => r.ok ? r.json() : null).then(d => {
      if (cancelled || !d) return
      setSubs(Array.isArray(d.submissions) ? d.submissions : [])
      setPassOn(d.playerPass === true)
      setTotal(Number(d.total) || 0); setGrandTotal(Number(d.grandTotal) || 0); setCheckedIn(Number(d.checkedIn) || 0)
      setTeams(Array.isArray(d.teams) ? d.teams : [])
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, qDebounced, team, effSort, reloadTick])
  // In check-in mode, coming back to this screen (after a parent signed on their phone)
  // re-pulls the list so the new waiver is there without a manual refresh.
  useEffect(() => {
    if (!checkMode) return
    const onBack = () => { if (document.visibilityState === 'visible') setReloadTick(t => t + 1) }
    window.addEventListener('focus', onBack); document.addEventListener('visibilitychange', onBack)
    return () => { window.removeEventListener('focus', onBack); document.removeEventListener('visibilitychange', onBack) }
  }, [checkMode])
  async function loadMore() {
    setLoadingMore(true)
    try {
      const d = await fetch(queryUrl(subs.length)).then(r => r.ok ? r.json() : null)
      if (d && Array.isArray(d.submissions)) setSubs(prev => [...prev, ...d.submissions.filter((x: Sub) => !prev.some(p => p.id === x.id))])
      if (d) setTotal(Number(d.total) || 0)
    } catch {} finally { setLoadingMore(false) }
  }
  async function refreshCounts() {
    try {
      const d = await fetch(queryUrl(0, 1)).then(r => r.ok ? r.json() : null)
      if (d) { setTotal(Number(d.total) || 0); setGrandTotal(Number(d.grandTotal) || 0); setCheckedIn(Number(d.checkedIn) || 0); setTeams(Array.isArray(d.teams) ? d.teams : []) }
    } catch {}
  }

  useEffect(() => {
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setName(d.name || 'Tournament'); setLogo(d.logoUrl || undefined) } }).catch(() => {})
    // Registered clubs and their teams for this tournament → the Team picker when staff edit a waiver
    fetch(`/api/registrations?tournamentId=${id}`).then(r => r.ok ? r.json() : []).then((regs: any[]) => {
      const byClub = new Map<string, Set<string>>()
      ;(Array.isArray(regs) ? regs : []).forEach(reg => {
        const club = String(reg?.clubName || reg?.clubContact || '').trim()
        if (!club) return
        if (!byClub.has(club)) byClub.set(club, new Set())
        ;(reg?.teams || []).forEach((t: any) => { const n = String(t?.teamName || '').trim(); if (n) byClub.get(club)!.add(n) })
      })
      setTeamGroups([...byClub.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([club, teams]) => ({ club, teams: [...teams].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) })))
    }).catch(() => {})
  }, [id])

  // Team names already used on other waivers that aren't a registered club/team — offered too, for consistency.
  const otherTeams = useMemo(() => {
    const known = new Set(teamGroups.flatMap(g => [g.club, ...g.teams.map(t => `${g.club} — ${t}`)]))
    return teams.map(t => t.name.trim()).filter(t => t && t !== '__other' && !known.has(t)).sort((a, b) => a.localeCompare(b))
  }, [teams, teamGroups])

  function startEdit(s: Sub) {
    const d = s.data || {}
    const f: Record<string, string> = {}
    EDIT_FIELDS.forEach(x => { const v = d[x.key]; f[x.key] = v === '__other' ? '' : String(v ?? '') })
    setForm(f); setEditing(s.id); setOpen(s.id)
  }
  async function saveEdit() {
    if (!editing) return
    const s = subs.find(x => x.id === editing)
    if (!s) return
    const data: Record<string, string> = {}
    EDIT_FIELDS.forEach(x => { const before = String(s.data?.[x.key] ?? ''); const after = (form[x.key] ?? '').trim(); if (after !== before) data[x.key] = after })
    if (!Object.keys(data).length) { setEditing(null); return }
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/tournaments/${id}/player-waivers`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing, data }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error || 'Could not save'); return }
      setSubs(prev => prev.map(x => x.id === editing ? j.submission : x))
      setEditing(null); toast.success('Saved')
      refreshCounts()
    } catch { toast.error('Could not save') } finally { setSavingEdit(false) }
  }

  const fmt = (s: string) => { try { return new Date(s).toLocaleString() } catch { return s } }
  const fmtShort = (s: string) => { try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return s } }

  const exportCsv = async () => {
    let all: Sub[] = subs
    try { const d = await fetch(queryUrl(0, 20000)).then(r => r.ok ? r.json() : null); if (d && Array.isArray(d.submissions)) all = d.submissions } catch {}
    const head = ['Submitted', ...CSV_COLS].join(',')
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = all.map(s => [fmt(s.submittedAt), ...CSV_COLS.map(c => c === 'teamName' ? teamLabel(s.data?.teamName) : s.data?.[c])].map(esc).join(','))
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url
    a.download = `player-waivers${team ? '-' + teamLabel(team).replace(/[^\w-]+/g, '_') : ''}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const filtering = !!(q.trim() || team)

  // ── game-day check-in ──────────────────────────────────────────────────────
  async function toggleCheckIn(s: Sub) {
    const on = !s.checkedInAt
    const prevAt = s.checkedInAt ?? null, prevBy = s.checkedInBy ?? null
    setSubs(prev => prev.map(x => x.id === s.id ? { ...x, checkedInAt: on ? new Date().toISOString() : null, checkedInBy: on ? 'you' : null } : x))
    setCheckedIn(n => Math.max(0, n + (on ? 1 : -1)))
    try {
      const res = await fetch(`/api/tournaments/${id}/player-waivers`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, checkIn: on }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not save')
      if (j.submission) setSubs(prev => prev.map(x => x.id === s.id ? { ...x, checkedInAt: j.submission.checkedInAt ?? null, checkedInBy: j.submission.checkedInBy ?? null } : x))
    } catch (e: any) {
      setSubs(prev => prev.map(x => x.id === s.id ? { ...x, checkedInAt: prevAt, checkedInBy: prevBy } : x))
      setCheckedIn(n => Math.max(0, n + (on ? -1 : 1)))
      toast.error(e?.message || 'Could not save check-in')
    }
  }
  async function toggleScanCheckIn() {
    if (!scan) return
    const on = !scan.checkedInAt
    const prev = scan
    setScan({ ...scan, checkedInAt: on ? new Date().toISOString() : null, checkedInBy: on ? 'you' : null })
    try {
      const res = await fetch(`/api/tournaments/${id}/player-waivers`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: scan.id, checkIn: on }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not save')
      const upd = j.submission || {}
      setScan(cur => cur ? { ...cur, checkedInAt: upd.checkedInAt ?? null, checkedInBy: upd.checkedInBy ?? null } : cur)
      setSubs(list => list.map(x => x.id === scan.id ? { ...x, checkedInAt: upd.checkedInAt ?? null, checkedInBy: upd.checkedInBy ?? null } : x))
      setCheckedIn(n => Math.max(0, n + (on ? 1 : -1)))
    } catch (e: any) {
      setScan(prev)
      toast.error(e?.message || 'Could not save check-in')
    }
  }
  async function clearCheckIns() {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 4000); return }
    setConfirmClear(false)
    try {
      const res = await fetch(`/api/tournaments/${id}/player-waivers`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clearCheckIns: true, team: team || undefined }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Could not clear')
      setSubs(prev => prev.map(x => ({ ...x, checkedInAt: null, checkedInBy: null })))
      setCheckedIn(0); setShowOnly('all')
      toast.success(`Cleared ${j.cleared ?? 0} check-in${j.cleared === 1 ? '' : 's'}`)
    } catch (e: any) { toast.error(e?.message || 'Could not clear') }
  }
  const timeOf = (iso?: string | null) => { try { return iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '' } catch { return '' } }
  // Waiver-form link for a player who isn't on the list: opens with the selected club/team preset.
  const formUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const base = `${origin}/tournaments/${id}/player-waiver`
    const raw = String(team || '').trim()
    if (!raw || raw === '__other') return base
    const i = raw.indexOf(' — ')
    const club = i >= 0 ? raw.slice(0, i) : raw, teamName = i >= 0 ? raw.slice(i + 3) : ''
    const sp = new URLSearchParams(); sp.set('club', club); if (teamName) sp.set('team', teamName)
    return `${base}?${sp.toString()}`
  }, [id, team])
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=6&data=${encodeURIComponent(formUrl)}`
  const shareLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) { await (navigator as any).share({ title: `${name} — player waiver`, url: formUrl }); return }
      await navigator.clipboard.writeText(formUrl); toast.success('Link copied')
    } catch { /* share sheet dismissed */ }
  }
  const visible = checkMode && showOnly !== 'all' ? subs.filter(s => showOnly === 'in' ? !!s.checkedInAt : !s.checkedInAt) : subs
  const notIn = Math.max(0, total - checkedIn)
  const checkBtn = (s: Sub, size = 28) => (
    <button type="button" onClick={e => { e.stopPropagation(); toggleCheckIn(s) }} aria-pressed={!!s.checkedInAt} aria-label={s.checkedInAt ? 'Checked in — tap to undo' : 'Check in'}
      className={`flex items-center justify-center flex-shrink-0 rounded-lg transition-colors ${s.checkedInAt ? 'text-emerald-600' : 'text-slate-300 hover:text-slate-400'}`}>
      {s.checkedInAt ? <CheckCircle2 size={size} /> : <Circle size={size} />}
    </button>
  )

  const checkPanel = checkMode && (grandTotal > 0 || filtering) ? (
    <div className="bg-white border border-emerald-200 rounded-xl p-3 sm:p-4 mb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-800 truncate">{team ? teamLabel(team) : q.trim() ? `Matching “${q.trim()}”` : 'All teams'}</div>
          <div className="text-lg font-bold text-emerald-700 leading-tight">{checkedIn} of {total} checked in</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => setReloadTick(t => t + 1)} aria-label="Refresh" className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          {team && <button onClick={() => setTeam('')} className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap px-2 py-1.5">All teams</button>}
        </div>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${total ? Math.round((checkedIn / total) * 100) : 0}%` }} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {([['all', `All (${total})`], ['out', `Not here yet (${notIn})`], ['in', `Checked in (${checkedIn})`]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setShowOnly(k)} className={`text-xs font-medium rounded-full px-2.5 py-1 border ${showOnly === k ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
        ))}
        <span className="flex-1" />
        <button onClick={() => setHelpOpen(v => !v)} className={`text-xs font-medium rounded-full px-2.5 py-1 border inline-flex items-center gap-1 ${helpOpen ? 'bg-teal-600 border-teal-600 text-white' : 'border-teal-200 text-teal-700 hover:bg-teal-50'}`}><QrCode size={13} /> Not on the list?</button>
        {checkedIn > 0 && (
          <button onClick={clearCheckIns} className={`text-xs font-medium rounded-full px-2.5 py-1 border ${confirmClear ? 'bg-red-600 border-red-600 text-white' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{confirmClear ? `Tap again to clear ${team ? 'this team' : 'ALL'}` : 'Clear'}</button>
        )}
      </div>
      {helpOpen && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-sm font-semibold text-slate-800">Player not on the list?</div>
          <p className="text-xs text-slate-500 mt-0.5">Have a parent scan this to sign the waiver right now{team && team !== '__other' ? ` — it opens with ${teamLabel(team)} already picked` : ''}. The new entry appears here when you come back to this screen (or tap refresh).</p>
          <div className="mt-3 flex flex-col sm:flex-row items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR code for the waiver form" width={180} height={180} className="w-[180px] h-[180px] rounded-lg border border-slate-200 bg-white flex-shrink-0" />
            <div className="flex flex-col gap-2 w-full sm:w-auto min-w-0">
              <button onClick={shareLink} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3 py-2 inline-flex items-center justify-center gap-1.5"><Share2 size={14} /> Share link</button>
              <a href={formUrl} target="_blank" rel="noreferrer" className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5"><ExternalLink size={14} /> Open form</a>
              <div className="text-[11px] text-slate-400 break-all">{formUrl}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  ) : null

  const renderExpanded = (s: Sub) => editing === s.id ? (
    <WaiverEditForm key={s.id} form={form} setForm={setForm} teamGroups={teamGroups} otherTeams={otherTeams} onSave={saveEdit} onCancel={() => setEditing(null)} saving={savingEdit} />
  ) : (
    <>
      <Detail d={s.data} />
      <div className="flex items-center justify-between gap-3 mt-3">
        <div className="text-xs text-slate-400">Submitted {fmt(s.submittedAt)}{s.edits?.length ? ` · edited ${fmtShort(s.edits[s.edits.length - 1].at)}` : ''}</div>
        <button onClick={() => startEdit(s)} className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 border border-teal-200 hover:bg-teal-50 rounded-lg px-2.5 py-1.5 flex-shrink-0"><Pencil size={13} /> Edit</button>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6">
      <Toaster />
      <div className="max-w-5xl mx-auto">
        <TournamentNav id={id} name={name} logoUrl={logo} />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 sm:mt-6 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Player waivers</h1>
            <p className="text-sm text-slate-500">{grandTotal} submission{grandTotal === 1 ? '' : 's'} for this tournament.</p>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            {grandTotal > 0 && (
              <button onClick={toggleCheckMode} aria-pressed={checkMode}
                className={`col-span-2 sm:col-auto text-sm font-semibold rounded-lg px-3 py-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap border ${checkMode ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700' : 'border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50'}`}>
                <ClipboardCheck size={15} /> {checkMode ? 'Check-in mode on' : 'Check-in mode'}
              </button>
            )}
            <Link href={`/tournaments/${id}/player-waiver`} target="_blank" className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><ExternalLink size={14} /> Open form</Link>
            {grandTotal > 0 && passOn && <Link href={`/tournaments/${id}/player-waivers/badges${team ? `?team=${encodeURIComponent(team)}` : ''}`} className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><Printer size={14} /> Print badges</Link>}
            {grandTotal > 0 && <button onClick={exportCsv} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3 py-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><Download size={14} /> Export{filtering ? ` (${total})` : ' CSV'}</button>}
          </div>
        </div>

        {/* Scanned player pass */}
        {scanId && (
          <div className="bg-white border-2 border-teal-300 rounded-2xl p-4 mb-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700 inline-flex items-center gap-1.5"><ScanLine size={14} /> Scanned pass</div>
              <button onClick={closeScan} className="text-xs font-semibold text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1"><X size={12} /> Done</button>
            </div>
            {scanErr ? (
              <p className="text-sm text-rose-600">{scanErr}</p>
            ) : !scan ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (() => { const d = scan.data || {}; const on = !!scan.checkedInAt; return (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar d={d} size={72} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg font-bold text-slate-900 truncate">{d.playerName || '—'}</span>
                      {d.jerseyNumber && <span className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5 flex-shrink-0">#{d.jerseyNumber}</span>}
                    </div>
                    <div className="text-sm text-slate-600 truncate">{teamLabel(d.teamName)}{d.grade ? ` · Grade ${d.grade}` : ''}</div>
                    <div className="text-xs text-emerald-700 font-medium mt-0.5 inline-flex items-center gap-1"><CheckCircle2 size={13} /> Waiver signed {fmtShort(scan.submittedAt)}</div>
                    {on && <div className="text-xs text-slate-500 mt-0.5">Checked in {timeOf(scan.checkedInAt)}{scan.checkedInBy && scan.checkedInBy !== 'you' ? ` · ${scan.checkedInBy}` : ''}</div>}
                  </div>
                </div>
                <button onClick={toggleScanCheckIn} aria-pressed={on}
                  className={`sm:w-52 text-base font-bold rounded-xl px-4 py-3.5 inline-flex items-center justify-center gap-2 border transition-colors ${on ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700' : 'bg-white border-emerald-400 text-emerald-700 hover:bg-emerald-50'}`}>
                  {on ? <><CheckCircle2 size={20} /> Checked in</> : <><Circle size={20} /> Check in</>}
                </button>
              </div>
            ) })()}
          </div>
        )}

        {/* Search + roster picker */}
        {(grandTotal > 0 || filtering) && (
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search player, parent, email, phone, US Lacrosse #…"
                className="w-full border border-slate-300 rounded-lg pl-9 pr-9 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
              {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"><X size={14} /></button>}
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <select value={team} onChange={e => setTeam(e.target.value)} className="min-w-0 sm:w-56 border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">All teams ({grandTotal})</option>
                {teams.map(t => <option key={t.name || '(blank)'} value={t.name}>{teamLabel(t.name)} ({t.count})</option>)}
              </select>
              <select value={sort} onChange={e => setSort(e.target.value as any)} className="min-w-0 sm:w-36 border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="newest">{team ? 'Jersey # (roster)' : 'Newest first'}</option>
                <option value="name">Name A–Z</option>
                <option value="jersey">Jersey #</option>
              </select>
            </div>
          </div>
        )}

        {checkPanel}

        {loading && subs.length === 0 ? <p className="text-slate-400 text-center py-16">Loading…</p>
          : grandTotal === 0 && !filtering ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
              <Inbox size={32} className="mx-auto mb-2" />
              No waivers submitted yet. Share the form from the public page or the link below.
            </div>
          ) : subs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400">
              No players match{q.trim() ? ` “${q.trim()}”` : ''}{team ? ` on ${teamLabel(team)}` : ''}.
              <button onClick={() => { setQ(''); setTeam('') }} className="block mx-auto mt-2 text-sm text-teal-600 hover:underline">Clear filters</button>
            </div>
          ) : (
            <>
              {team && !checkMode && (
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h2 className="text-sm font-semibold text-slate-700 truncate">{teamLabel(team)} roster · {total} player{total === 1 ? '' : 's'}</h2>
                  <button onClick={() => setTeam('')} className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap">All teams</button>
                </div>
              )}

              {checkMode && visible.length === 0 && subs.length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500 mb-2">
                  {showOnly === 'out' ? 'Everyone on the list is checked in.' : 'Nobody checked in yet — tap the circle next to a player as they arrive.'}
                </div>
              )}

              {/* Phones: one card per player */}
              <div className="sm:hidden space-y-2">
                {visible.map(s => {
                  const d = s.data || {}
                  const isOpen = open === s.id
                  const done = checkMode && !!s.checkedInAt
                  return (
                    <div key={s.id} className={`border rounded-xl overflow-hidden ${done ? 'bg-emerald-50/60 border-emerald-200' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-stretch">
                        {checkMode && <div className="flex items-center pl-2">{checkBtn(s, 34)}</div>}
                        <button onClick={() => setOpen(isOpen ? null : s.id)} className="min-w-0 flex-1 text-left px-3 py-2.5 flex items-start gap-3">
                          <Avatar d={d} size={40} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`font-semibold truncate ${done ? 'text-emerald-900' : 'text-slate-800'}`}>{d.playerName || '—'}</span>
                              {d.jerseyNumber && <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-1.5 py-0.5 flex-shrink-0">#{d.jerseyNumber}</span>}
                            </div>
                            <div className="text-sm text-slate-600 truncate">{teamLabel(d.teamName)}{d.grade ? ` · Grade ${d.grade}` : ''}</div>
                            <div className="text-xs text-slate-400 truncate">{done ? `Checked in ${timeOf(s.checkedInAt)}${s.checkedInBy && s.checkedInBy !== 'you' ? ` · ${s.checkedInBy}` : ''}` : `${d.parentName || '—'} · ${fmtShort(s.submittedAt)}`}</div>
                          </div>
                          <ChevronDown size={16} className={`text-slate-400 flex-shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                      {!isOpen && (d.parentPhone || d.parentEmail) && (
                        <div className="px-3 pb-2.5 -mt-1 flex gap-2">
                          {d.parentPhone && <a href={`tel:${d.parentPhone}`} className="inline-flex items-center gap-1 text-xs text-teal-700 border border-teal-200 rounded-lg px-2 py-1"><Phone size={12} /> {d.parentPhone}</a>}
                          {d.parentEmail && <a href={`mailto:${d.parentEmail}`} className="inline-flex items-center gap-1 text-xs text-teal-700 border border-teal-200 rounded-lg px-2 py-1 min-w-0"><Mail size={12} /> <span className="truncate">Email</span></a>}
                        </div>
                      )}
                      {isOpen && <div className="px-3 py-3 bg-slate-50 border-t border-slate-100">{renderExpanded(s)}</div>}
                    </div>
                  )
                })}
              </div>

              {/* Desktop: table */}
              <div className="hidden sm:block bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-left text-xs uppercase tracking-wide">
                    <tr>{checkMode && <th className="pl-4 pr-1 py-2.5 font-semibold">In</th>}<th className="px-4 py-2.5 font-semibold">Player</th><th className="px-4 py-2.5 font-semibold">Team</th><th className="px-4 py-2.5 font-semibold">Grade</th><th className="px-4 py-2.5 font-semibold">Parent</th><th className="px-4 py-2.5 font-semibold">{checkMode ? 'Checked in' : 'Submitted'}</th><th className="px-4 py-2.5"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map(s => {
                      const d = s.data || {}
                      const done = checkMode && !!s.checkedInAt
                      return (
                        <React.Fragment key={s.id}>
                          <tr className={`cursor-pointer ${done ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-slate-50'}`} onClick={() => setOpen(open === s.id ? null : s.id)}>
                            {checkMode && <td className="pl-4 pr-1 py-1.5">{checkBtn(s, 26)}</td>}
                            <td className="px-4 py-2.5 font-medium text-slate-800"><span className="inline-flex items-center gap-2.5"><Avatar d={d} size={28} />{d.playerName || '—'}{d.jerseyNumber && <span className="text-xs font-semibold text-teal-700">#{d.jerseyNumber}</span>}</span></td>
                            <td className="px-4 py-2.5 text-slate-600">{teamLabel(d.teamName)}</td>
                            <td className="px-4 py-2.5 text-slate-600">{d.grade || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-600">{d.parentName || '—'}<br /><span className="text-xs text-slate-400">{d.parentEmail}</span></td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs">{checkMode ? (s.checkedInAt ? `${timeOf(s.checkedInAt)}${s.checkedInBy && s.checkedInBy !== 'you' ? ` · ${s.checkedInBy}` : ''}` : '—') : fmt(s.submittedAt)}</td>
                            <td className="px-4 py-2.5 text-slate-400"><ChevronRight size={15} className={open === s.id ? 'rotate-90 transition-transform' : 'transition-transform'} /></td>
                          </tr>
                          {open === s.id && (
                            <tr><td colSpan={checkMode ? 7 : 6} className="px-4 py-3 bg-slate-50">{renderExpanded(s)}</td></tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 mt-3 text-xs text-slate-400">
                <span>Showing {visible.length} of {total}{filtering ? ` matching (${grandTotal} total)` : ''}{loading ? ' · updating…' : ''}</span>
                {total > subs.length && (
                  <button onClick={loadMore} disabled={loadingMore} className="text-sm font-medium text-teal-600 hover:text-teal-800 border border-teal-200 hover:bg-teal-50 disabled:opacity-50 rounded-lg px-3 py-1.5">{loadingMore ? 'Loading…' : `Show ${Math.min(PAGE, total - subs.length)} more`}</button>
                )}
              </div>
            </>
          )}
      </div>
    </div>
  )
}
