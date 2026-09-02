'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import TournamentNav from '../TournamentNav'
import { Inbox, ChevronRight, ChevronDown, ExternalLink, Download, Search, X, Phone, Mail, Pencil } from 'lucide-react'

type Sub = { id: string; submittedAt: string; data: any; edits?: { at: string; by?: string; fields: string[] }[] }

// Friendly labels for the detail view (anything not listed falls back to a de-camelCased key).
const LABELS: Record<string, string> = {
  playerName: 'Player', playerEmail: 'Player email', usLacrosse: 'US Lacrosse #', dob: 'Date of birth', gender: 'Gender',
  grade: 'Grade', clubName: 'Club', teamName: 'Team', jerseyNumber: 'Jersey #', parentName: 'Parent', parentEmail: 'Parent email',
  parentPhone: 'Parent phone', parent2Name: 'Parent 2', parent2Email: 'Parent 2 email', parent2Phone: 'Parent 2 phone',
  emergencyName: 'Emergency contact', emergencyPhone: 'Emergency phone', hotel: 'Hotel / rental', hotelName: 'Where staying',
  newsletter: 'Newsletter', signature: 'Signature',
}
const DETAIL_ORDER = Object.keys(LABELS)
const HIDDEN_KEYS = ['tournamentId', 'tournamentName', 'agree', 'teamOther', 'teamPick']
const CSV_COLS = ['playerName', 'playerEmail', 'usLacrosse', 'dob', 'gender', 'grade', 'teamName', 'jerseyNumber', 'parentName', 'parentEmail', 'parentPhone', 'parent2Name', 'parent2Email', 'parent2Phone', 'emergencyName', 'emergencyPhone', 'hotel', 'hotelName', 'signature']
const PAGE = 100

