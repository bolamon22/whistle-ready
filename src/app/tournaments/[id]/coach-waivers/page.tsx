'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { ArrowLeft, Check, Download, ExternalLink, RotateCcw, Search, ShieldCheck, X } from 'lucide-react'
import TournamentNav from '../TournamentNav'

// Who has signed the coach waiver, and the coaches'-tent check-in.
//
// WHY THIS PAGE EXISTS: the coach credential already carried a QR and an Apple
// Wallet pass, but nothing on the staff side consumed them — a coach could show
// a pass at the gate and there was no way to mark them present, or even to see
// the list. Scanning the QR lands here with ?id=<submission>, which opens the
// panel at the top for a one-tap check-in.
//
// Kept as a mirror of the player-waivers page rather than something new, so the
// two behave the same on a phone at a field with one hand full.

type Sub = {
  id: string
  submittedAt: string
  checkedInAt: string | null
  checkedInBy: string | null
  archivedAt: string | null
  passToken: string | null
  data: Record<string, any>
}

const fmtDay = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const fmtTime = (iso: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
const CERT_SHORT: Record<string, string> = {
  'USA Lacrosse Certified': 'USAL',
  'NFHS / State Certified': 'NFHS',
  'CPR / First Aid / AED Certified': 'CPR/AED',
  'SafeSport / Abuse Prevention Trained': 'SafeSport',
}
const teamsOf = (d: Record<string, any>): string[] =>
  Array.isArray(d?.teams) ? d.teams.map((t: any) => String(t?.team || '')).filter(Boolean) : []
const nameOf = (d: Record<string, any>) => String(d?.coachFullName || '').trim() || '(no name)'

export default function CoachWaiversPage() {
  const params = useParams<{ id: string }>()
  const id = String(params?.id || '')
  // A scanned credential lands here as ?coach=<submission id | passToken>,
  // matching the player page's ?player=. Read off window rather than
  // useSearchParams(), which forces a Suspense boundary — the sibling
  // player-waivers page and the club-director dashboard both do it this way.
  const [scanId, setScanId] = useState('')
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const sp = new URLSearchParams(window.location.search)
      setScanId(sp.get('coach') || sp.get('id') || '')
    } catch { /* no param, no panel */ }
  }, [])

  const [subs, setSubs] = useState<Sub[]>([])
  const [teams, setTeams] = useState<{ name: string; count: number }[]>([])
  const [counts, setCounts] = useState({ total: 0, grandTotal: 0, checkedIn: 0, archivedTotal: 0 })
  const [q, setQ] = useState('')
  const [qDeb, setQDeb] = useState('')
  const [team, setTeam] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [scan, setScan] = useState<Sub | null>(null)

  useEffect(() => { const t = setTimeout(() => setQDeb(q), 250); return () => clearTimeout(t) }, [q])

  const url = `/api/tournaments/${id}/coach-waivers`

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetch(`${url}?q=${encodeURIComponent(qDeb)}&team=${encodeURIComponent(team)}&sort=name&limit=5000${showArchived ? '&archived=1' : ''}`)
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error || 'Could not load'); setSubs([]); return }
      setSubs(d.submissions || [])
      setTeams(d.teams || [])
      setCounts({
        total: d.total || 0, grandTotal: d.grandTotal || 0,
        checkedIn: d.checkedIn || 0, archivedTotal: d.archivedTotal || 0,
      })
    } catch { toast.error('Could not load') } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, qDeb, team, showArchived])

  useEffect(() => { load() }, [load])

  // A scanned credential opens its own panel so the person at the tent does not
  // have to find the row in a list of ninety.
  useEffect(() => {
    if (!scanId || !id) return
    // Submission ids and pass tokens look different; hand it over as both and
    // let the route resolve whichever it is.
    const p = `id=${encodeURIComponent(scanId)}&token=${encodeURIComponent(scanId)}`
    fetch(`${url}?${p}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.submission) setScan(d.submission); else toast.error('That credential is not from this event') })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId, id])

  async function toggleCheckIn(s: Sub, on: boolean) {
    setBusy(s.id)
    try {
      const res = await fetch(url, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, checkIn: on }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error || 'Could not update'); return }
      const next = d.submission as Sub
      setSubs(p => p.map(x => x.id === s.id ? next : x))
      if (scan?.id === s.id) setScan(next)
      setCounts(c => ({ ...c, checkedIn: c.checkedIn + (on ? 1 : -1) }))
      toast.success(on ? `${nameOf(s.data)} checked in` : 'Check-in undone')
    } catch { toast.error('Could not update') } finally { setBusy('') }
  }

  async function toggleArchive(s: Sub, on: boolean) {
    setBusy(s.id)
    try {
      const res = await fetch(url, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, archive: on }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d?.error || 'Could not update'); return }
      setSubs(p => p.filter(x => x.id !== s.id))
      toast.success(on ? 'Archived' : 'Restored')
      load()
    } catch { toast.error('Could not update') } finally { setBusy('') }
  }

  async function clearAll() {
    const scope = team ? `for ${team}` : 'for the whole event'
    if (!confirm(`Clear every coach check-in ${scope}? Used between days — the waivers are untouched.`)) return
    const res = await fetch(url, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearCheckIns: true, team: team || undefined }),
    })
    const d = await res.json()
    if (!res.ok) { toast.error(d?.error || 'Could not clear'); return }
    toast.success(`Cleared ${d.cleared} check-in${d.cleared === 1 ? '' : 's'}`)
    load()
  }

  function exportCsv() {
    const head = ['Coach', 'Role', 'Club', 'Teams', 'Division', 'Email', 'Mobile',
      'Emergency contact', 'Emergency phone', 'Hotel', 'Certifications',
      'Highest level', 'Signed', 'Waiver version', 'Checked in']
    const rows = subs.map(s => {
      const d = s.data || {}
      return [
        nameOf(d), d.coachingRole || '', d.clubName || '', teamsOf(d).join(' / '),
        d.division || '', d.email || '', d.mobilePhone || '',
        d.emergencyContactName || '', d.emergencyContactPhone || '',
        d.accommodationStatus || '',
        Array.isArray(d.certifications) ? d.certifications.join(' / ') : '',
        d.highestLevelCoached || '',
        s.submittedAt || '', d.waiverVersion || '',
        s.checkedInAt ? `${fmtDay(s.checkedInAt)} ${fmtTime(s.checkedInAt)}` : '',
      ]
    })
    const csv = [head, ...rows]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `coach-waivers${team ? '-' + team.replace(/[^\w-]+/g, '_') : ''}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const pct = counts.grandTotal ? Math.round((counts.checkedIn / counts.grandTotal) * 100) : 0
  const shown = useMemo(() => subs, [subs])

  const chip = 'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap'

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <Toaster />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4">
        <TournamentNav id={id} name="" />

        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Coach waivers</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {counts.grandTotal} signed · {counts.checkedIn} checked in{counts.grandTotal ? ` (${pct}%)` : ''}
              {counts.archivedTotal > 0 && ` · ${counts.archivedTotal} archived`}
            </p>
          </div>
          <Link href={`/tournaments/${id}/coach-waiver`} target="_blank"
            className={`${chip} border-slate-300 text-slate-600 hover:bg-white`}>
            <ExternalLink size={14} /> Open form
          </Link>
        </div>

        {/* Scanned credential — the reason the QR exists */}
        {scan && (
          <div className="bg-white border-2 border-teal-400 rounded-2xl p-5 mb-4 shadow-sm">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-teal-600 mb-1">Scanned credential</p>
                <p className="text-lg font-bold text-slate-900">{nameOf(scan.data)}</p>
                <p className="text-sm text-slate-500">
                  {scan.data?.coachingRole || 'Coach'}
                  {scan.data?.clubName ? ` · ${scan.data.clubName}` : ''}
                </p>
                {!!teamsOf(scan.data).length && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {teamsOf(scan.data).map(t => (
                      <span key={t} className="text-[11px] bg-slate-100 text-slate-600 rounded px-2 py-0.5">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                {scan.checkedInAt ? (
                  <>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
                      <Check size={14} /> Checked in {fmtTime(scan.checkedInAt)}
                    </span>
                    <button onClick={() => toggleCheckIn(scan, false)} disabled={busy === scan.id}
                      className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2">Undo</button>
                  </>
                ) : (
                  <button onClick={() => toggleCheckIn(scan, true)} disabled={busy === scan.id}
                    className="bg-slate-900 text-white text-sm font-bold rounded-xl px-6 py-3 hover:bg-slate-700 disabled:opacity-50">
                    {busy === scan.id ? 'Checking in…' : 'Check in'}
                  </button>
                )}
                <button onClick={() => setScan(null)} className="text-xs text-slate-400 hover:text-slate-600 inline-flex items-center gap-1">
                  <X size={12} /> Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, club, email…"
              className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <select value={team} onChange={e => setTeam(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-600 focus:outline-none">
            <option value="">All teams</option>
            {teams.map(t => <option key={t.name} value={t.name}>{t.name} ({t.count})</option>)}
          </select>
          <button onClick={exportCsv} disabled={!shown.length} className={`${chip} border-slate-300 text-slate-600 hover:bg-white disabled:opacity-40`}>
            <Download size={14} /> CSV
          </button>
          <button onClick={clearAll} className={`${chip} border-slate-300 text-slate-600 hover:bg-white`}>
            <RotateCcw size={14} /> Clear check-ins
          </button>
          <button onClick={() => setShowArchived(v => !v)}
            className={`${chip} ${showArchived ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-600 hover:bg-white'}`}>
            Archived {counts.archivedTotal > 0 && `(${counts.archivedTotal})`}
          </button>
        </div>

        {/* List */}
        {loading && !shown.length ? (
          <p className="text-sm text-slate-400 py-12 text-center">Loading…</p>
        ) : !shown.length ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <ShieldCheck size={26} className="text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-600">
              {showArchived ? 'Nothing archived' : qDeb || team ? 'No coaches match that' : 'No coach waivers yet'}
            </p>
            {!showArchived && !qDeb && !team && (
              <p className="text-xs text-slate-400 mt-1">
                Send them <Link href={`/tournaments/${id}/coach-waiver`} className="text-teal-700 hover:underline">the form</Link> — every coach on the sideline needs one.
              </p>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {shown.map((s, i) => {
              const d = s.data || {}
              const certs = Array.isArray(d.certifications) ? d.certifications : []
              const inNow = !!s.checkedInAt
              return (
                <div key={s.id} className={`px-4 sm:px-5 py-3.5 flex items-center gap-3 flex-wrap ${i > 0 ? 'border-t border-slate-100' : ''} ${inNow ? 'bg-emerald-50/40' : ''}`}>
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{nameOf(d)}</span>
                      <span className="text-[10px] font-bold uppercase tracking-wide bg-rose-50 text-rose-700 border border-rose-200 rounded px-1.5 py-0.5">
                        {d.coachingRole || 'Coach'}
                      </span>
                      {certs.map((c: string) => (
                        <span key={c} className="text-[9.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">
                          {CERT_SHORT[c] || c}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {d.clubName || '—'}
                      {!!teamsOf(d).length && <span className="text-slate-400"> · {teamsOf(d).join(', ')}</span>}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {d.email || ''}{d.mobilePhone ? ` · ${d.mobilePhone}` : ''}
                      {s.submittedAt ? ` · signed ${fmtDay(s.submittedAt)}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {s.passToken && (
                      <Link href={`/coach/${s.passToken}`} target="_blank"
                        className="text-xs text-slate-400 hover:text-slate-700" title="Open their credential">
                        <ExternalLink size={14} />
                      </Link>
                    )}
                    {showArchived ? (
                      <button onClick={() => toggleArchive(s, false)} disabled={busy === s.id}
                        className={`${chip} border-slate-300 text-slate-600 hover:bg-slate-50`}>Restore</button>
                    ) : (
                      <>
                        <button onClick={() => toggleCheckIn(s, !inNow)} disabled={busy === s.id}
                          className={`${chip} ${inNow
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                          {inNow ? <><Check size={13} /> In {fmtTime(s.checkedInAt!)}</> : 'Check in'}
                        </button>
                        <button onClick={() => toggleArchive(s, true)} disabled={busy === s.id}
                          className="text-xs text-slate-300 hover:text-rose-600" title="Archive">
                          <X size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <Link href={`/tournaments/${id}/registrations`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mt-5">
          <ArrowLeft size={15} /> Team registrations
        </Link>
      </div>
    </div>
  )
}
