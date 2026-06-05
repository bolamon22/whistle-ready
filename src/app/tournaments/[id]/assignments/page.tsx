'use client'
import { useEffect, useState } from 'react'
import TournamentNav from '../TournamentNav'
import toast, { Toaster } from 'react-hot-toast'

interface Worker { id: string; name: string; certLevel: string; defaultRole: string }
interface Assignment { id: string; role: string; payRate: number; worker: Worker }
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  isCanceled: boolean; isChampionship: boolean; refCount: number
  assignments: Assignment[]
}

const ROLE_LABELS: Record<string, string> = {
  ref1: 'Official 1', ref2: 'Official 2', ref3: 'Official 3',
  scorekeeper: 'Scorekeeper', athletic_trainer: 'Athletic Trainer', field_ops: 'Field Ops',
}
const ROLE_COLORS: Record<string, string> = {
  ref1: 'bg-sky-100 text-sky-700', ref2: 'bg-violet-100 text-violet-700',
  ref3: 'bg-pink-100 text-pink-700', scorekeeper: 'bg-emerald-100 text-emerald-700',
  athletic_trainer: 'bg-amber-100 text-amber-700', field_ops: 'bg-teal-100 text-teal-700',
}

function fmt12(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function AssignmentsPage({ params }: { params: { id: string } }) {
  const [tName, setTName] = useState('')
  const [tLogo, setTLogo] = useState('')
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'game' | 'staff'>('game')
  const [selDate, setSelDate] = useState('')
  const [selDiv, setSelDiv] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(t => {
      setTName(t.name); setTLogo(t.logoUrl || '')
    })
    loadGames()
  }, [params.id])

  async function loadGames() {
    const [gRes, aRes] = await Promise.all([
      fetch(`/api/tournaments/${params.id}/games`).then(r => r.json()),
      fetch(`/api/assignments?tournamentId=${params.id}`).then(r => r.json()).catch(() => []),
    ])
    const aMap: Record<string, Assignment[]> = {}
    if (Array.isArray(aRes)) {
      aRes.forEach((a: Assignment & { gameId: string }) => {
        if (!aMap[a.gameId]) aMap[a.gameId] = []
        aMap[a.gameId].push(a)
      })
    }
    setGames(gRes.map((g: Game) => ({ ...g, assignments: aMap[g.id] || [] })))
    const dates = [...new Set(gRes.map((g: Game) => g.date))].sort() as string[]
    if (dates.length && !selDate) setSelDate(dates[0])
    setLoading(false)
  }

  async function removeAssignment(assignmentId: string) {
    setRemoving(assignmentId)
    await fetch(`/api/assignments/${assignmentId}`, { method: 'DELETE' })
    await loadGames()
    setRemoving(null)
    toast.success('Assignment removed')
  }

  const dates = [...new Set(games.map(g => g.date))].sort()
  const divisions = [...new Set(games.map(g => g.division))].sort()

  const filteredGames = games.filter(g => {
    if (g.isCanceled) return false
    if (selDate && g.date !== selDate) return false
    if (selDiv && g.division !== selDiv) return false
    return true
  }).sort((a, b) => a.startTime < b.startTime ? -1 : 1)

  // Stats
  const totalSlots = games.filter(g => !g.isCanceled).reduce((s, g) => s + g.refCount + 1, 0)
  const filledSlots = games.filter(g => !g.isCanceled).reduce((s, g) => s + g.assignments.length, 0)
  const pct = totalSlots > 0 ? Math.round(filledSlots / totalSlots * 100) : 0

  // Staff view — group by worker
  const staffMap = new Map<string, { worker: Worker; games: { game: Game; role: string; payRate: number; assignmentId: string }[] }>()
  games.filter(g => !g.isCanceled && (!selDate || g.date === selDate) && (!selDiv || g.division === selDiv))
    .forEach(g => g.assignments.forEach(a => {
      if (!staffMap.has(a.worker.id)) staffMap.set(a.worker.id, { worker: a.worker, games: [] })
      staffMap.get(a.worker.id)!.games.push({ game: g, role: a.role, payRate: a.payRate, assignmentId: a.id })
    }))
  const staffList = [...staffMap.values()].sort((a, b) => a.worker.name.localeCompare(b.worker.name))

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Toaster />
      <TournamentNav id={params.id} name={tName} logoUrl={tLogo} />
      <div className="max-w-5xl mx-auto px-4 pt-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Assignments</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {filledSlots} of {totalSlots} slots filled
              <span className={`ml-2 font-semibold ${pct >= 90 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{pct}%</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setView('game')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${view === 'game' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              By Game
            </button>
            <button onClick={() => setView('staff')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${view === 'staff' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              By Staff
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap mb-5">
          {dates.map(d => {
            const label = new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            return (
              <button key={d} onClick={() => setSelDate(d === selDate ? '' : d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selDate === d ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            )
          })}
          <select value={selDiv} onChange={e => setSelDiv(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 bg-white focus:outline-none">
            <option value="">All divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* ── By Game view ── */}
        {view === 'game' && (
          <div className="space-y-2">
            {filteredGames.length === 0 && <div className="text-center py-12 text-gray-400">No games found.</div>}
            {filteredGames.map(game => {
              const slots = game.refCount + 1
              const filled = game.assignments.length
              const complete = filled >= slots
              return (
                <div key={game.id} className={`bg-white border rounded-2xl overflow-hidden ${complete ? 'border-emerald-200' : filled > 0 ? 'border-amber-200' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-50">
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${game.isChampionship ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>#{game.gameNumber}</span>
                    <span className="text-xs text-gray-500">{fmt12(game.startTime)}</span>
                    <span className="text-sm font-medium text-gray-800 flex-1">{game.team1} <span className="text-gray-400 font-normal text-xs">vs</span> {game.team2}</span>
                    <span className="text-xs text-gray-400">{game.division}</span>
                    <span className="text-xs text-gray-400">{game.location}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${complete ? 'bg-emerald-100 text-emerald-700' : filled > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                      {filled}/{slots}
                    </span>
                  </div>
                  <div className="px-5 py-2.5 flex flex-wrap gap-2">
                    {game.assignments.length === 0
                      ? <span className="text-xs text-gray-400 italic">No staff assigned</span>
                      : game.assignments.map(a => (
                        <div key={a.id} className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg ${ROLE_COLORS[a.role] || 'bg-gray-100 text-gray-600'}`}>
                          <span className="font-medium">{a.worker.name}</span>
                          <span className="opacity-70">· {ROLE_LABELS[a.role] || a.role}</span>
                          <span className="opacity-60">· ${a.payRate}</span>
                          <button onClick={() => removeAssignment(a.id)} disabled={removing === a.id}
                            className="ml-1 opacity-50 hover:opacity-100 transition-opacity text-current">✕</button>
                        </div>
                      ))
                    }
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── By Staff view ── */}
        {view === 'staff' && (
          <div className="space-y-3">
            {staffList.length === 0 && <div className="text-center py-12 text-gray-400">No assignments in this view.</div>}
            {staffList.map(({ worker, games: wGames }) => {
              const totalPay = wGames.reduce((s, g) => s + g.payRate, 0)
              return (
                <div key={worker.id} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-50 bg-gray-50">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {worker.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                    <span className="font-semibold text-gray-800 flex-1">{worker.name}</span>
                    <span className="text-xs text-gray-400">{wGames.length} game{wGames.length !== 1 ? 's' : ''}</span>
                    <span className="text-sm font-semibold text-emerald-700">${totalPay.toFixed(0)}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {wGames.sort((a, b) => `${a.game.date}${a.game.startTime}` < `${b.game.date}${b.game.startTime}` ? -1 : 1).map(({ game, role, payRate, assignmentId }) => (
                      <div key={assignmentId} className="flex items-center gap-3 px-5 py-2.5">
                        <span className="text-xs text-gray-400 w-10">{fmt12(game.startTime)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[role] || 'bg-gray-100 text-gray-600'}`}>{ROLE_LABELS[role] || role}</span>
                        <span className="text-sm text-gray-700 flex-1">{game.team1} vs {game.team2}</span>
                        <span className="text-xs text-gray-400">{game.division}</span>
                        <span className="text-xs text-gray-500 font-medium">${payRate}</span>
                        <button onClick={() => removeAssignment(assignmentId)} disabled={removing === assignmentId}
                          className="text-red-300 hover:text-red-500 text-xs transition-colors">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
