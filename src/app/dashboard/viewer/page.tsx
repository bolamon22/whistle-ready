'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

interface Tournament { id: string; name: string; startDate: string; endDate: string; logoUrl: string; location: string }
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean
}

export default function ViewerDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [followed, setFollowed] = useState<string[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selTournament, setSelTournament] = useState('')
  const [filterDiv, setFilterDiv] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/tournaments').then(r => r.json()),
      fetch('/api/parent/follows').then(r => r.json()),
    ]).then(([t, f]) => {
      setTournaments(t)
      setFollowed(f.tournaments || [])
      if (t.length > 0) { setSelTournament(t[0].id); loadGames(t[0].id) }
      setLoading(false)
    })
  }, [status])

  const loadGames = async (id: string) => {
    const g = await fetch(`/api/tournaments/${id}/games`).then(r => r.json())
    setGames(Array.isArray(g) ? g.filter((x: Game) => !x.isCanceled) : [])
  }

  const toggleFollow = async (id: string) => {
    const isFollowed = followed.includes(id)
    await fetch('/api/parent/follows', {
      method: isFollowed ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'tournament', tournamentId: id }),
    })
    setFollowed(prev => isFollowed ? prev.filter(f => f !== id) : [...prev, id])
    toast.success(isFollowed ? 'Unfollowed' : 'Following!')
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  const divisions = Array.from(new Set(games.map(g => g.division).filter(Boolean))).sort()
  const displayGames = games.filter(g => !filterDiv || g.division === filterDiv)
    .sort((a, b) => `${a.date}${a.startTime}` < `${b.date}${b.startTime}` ? -1 : 1)

  return (
    <div className="max-w-4xl mx-auto py-8">
      <Toaster />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Welcome, {session?.user?.name} 👋</h1>
        <p className="text-gray-500 text-sm mt-0.5">Browse tournament schedules</p>
      </div>

      {/* Tournament selector */}
      <div className="flex gap-2 flex-wrap mb-5">
        {tournaments.map(t => (
          <div key={t.id} className="flex items-center gap-1">
            <button onClick={() => { setSelTournament(t.id); setFilterDiv(''); loadGames(t.id) }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selTournament === t.id ? 'bg-sky-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {t.name}
            </button>
            <button onClick={() => toggleFollow(t.id)}
              className={`text-lg px-1 transition-transform hover:scale-110`} title={followed.includes(t.id) ? 'Unfollow' : 'Follow'}>
              {followed.includes(t.id) ? '⭐' : '☆'}
            </button>
          </div>
        ))}
      </div>

      {/* Division filter */}
      {divisions.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          <button onClick={() => setFilterDiv('')}
            className={`px-3 py-1 rounded-full text-xs font-medium ${!filterDiv ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            All
          </button>
          {divisions.map(d => (
            <button key={d} onClick={() => setFilterDiv(d)}
              className={`px-3 py-1 rounded-full text-xs font-medium ${filterDiv === d ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {d}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {displayGames.map(g => (
          <div key={g.id} className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center gap-4">
            <div className="text-center w-14 flex-shrink-0">
              <div className="text-xs text-gray-400">{g.date}</div>
              <div className="text-sm font-semibold text-gray-700">{g.startTime}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-800">{g.team1} <span className="text-gray-400">vs</span> {g.team2}</div>
              <div className="text-xs text-gray-400">{g.division} · {g.location}</div>
            </div>
            {g.score1 !== null && g.score2 !== null && (
              <div className="text-sm font-bold text-gray-700">{g.score1} – {g.score2}</div>
            )}
          </div>
        ))}
        {displayGames.length === 0 && <div className="text-center py-12 text-gray-400">No games found.</div>}
      </div>
    </div>
  )
}
