'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'

interface Tournament { id: string; name: string; startDate: string; logoUrl: string; location: string }
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean
}
interface PlayerReg { id: string; playerName: string; teamClubName: string; tournamentId: string }

export default function ParentDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([])
  const [followed, setFollowed] = useState<string[]>([])
  const [teamFollows, setTeamFollows] = useState<{tournamentId: string; teamName: string}[]>([])
  const [linkedPlayers, setLinkedPlayers] = useState<PlayerReg[]>([])
  const [games, setGames] = useState<Record<string, Game[]>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'schedule' | 'teams' | 'players' | 'discover'>('schedule')
  const [selTournament, setSelTournament] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/tournaments').then(r => r.json()),
      fetch('/api/parent/follows').then(r => r.json()),
    ]).then(([t, f]) => {
      setAllTournaments(t)
      setFollowed(f.tournaments || [])
      setTeamFollows(f.teams || [])
      setLinkedPlayers(f.players || [])
      if (f.tournaments?.length > 0) {
        setSelTournament(f.tournaments[0])
        loadGames(f.tournaments[0])
      }
      setLoading(false)
    })
  }, [status])

  const loadGames = async (tournamentId: string) => {
    if (games[tournamentId]) return
    const res = await fetch(`/api/tournaments/${tournamentId}/games`)
    const g = await res.json()
    setGames(prev => ({ ...prev, [tournamentId]: g }))
  }

  const followTournament = async (id: string) => {
    await fetch('/api/parent/follows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'tournament', tournamentId: id }) })
    setFollowed(prev => [...prev, id])
    loadGames(id)
    toast.success('Tournament followed!')
  }

  const unfollowTournament = async (id: string) => {
    await fetch('/api/parent/follows', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'tournament', tournamentId: id }) })
    setFollowed(prev => prev.filter(f => f !== id))
    toast.success('Unfollowed.')
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  const followedTournaments = allTournaments.filter(t => followed.includes(t.id))
  const tournamentGames = games[selTournament] || []
  const followedTeamNames = teamFollows.filter(f => f.tournamentId === selTournament).map(f => f.teamName)
  const displayGames = tournamentGames.filter(g => !g.isCanceled).sort((a, b) => `${a.date}${a.startTime}` < `${b.date}${b.startTime}` ? -1 : 1)

  return (
    <div className="max-w-4xl mx-auto py-8">
      <Toaster />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Welcome, {session?.user?.name} 👋</h1>
        <p className="text-gray-500 text-sm mt-0.5">Parent Dashboard</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 border-b border-gray-200">
        {([['schedule','📅 Schedule'],['teams','⭐ My Teams'],['players','👤 My Players'],['discover','🔍 Discover']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === key ? 'border-pink-500 text-pink-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Schedule tab */}
      {tab === 'schedule' && (
        <div>
          {followedTournaments.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div className="text-4xl mb-3">📅</div>
              <p>You're not following any tournaments yet.</p>
              <button onClick={() => setTab('discover')} className="mt-3 text-pink-600 hover:underline text-sm">Discover tournaments →</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2 mb-4 flex-wrap">
                {followedTournaments.map(t => (
                  <button key={t.id} onClick={() => { setSelTournament(t.id); loadGames(t.id) }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${selTournament === t.id ? 'bg-pink-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {t.logoUrl && <img src={t.logoUrl} alt="" className="w-4 h-4 inline mr-1 rounded" />}
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                {displayGames.map(g => {
                  const isFollowed = followedTeamNames.includes(g.team1) || followedTeamNames.includes(g.team2)
                  return (
                    <div key={g.id} className={`bg-white border rounded-xl px-5 py-3 flex items-center gap-4 ${isFollowed ? 'border-pink-200 bg-pink-50' : 'border-gray-200'}`}>
                      <div className="text-center w-14 flex-shrink-0">
                        <div className="text-xs text-gray-400">{g.date}</div>
                        <div className="text-sm font-semibold text-gray-700">{g.startTime}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800">{g.team1} <span className="text-gray-400">vs</span> {g.team2}</div>
                        <div className="text-xs text-gray-400">{g.division} · {g.location}</div>
                      </div>
                      {(g.score1 !== null && g.score2 !== null) && (
                        <div className="text-sm font-bold text-gray-700">{g.score1} – {g.score2}</div>
                      )}
                      {isFollowed && <span className="text-xs bg-pink-100 text-pink-700 px-2 py-0.5 rounded-full">⭐ Following</span>}
                    </div>
                  )
                })}
                {displayGames.length === 0 && <div className="text-center py-8 text-gray-400">No games yet for this tournament.</div>}
              </div>
            </>
          )}
        </div>
      )}

      {/* Teams tab */}
      {tab === 'teams' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Teams you're following across tournaments.</p>
          {teamFollows.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Not following any teams yet. Browse the schedule and follow a team!</div>
          ) : (
            <div className="space-y-2">
              {teamFollows.map((f, i) => {
                const t = allTournaments.find(t => t.id === f.tournamentId)
                return (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-800">{f.teamName}</div>
                      <div className="text-xs text-gray-400">{t?.name}</div>
                    </div>
                    <button onClick={async () => {
                      await fetch('/api/parent/follows', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'team', tournamentId: f.tournamentId, teamName: f.teamName }) })
                      setTeamFollows(prev => prev.filter(x => !(x.tournamentId === f.tournamentId && x.teamName === f.teamName)))
                      toast.success('Unfollowed.')
                    }} className="text-xs text-red-400 hover:text-red-600">Unfollow</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Players tab */}
      {tab === 'players' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Link your child's player registration to track their games.</p>
          {linkedPlayers.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <div className="text-4xl mb-3">👤</div>
              <p>No players linked yet.</p>
              <p className="text-xs mt-1">Coming soon: search for your child's registration to link it here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedPlayers.map(p => (
                <div key={p.id} className="bg-white border border-gray-200 rounded-xl px-5 py-3">
                  <div className="font-medium text-gray-800">{p.playerName}</div>
                  <div className="text-xs text-gray-400">{p.teamClubName}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Discover tab */}
      {tab === 'discover' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Follow tournaments to see their schedules.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {allTournaments.map(t => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-3">
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt="logo" className="w-12 h-12 object-contain rounded-xl border border-gray-100 flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-pink-100 text-pink-700 font-bold text-lg flex items-center justify-center flex-shrink-0">{t.name[0]}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800 truncate">{t.name}</div>
                  <div className="text-xs text-gray-400">{t.location} · {t.startDate || 'TBD'}</div>
                </div>
                {followed.includes(t.id) ? (
                  <button onClick={() => unfollowTournament(t.id)} className="text-xs text-gray-400 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">Unfollow</button>
                ) : (
                  <button onClick={() => followTournament(t.id)} className="text-xs bg-pink-600 hover:bg-pink-700 text-white px-3 py-1.5 rounded-lg">Follow</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
