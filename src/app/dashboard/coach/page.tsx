'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface Tournament { id: string; name: string; startDate: string; logoUrl: string }
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean
}
interface CoachProfile { tournamentId: string; teamName: string }

export default function CoachDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [profile, setProfile] = useState<CoachProfile | null>(null)
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [selTournament, setSelTournament] = useState('')
  const [selTeam, setSelTeam] = useState('')
  const [saving, setSaving] = useState(false)
  const [teamNames, setTeamNames] = useState<string[]>([])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/coach/profile').then(r => r.json()),
      fetch('/api/tournaments').then(r => r.json()),
    ]).then(([p, t]) => {
      setTournaments(t)
      if (p && !p.error) {
        setProfile(p)
        loadGames(p.tournamentId, p.teamName)
      }
      setLoading(false)
    })
  }, [status])

  const loadGames = async (tournamentId: string, teamName: string) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/games`)
    const all: Game[] = await res.json()
    setGames(all.filter(g => g.team1 === teamName || g.team2 === teamName))
  }

  const loadTeams = async (tournamentId: string) => {
    const res = await fetch(`/api/registrations?tournamentId=${tournamentId}`)
    const regs = await res.json()
    const names = Array.from(new Set(
      regs.flatMap((r: { teams: { teamName: string }[] }) => r.teams.map((t: { teamName: string }) => t.teamName).filter(Boolean))
    )).sort() as string[]
    setTeamNames(names)
  }

  const saveProfile = async () => {
    if (!selTournament || !selTeam) return
    setSaving(true)
    const res = await fetch('/api/coach/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: selTournament, teamName: selTeam }),
    })
    const p = await res.json()
    setProfile(p)
    loadGames(p.tournamentId, p.teamName)
    setSaving(false)
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  // First time setup
  if (!profile) return (
    <div className="max-w-lg mx-auto py-16">
      <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
        <div className="text-4xl mb-4">🏒</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Welcome, Coach {session?.user?.name}!</h1>
        <p className="text-gray-500 text-sm mb-6">Select your tournament and team to get started.</p>
        <div className="space-y-3 text-left">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tournament</label>
            <select value={selTournament} onChange={e => { setSelTournament(e.target.value); setSelTeam(''); loadTeams(e.target.value) }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select tournament…</option>
              {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {selTournament && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Team</label>
              <select value={selTeam} onChange={e => setSelTeam(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select team…</option>
                {teamNames.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          <button onClick={saveProfile} disabled={!selTournament || !selTeam || saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl py-2.5 text-sm mt-2">
            {saving ? 'Saving…' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  )

  const upcoming = games.filter(g => !g.isCanceled).sort((a, b) => `${a.date}${a.startTime}` < `${b.date}${b.startTime}` ? -1 : 1)
  const tournament = tournaments.find(t => t.id === profile.tournamentId)

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Coach Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            <span className="font-medium text-blue-600">{profile.teamName}</span>
            {tournament && ` · ${tournament.name}`}
          </p>
        </div>
        <button onClick={() => setProfile(null)} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg">
          Switch Team
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 mb-5 flex gap-6 text-sm">
        <div><span className="text-blue-400">Games:</span> <strong className="text-blue-700">{upcoming.length}</strong></div>
        <div><span className="text-blue-400">Wins:</span> <strong className="text-blue-700">{upcoming.filter(g => (g.team1 === profile.teamName && (g.score1 ?? 0) > (g.score2 ?? 0)) || (g.team2 === profile.teamName && (g.score2 ?? 0) > (g.score1 ?? 0))).length}</strong></div>
        <div><span className="text-blue-400">Losses:</span> <strong className="text-blue-700">{upcoming.filter(g => (g.team1 === profile.teamName && (g.score1 ?? 0) < (g.score2 ?? 0)) || (g.team2 === profile.teamName && (g.score2 ?? 0) < (g.score1 ?? 0))).length}</strong></div>
      </div>

      <div className="space-y-3">
        {upcoming.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No games scheduled yet.</div>
        ) : (
          upcoming.map(g => {
            const isTeam1 = g.team1 === profile.teamName
            const opponent = isTeam1 ? g.team2 : g.team1
            const myScore = isTeam1 ? g.score1 : g.score2
            const oppScore = isTeam1 ? g.score2 : g.score1
            const hasScore = myScore !== null && oppScore !== null
            const won = hasScore && myScore! > oppScore!
            const lost = hasScore && myScore! < oppScore!
            return (
              <div key={g.id} className={`bg-white border rounded-xl px-5 py-4 flex items-center gap-4 ${won ? 'border-green-200' : lost ? 'border-red-200' : 'border-gray-200'}`}>
                <div className="text-center w-12 flex-shrink-0">
                  <div className="text-xs text-gray-400">{g.date}</div>
                  <div className="text-sm font-semibold text-gray-700">{g.startTime}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800">vs {opponent}</div>
                  <div className="text-xs text-gray-400">{g.division} · {g.location} · Game #{g.gameNumber}</div>
                </div>
                {hasScore ? (
                  <div className={`text-lg font-bold ${won ? 'text-green-600' : lost ? 'text-red-600' : 'text-gray-600'}`}>
                    {myScore} – {oppScore}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">Upcoming</span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
