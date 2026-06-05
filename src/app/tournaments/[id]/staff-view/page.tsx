'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

interface Tournament { id: string; name: string; logoUrl: string; startDate: string; endDate: string; location: string }
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null
  isCanceled: boolean; isChampionship: boolean
  myRole?: string; myPay?: number
}

const ROLE_LABELS: Record<string, string> = {
  ref1: 'Official 1', ref2: 'Official 2', ref3: 'Official 3',
  scorekeeper: 'Scorekeeper', athletic_trainer: 'Athletic Trainer', field_ops: 'Field Ops',
}
const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  ref1:            { bg: 'bg-sky-100',     text: 'text-sky-700'     },
  ref2:            { bg: 'bg-violet-100',  text: 'text-violet-700'  },
  ref3:            { bg: 'bg-pink-100',    text: 'text-pink-700'    },
  scorekeeper:     { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  athletic_trainer:{ bg: 'bg-amber-100',   text: 'text-amber-700'   },
  field_ops:       { bg: 'bg-teal-100',    text: 'text-teal-700'    },
}

function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export default function StaffViewPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [selDate, setSelDate] = useState('')
  const [view, setView] = useState<'mine' | 'all'>('mine')

  useEffect(() => {
    Promise.all([
      fetch(`/api/tournaments/${params.id}`).then(r => r.json()),
      fetch(`/api/tournaments/${params.id}/games`).then(r => r.json()),
      fetch(`/api/ref/assignments`).then(r => r.json()).catch(() => []),
    ]).then(([t, allGames, myAssignments]) => {
      setTournament(t)
      const myMap: Record<string, { role: string; pay: number }> = {}
      if (Array.isArray(myAssignments)) {
        myAssignments.forEach((a: { game: { id: string }; role: string; payRate: number }) => {
          myMap[a.game.id] = { role: a.role, pay: a.payRate }
        })
      }
      const enriched: Game[] = allGames.map((g: Game) => ({
        ...g,
        myRole: myMap[g.id]?.role,
        myPay: myMap[g.id]?.pay,
      }))
      setGames(enriched)
      const dates = [...new Set(enriched.map((g: Game) => g.date))].sort() as string[]
      // Default to today if possible, else first date
      const today = new Date().toISOString().slice(0, 10)
      setSelDate(dates.includes(today) ? today : dates[0] || '')
      setLoading(false)
    })
  }, [params.id])

  const dates = [...new Set(games.map(g => g.date))].sort()
  const myGames = games.filter(g => g.myRole)
  const myEarnings = myGames.filter(g => !g.isCanceled).reduce((s, g) => s + (g.myPay || 0), 0)

  const displayGames = games
    .filter(g => !g.isCanceled)
    .filter(g => !selDate || g.date === selDate)
    .filter(g => view === 'all' || g.myRole)
    .sort((a, b) => a.startTime < b.startTime ? -1 : 1)

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-gray-400">Loading…</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-16">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {tournament?.logoUrl && <img src={tournament.logoUrl} alt="logo" className="h-10 w-10 object-contain rounded-xl" />}
            <div>
              <h1 className="font-bold text-white">{tournament?.name}</h1>
              <p className="text-xs text-gray-400">{tournament?.location}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">{session?.user?.name}</p>
            {myGames.length > 0 && (
              <p className="text-xs text-emerald-400 font-semibold">{myGames.length} games · ${myEarnings}</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5">
        {/* My stats */}
        {myGames.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: 'My Games', value: myGames.filter(g => !g.isCanceled).length, color: 'text-white' },
              { label: 'Completed', value: myGames.filter(g => !g.isCanceled && g.score1 != null).length, color: 'text-emerald-400' },
              { label: 'Earnings', value: `$${myEarnings}`, color: 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* View toggle */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setView('mine')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${view === 'mine' ? 'bg-blue-600 text-white' : 'bg-gray-900 border border-gray-700 text-gray-400 hover:text-white'}`}>
            My Games {myGames.length > 0 && `(${myGames.filter(g => !g.isCanceled).length})`}
          </button>
          <button onClick={() => setView('all')} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${view === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-900 border border-gray-700 text-gray-400 hover:text-white'}`}>
            Full Schedule
          </button>
        </div>

        {/* Date tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
          {dates.map(d => {
            const dt = new Date(d + 'T12:00:00')
            const dayLabel = dt.toLocaleDateString('en-US', { weekday: 'short' })
            const dateLabel = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            const hasMyGame = myGames.some(g => g.date === d && !g.isCanceled)
            return (
              <button key={d} onClick={() => setSelDate(d)}
                className={`flex-shrink-0 px-4 py-2 rounded-xl text-xs font-medium transition-colors relative ${selDate === d ? 'bg-blue-600 text-white' : 'bg-gray-900 border border-gray-700 text-gray-400 hover:text-white'}`}>
                <div>{dayLabel}</div>
                <div className="font-semibold">{dateLabel}</div>
                {hasMyGame && <div className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${selDate === d ? 'bg-white' : 'bg-blue-400'}`} />}
              </button>
            )
          })}
        </div>

        {/* Game list */}
        {selDate && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{fmtDate(selDate)}</p>}

        {displayGames.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            {view === 'mine' ? "You don't have any games on this date." : 'No games on this date.'}
          </div>
        ) : (
          <div className="space-y-2">
            {displayGames.map(game => {
              const isScored = game.score1 != null && game.score2 != null
              const roleInfo = game.myRole ? ROLE_COLORS[game.myRole] : null
              const isMyGame = !!game.myRole
              return (
                <div key={game.id}
                  className={`rounded-2xl border overflow-hidden ${isMyGame ? 'border-blue-500/40 bg-gray-900' : 'border-gray-800 bg-gray-900/60'}`}>
                  {/* Top bar */}
                  <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800">
                    <span className="text-xs text-gray-500 font-mono">#{game.gameNumber}</span>
                    <span className="text-sm font-semibold text-white">{fmt12(game.startTime)}</span>
                    <span className="text-xs text-gray-500 flex-1">{game.location}</span>
                    {game.isChampionship && <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-0.5 rounded-full">🏆 Final</span>}
                    {isMyGame && roleInfo && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleInfo.bg} ${roleInfo.text}`}>
                        {ROLE_LABELS[game.myRole!] || game.myRole}
                      </span>
                    )}
                  </div>
                  {/* Game content */}
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-500 mb-1">{game.division}</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium flex-1 truncate ${isScored && game.score1! > game.score2! ? 'text-emerald-400 font-bold' : 'text-white'}`}>{game.team1}</span>
                        <span className="text-gray-600 text-xs">vs</span>
                        <span className={`text-sm font-medium flex-1 truncate ${isScored && game.score2! > game.score1! ? 'text-emerald-400 font-bold' : 'text-white'}`}>{game.team2}</span>
                      </div>
                    </div>
                    {isScored ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`w-9 h-9 flex items-center justify-center rounded-xl text-base font-bold ${game.score1! > game.score2! ? 'bg-emerald-900/60 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>{game.score1}</span>
                        <span className="text-gray-600 text-xs">–</span>
                        <span className={`w-9 h-9 flex items-center justify-center rounded-xl text-base font-bold ${game.score2! > game.score1! ? 'bg-emerald-900/60 text-emerald-400' : 'bg-gray-800 text-gray-400'}`}>{game.score2}</span>
                      </div>
                    ) : (
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {isMyGame && game.myRole === 'scorekeeper' && (
                          <Link href={`/tournaments/${params.id}/games/${game.id}/scorekeeper`}
                            className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg transition-colors">
                            Score Game →
                          </Link>
                        )}
                        <span className="text-xs text-gray-600 bg-gray-800 px-2 py-1 rounded-lg">Upcoming</span>
                      </div>
                    )}
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
