'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

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

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/ref/assignments').then(r => r.json()),
      fetch('/api/tournaments').then(r => r.json()),
    ]).then(([a, t]) => {
      setAssignments(Array.isArray(a) ? a : [])
      setTournaments(t)
      if (t.length > 0) { setSelTournament(t[0].id); loadAllGames(t[0].id) }
      setLoading(false)
    })
  }, [status])

  const loadAllGames = async (tournamentId: string) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/games`)
    const g = await res.json()
    setAllGames(Array.isArray(g) ? g : [])
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  const myGameIds = new Set(assignments.map(a => a.game.id))

  const displayGames = view === 'mine'
    ? assignments.map(a => ({ ...a.game, role: a.role, payRate: a.payRate }))
    : allGames.filter(g => g.tournamentId === selTournament)

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Welcome, {session?.user?.name} 👋</h1>
        <p className="text-gray-500 text-sm mt-0.5">Referee Dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{assignments.length}</div>
          <div className="text-xs text-green-600">My Assignments</div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-700">{assignments.filter(a => !a.game.isCanceled).length}</div>
          <div className="text-xs text-blue-600">Active Games</div>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-purple-700">${assignments.reduce((s, a) => s + a.payRate, 0).toFixed(0)}</div>
          <div className="text-xs text-purple-600">Total Pay</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setView('mine')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'mine' ? 'bg-green-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          My Games ({assignments.length})
        </button>
        <button onClick={() => setView('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
          All Games
        </button>
        {view === 'all' && (
          <select value={selTournament} onChange={e => { setSelTournament(e.target.value); loadAllGames(e.target.value) }}
            className="ml-auto border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none">
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-2">
        {displayGames.length === 0 ? (
          <div className="text-center py-12 text-gray-400">{view === 'mine' ? 'No assignments yet.' : 'No games found.'}</div>
        ) : (
          displayGames.map((g: any) => (
            <div key={g.id} className={`bg-white border rounded-xl px-5 py-3 flex items-center gap-4 ${myGameIds.has(g.id) && view === 'all' ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
              <div className="text-center w-14 flex-shrink-0">
                <div className="text-xs text-gray-400">{g.date}</div>
                <div className="text-sm font-semibold text-gray-700">{g.startTime}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800">{g.team1} vs {g.team2}</div>
                <div className="text-xs text-gray-400">{g.division} · {g.location} · #{g.gameNumber}</div>
              </div>
              {g.role && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full capitalize">{g.role}</span>}
              {g.payRate && <span className="text-xs text-gray-500">${g.payRate}</span>}
              {myGameIds.has(g.id) && view === 'all' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">My game</span>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