const teamLabel = (t: any) => { const s = String(t || '').trim(); return !s ? '—' : s === '__other' ? 'Other / not listed' : s }
const jerseyNum = (j: any) => { const n = parseInt(String(j || '').replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY }
const norm = (s: any) => String(s ?? '').toLowerCase()
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
  const [subs, setSubs] = useState<Sub[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [team, setTeam] = useState('')
  const [sort, setSort] = useState<'newest' | 'name' | 'jersey'>('newest')
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [teamGroups, setTeamGroups] = useState<TeamGroup[]>([])

  useEffect(() => {
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null).then(d => { if (d) { setName(d.name || 'Tournament'); setLogo(d.logoUrl || undefined) } }).catch(() => {})
    fetch(`/api/tournaments/${id}/player-waivers`).then(r => r.ok ? r.json() : { submissions: [] }).then(d => setSubs(Array.isArray(d.submissions) ? d.submissions : [])).catch(() => {}).finally(() => setLoading(false))
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
    return [...new Set(subs.map(s => String(s.data?.teamName || '').trim()).filter(t => t && t !== '__other' && !known.has(t)))].sort((a, b) => a.localeCompare(b))
  }, [subs, teamGroups])

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
    } catch { toast.error('Could not save') } finally { setSavingEdit(false) }
  }

  // Distinct teams with counts, for the roster picker
  const teams = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of subs) { const t = teamLabel(s.data?.teamName); m.set(t, (m.get(t) || 0) + 1) }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [subs])

  // Search + team filter + sort. Everything is client-side: a few thousand rows filter instantly.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let list = subs.filter(s => {
      const d = s.data || {}
      if (team && teamLabel(d.teamName) !== team) return false
      if (!needle) return true
      return [d.playerName, d.parentName, d.parent2Name, d.parentEmail, d.parent2Email, d.playerEmail, teamLabel(d.teamName), d.usLacrosse, d.jerseyNumber, d.parentPhone, d.parent2Phone, d.emergencyName, d.grade]
        .some(v => norm(v).includes(needle))
    })
    const effSort = sort === 'newest' && team ? 'jersey' : sort   // a team roster reads best in jersey order
    if (effSort === 'name') list = list.slice().sort((a, b) => norm(a.data?.playerName).localeCompare(norm(b.data?.playerName)))
    else if (effSort === 'jersey') list = list.slice().sort((a, b) => (jerseyNum(a.data?.jerseyNumber) - jerseyNum(b.data?.jerseyNumber)) || norm(a.data?.playerName).localeCompare(norm(b.data?.playerName)))
    else list = list.slice().sort((a, b) => (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0))
    return list
  }, [subs, q, team, sort])

  useEffect(() => { setLimit(PAGE) }, [q, team, sort])
  const shown = rows.slice(0, limit)

  const fmt = (s: string) => { try { return new Date(s).toLocaleString() } catch { return s } }
  const fmtShort = (s: string) => { try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return s } }

  const exportCsv = () => {
    const head = ['Submitted', ...CSV_COLS].join(',')
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines = rows.map(s => [fmt(s.submittedAt), ...CSV_COLS.map(c => c === 'teamName' ? teamLabel(s.data?.teamName) : s.data?.[c])].map(esc).join(','))
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url
    a.download = `player-waivers${team ? '-' + team.replace(/[^\w-]+/g, '_') : ''}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const filtering = !!(q.trim() || team)

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
            <p className="text-sm text-slate-500">{subs.length} submission{subs.length === 1 ? '' : 's'} for this tournament.</p>
          </div>
          <div className="grid grid-cols-2 sm:flex items-center gap-2">
            <Link href={`/tournaments/${id}/player-waiver`} target="_blank" className="text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><ExternalLink size={14} /> Open form</Link>
            {subs.length > 0 && <button onClick={exportCsv} className="text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white rounded-lg px-3 py-2 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"><Download size={14} /> Export{filtering ? ` (${rows.length})` : ' CSV'}</button>}
          </div>
        </div>

        {/* Search + roster picker */}
        {subs.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search player, parent, email, phone, US Lacrosse #…"
                className="w-full border border-slate-300 rounded-lg pl-9 pr-9 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-400" />
              {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"><X size={14} /></button>}
            </div>
            <div className="grid grid-cols-2 sm:flex gap-2">
              <select value={team} onChange={e => setTeam(e.target.value)} className="min-w-0 sm:w-56 border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="">All teams ({subs.length})</option>
                {teams.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
              </select>
              <select value={sort} onChange={e => setSort(e.target.value as any)} className="min-w-0 sm:w-36 border border-slate-300 rounded-lg px-3 py-2.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                <option value="newest">{team ? 'Jersey # (roster)' : 'Newest first'}</option>
                <option value="name">Name A–Z</option>
                <option value="jersey">Jersey #</option>
              </select>
            </div>
          </div>
        )}

        {loading ? <p className="text-slate-400 text-center py-16">Loading…</p>
          : subs.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
              <Inbox size={32} className="mx-auto mb-2" />
              No waivers submitted yet. Share the form from the public page or the link below.
            </div>
          ) : rows.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400">
              No players match{q.trim() ? ` “${q.trim()}”` : ''}{team ? ` on ${team}` : ''}.
              <button onClick={() => { setQ(''); setTeam('') }} className="block mx-auto mt-2 text-sm text-teal-600 hover:underline">Clear filters</button>
            </div>
          ) : (
            <>
              {team && (
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h2 className="text-sm font-semibold text-slate-700 truncate">{team} roster · {rows.length} player{rows.length === 1 ? '' : 's'}</h2>
                  <button onClick={() => setTeam('')} className="text-xs text-slate-500 hover:text-slate-700 whitespace-nowrap">All teams</button>
                </div>
              )}

              {/* Phones: one card per player */}
              <div className="sm:hidden space-y-2">
                {shown.map(s => {
                  const d = s.data || {}
                  const isOpen = open === s.id
                  return (
                    <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <button onClick={() => setOpen(isOpen ? null : s.id)} className="w-full text-left px-3 py-2.5 flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-slate-800 truncate">{d.playerName || '—'}</span>
                            {d.jerseyNumber && <span className="text-[11px] font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-1.5 py-0.5 flex-shrink-0">#{d.jerseyNumber}</span>}
                          </div>
                          <div className="text-sm text-slate-600 truncate">{teamLabel(d.teamName)}{d.grade ? ` · Grade ${d.grade}` : ''}</div>
                          <div className="text-xs text-slate-400 truncate">{d.parentName || '—'} · {fmtShort(s.submittedAt)}</div>
                        </div>
                        <ChevronDown size={16} className={`text-slate-400 flex-shrink-0 mt-1 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
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
                    <tr><th className="px-4 py-2.5 font-semibold">Player</th><th className="px-4 py-2.5 font-semibold">Team</th><th className="px-4 py-2.5 font-semibold">Grade</th><th className="px-4 py-2.5 font-semibold">Parent</th><th className="px-4 py-2.5 font-semibold">Submitted</th><th className="px-4 py-2.5"></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {shown.map(s => {
                      const d = s.data || {}
                      return (
                        <React.Fragment key={s.id}>
                          <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(open === s.id ? null : s.id)}>
                            <td className="px-4 py-2.5 font-medium text-slate-800">{d.playerName || '—'}{d.jerseyNumber && <span className="ml-2 text-xs font-semibold text-teal-700">#{d.jerseyNumber}</span>}</td>
                            <td className="px-4 py-2.5 text-slate-600">{teamLabel(d.teamName)}</td>
                            <td className="px-4 py-2.5 text-slate-600">{d.grade || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-600">{d.parentName || '—'}<br /><span className="text-xs text-slate-400">{d.parentEmail}</span></td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs">{fmt(s.submittedAt)}</td>
                            <td className="px-4 py-2.5 text-slate-400"><ChevronRight size={15} className={open === s.id ? 'rotate-90 transition-transform' : 'transition-transform'} /></td>
                          </tr>
                          {open === s.id && (
                            <tr><td colSpan={6} className="px-4 py-3 bg-slate-50">{renderExpanded(s)}</td></tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between gap-3 mt-3 text-xs text-slate-400">
                <span>Showing {shown.length} of {rows.length}{filtering ? ` matching (${subs.length} total)` : ''}</span>
                {rows.length > shown.length && (
                  <button onClick={() => setLimit(l => l + PAGE)} className="text-sm font-medium text-teal-600 hover:text-teal-800 border border-teal-200 hover:bg-teal-50 rounded-lg px-3 py-1.5">Show {Math.min(PAGE, rows.length - shown.length)} more</button>
                )}
              </div>
            </>
          )}
      </div>
    </div>
  )
}
