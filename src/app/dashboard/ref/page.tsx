'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Radio, Target, Users, ClipboardCheck, TriangleAlert, Timer, Clock, Play, Square } from 'lucide-react'

interface Tournament { id: string; name: string; startDate: string; logoUrl: string }
interface Assignment { id: string; role: string; payRate: number; game: Game }
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  isCanceled: boolean; tournamentId: string
}

export default function RefDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [allGames, setAllGames] = useState<Game[]>([])
  const [selTournament, setSelTournament] = useState('')
  const [view, setView] = useState<'mine' | 'all'>('mine')
  const [loading, setLoading] = useState(true)
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set())
  const [punch, setPunch] = useState<any>(null)      // { worker, open, entries }
  const [punchBusy, setPunchBusy] = useState(false)
  const [, setNowTick] = useState(0)                  // re-render the elapsed timer

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/ref/assignments').then(r => r.json()),
      fetch('/api/tournaments').then(r => r.json()),
    ]).then(([a, t]) => {
      setAssignments(Array.isArray(a) ? a : [])
      setTournaments(Array.isArray(t) ? t : [])
      if (Array.isArray(t) && t.length > 0) { setSelTournament(t[0].id); loadAllGames(t[0].id) }
      setLoading(false)
    })
  }, [status])

  const loadAllGames = async (tournamentId: string) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/games`)
    const g = await res.json()
    setAllGames(Array.isArray(g) ? g : [])
  }

  function checkIn(id: string) {
    setCheckedIn(s => { const n = new Set(s); n.add(id); return n })
    toast.success('Checked in ✓')
  }

  // ── Punch clock (hourly staff: field ops + trainers) ──
  async function loadPunch(tid: string) {
    try { const d = await fetch(`/api/tournaments/${tid}/punch`).then(r => r.ok ? r.json() : null); setPunch(d) } catch {}
  }
  useEffect(() => {
    if (!selTournament) return
    loadPunch(selTournament)
    const t = setInterval(() => setNowTick(n => n + 1), 30000) // refresh elapsed display
    return () => clearInterval(t)
  }, [selTournament])

  const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  function teHours(e: any): number {
    if (e.hoursManual != null) return e.hoursManual
    if (e.clockIn && e.clockOut) { const [ih, im] = e.clockIn.split(':').map(Number); const [oh, om] = e.clockOut.split(':').map(Number); return Math.max(0, (oh * 60 + om - (ih * 60 + im)) / 60) }
    return 0
  }
  function elapsedLabel(clockIn: string): string {
    const [h, m] = clockIn.split(':').map(Number)
    const start = new Date(); start.setHours(h, m, 0, 0)
    let mins = Math.floor((Date.now() - start.getTime()) / 60000); if (mins < 0) mins = 0
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
  }
  const friendlyRole = (r?: string) => r === 'field_ops' ? 'Field Ops' : r === 'athletic_trainer' ? 'Athletic Trainer' : r === 'scorekeeper' ? 'Scorekeeper' : r === 'ref' ? 'Referee' : 'Staff'
  async function punchAction(action: 'in' | 'out') {
    if (!selTournament) return
    setPunchBusy(true)
    try {
      const res = await fetch(`/api/tournaments/${selTournament}/punch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, time: nowHHMM(), date: todayYMD() }),
      })
      if (res.ok) { toast.success(action === 'in' ? 'Clocked in ✓' : 'Clocked out ✓'); await loadPunch(selTournament) }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Failed') }
    } catch { toast.error('Failed') } finally { setPunchBusy(false) }
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  const myGameIds = new Set(assignments.map(a => a.game.id))
  const sortKey = (g: Game) => `${g.date || ''}${g.startTime || ''}`
  const mine = assignments
    .filter(a => !a.game.isCanceled)
    .map(a => ({ ...a.game, role: a.role, payRate: a.payRate }))
    .sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1)
  const upNext = mine[0]

  const displayGames: any[] = view === 'mine'
    ? mine
    : allGames.filter(g => g.tournamentId === selTournament)

  const roleLabel = punch?.worker?.defaultRole ? friendlyRole(punch.worker.defaultRole) : 'Staff'

  function GameCard({ g }: { g: any }) {
    const isScorekeeper = g.role === 'scorekeeper'
    return (
      <div className={`rounded-2xl border p-4 ${myGameIds.has(g.id) && view === 'all' ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'} card`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-bold text-gray-700">{g.startTime || 'TBD'}</span>
            <span>·</span><span>{g.location || '—'}</span>
            {g.gameNumber && <><span>·</span><span>#{g.gameNumber}</span></>}
          </div>
          {g.role && <span className="text-[10px] font-bold uppercase tracking-wide bg-green-100 text-green-700 px-2 py-0.5 rounded-full capitalize">{g.role}</span>}
        </div>
        <p className="text-sm font-semibold text-gray-800">{g.team1} <span className="text-gray-400 font-normal">vs</span> {g.team2}</p>
        <p className="text-xs text-gray-400 mb-3">{g.division}{g.date ? ' · ' + g.date : ''}{g.payRate ? ' · $' + g.payRate : ''}</p>
        <div className="flex gap-2">
          <button onClick={() => checkIn(g.id)} disabled={checkedIn.has(g.id)}
            className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60">
            {checkedIn.has(g.id) ? '📍 Checked in' : '📍 Check in'}
          </button>
          {isScorekeeper && !g.isCanceled && (
            <a href={`/tournaments/${g.tournamentId}/games/${g.id}/scorekeeper`}
              className="flex-1 text-center py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white">Open scorer →</a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      {/* Greeting */}
      <div className="mb-4">
        <p className="text-sm text-gray-400">{roleLabel}</p>
        <h1 className="text-2xl font-bold text-gray-800">Hi, {session?.user?.name?.split(' ')[0] || 'there'} 👋</h1>
      </div>

      {/* Time clock — hourly staff (field ops & athletic trainers) */}
      {punch?.worker && (punch.worker.defaultRole === 'field_ops' || punch.worker.defaultRole === 'athletic_trainer') && (() => {
        const open = punch.open
        const todayHrs = (punch.entries || []).filter((e: any) => e.date === todayYMD()).reduce((s: number, e: any) => s + teHours(e), 0)
        return (
          <div className="rounded-2xl border border-gray-200 bg-white card p-4 mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5"><Clock size={14} className="text-teal-600" /> Time clock</span>
              {todayHrs > 0 && <span className="text-xs text-gray-500">{todayHrs.toFixed(2)}h today</span>}
            </div>
            {open ? (
              <>
                <p className="text-sm text-gray-600 mb-2">Clocked in at <span className="font-semibold text-gray-800">{open.clockIn}</span> · <span className="text-emerald-600 font-semibold">{elapsedLabel(open.clockIn)}</span></p>
                <button onClick={() => punchAction('out')} disabled={punchBusy} className="w-full py-3 rounded-xl text-base font-bold bg-red-600 hover:bg-red-500 text-white disabled:opacity-60 inline-flex items-center justify-center gap-2"><Square size={16} /> Clock Out</button>
              </>
            ) : (
              <button onClick={() => punchAction('in')} disabled={punchBusy} className="w-full py-3 rounded-xl text-base font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 inline-flex items-center justify-center gap-2"><Play size={16} /> Clock In</button>
            )}
          </div>
        )
      })()}

      {/* Game day tools */}
      {selTournament && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Game day</p>
          <div className="grid grid-cols-2 gap-2">
            <Link href={`/tournaments/${selTournament}/communications`} className="flex items-center gap-2 bg-white border border-gray-200 card rounded-2xl p-3 text-sm font-semibold text-gray-700 hover:border-teal-300"><Radio size={18} className="text-teal-600" /> Field Request</Link>
            <Link href={`/tournaments/${selTournament}/scoring`} className="flex items-center gap-2 bg-white border border-gray-200 card rounded-2xl p-3 text-sm font-semibold text-gray-700 hover:border-teal-300"><Timer size={18} className="text-teal-600" /> Live scoring</Link>
            <Link href={`/tournaments/${selTournament}/scores`} className="flex items-center gap-2 bg-white border border-gray-200 card rounded-2xl p-3 text-sm font-semibold text-gray-700 hover:border-teal-300"><Target size={18} className="text-teal-600" /> Post scores</Link>
            <Link href={`/tournaments/${selTournament}/directory`} className="flex items-center gap-2 bg-white border border-gray-200 card rounded-2xl p-3 text-sm font-semibold text-gray-700 hover:border-teal-300"><Users size={18} className="text-teal-600" /> Staff contacts</Link>
            <Link href={`/tournaments/${selTournament}/checklist`} className="flex items-center gap-2 bg-white border border-gray-200 card rounded-2xl p-3 text-sm font-semibold text-gray-700 hover:border-teal-300"><ClipboardCheck size={18} className="text-teal-600" /> Setup checklist</Link>
            <Link href={`/tournaments/${selTournament}/incidents`} className="flex items-center gap-2 bg-white border border-gray-200 card rounded-2xl p-3 text-sm font-semibold text-gray-700 hover:border-teal-300"><TriangleAlert size={18} className="text-teal-600" /> Incidents</Link>
          </div>
        </div>
      )}

      {/* Up next */}
      {upNext ? (
        <div className="rounded-2xl border border-gray-200 bg-white card p-4 mb-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">● Up next</span>
            <span className="text-xs text-gray-500">{upNext.startTime || 'TBD'} · {upNext.location || '—'}</span>
          </div>
          <p className="text-base font-bold text-gray-800">{upNext.team1} vs {upNext.team2}</p>
          <p className="text-xs text-gray-400 mb-3">{upNext.division}</p>
          <div className="flex gap-2">
            <button onClick={() => checkIn(upNext.id)} disabled={checkedIn.has(upNext.id)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-60">
              {checkedIn.has(upNext.id) ? '📍 Checked in' : '📍 Check in'}
            </button>
            {upNext.role === 'scorekeeper' && (
              <a href={`/tournaments/${upNext.tournamentId}/games/${upNext.id}/scorekeeper`}
                className="flex-1 text-center py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white">Open scorer →</a>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white card p-5 mb-5 text-center text-sm text-gray-400">No upcoming assignments.</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-white border border-gray-200 card rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-800">{assignments.length}</div>
          <div className="text-[11px] text-gray-500">Assignments</div>
        </div>
        <div className="bg-white border border-gray-200 card rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-800">{assignments.filter(a => !a.game.isCanceled).length}</div>
          <div className="text-[11px] text-gray-500">Active</div>
        </div>
        <div className="bg-white border border-gray-200 card rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600">${assignments.reduce((s, a) => s + (a.payRate || 0), 0).toFixed(0)}</div>
          <div className="text-[11px] text-gray-500">Pay</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setView('mine')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === 'mine' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>
          My games ({assignments.length})
        </button>
        <button onClick={() => setView('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>
          All games
        </button>
        {view === 'all' && (
          <select value={selTournament} onChange={e => { setSelTournament(e.target.value); loadAllGames(e.target.value) }}
            className="ml-auto select border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-2 pb-8">
        {displayGames.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{view === 'mine' ? 'No assignments yet.' : 'No games found.'}</div>
        ) : (
          displayGames.map((g: any) => <GameCard key={g.id} g={g} />)
        )}
      </div>
    </div>
  )
}
