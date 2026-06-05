'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; team1: string; team2: string
  score1: number | null; score2: number | null
  isCanceled: boolean; isChampionship: boolean
}
interface TeamStat {
  team: string; w: number; l: number; t: number
  gf: number; ga: number; pts: number; gamesPlayed: number
}

function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function PublicResultsPage({ params }: { params: { id: string } }) {
  const [tournament, setTournament] = useState<{ name: string; logoUrl: string } | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [selDiv, setSelDiv] = useState('')
  const [tab, setTab] = useState<'standings' | 'scores'>('standings')

  useEffect(() => {
    Promise.all([
      fetch(`/api/tournaments/${params.id}`).then(r => r.json()),
      fetch(`/api/tournaments/${params.id}/games`).then(r => r.json()),
    ]).then(([t, g]) => {
      setTournament(t)
      setGames(g)
      const divs = [...new Set((g as Game[]).map(x => x.division))].sort()
      if (divs.length) setSelDiv(divs[0])
      setLoading(false)
    })
  }, [params.id])

  const divisions = [...new Set(games.map(g => g.division))].sort()
  const scored = games.filter(g => !g.isCanceled && g.score1 != null && g.score2 != null)
  const divGames = scored.filter(g => !selDiv || g.division === selDiv)

  // Build standings for selected division
  function buildStandings(divName: string): TeamStat[] {
    const map = new Map<string, TeamStat>()
    const ensure = (team: string) => {
      if (!map.has(team)) map.set(team, { team, w: 0, l: 0, t: 0, gf: 0, ga: 0, pts: 0, gamesPlayed: 0 })
      return map.get(team)!
    }
    scored.filter(g => g.division === divName && !g.isChampionship).forEach(g => {
      const t1 = ensure(g.team1); const t2 = ensure(g.team2)
      t1.gf += g.score1!; t1.ga += g.score2!; t1.gamesPlayed++
      t2.gf += g.score2!; t2.ga += g.score1!; t2.gamesPlayed++
      if (g.score1! > g.score2!) { t1.w++; t1.pts += 3; t2.l++ }
      else if (g.score2! > g.score1!) { t2.w++; t2.pts += 3; t1.l++ }
      else { t1.t++; t1.pts += 1; t2.t++; t2.pts += 1 }
    })
    return [...map.values()].sort((a, b) =>
      b.pts !== a.pts ? b.pts - a.pts :
      (b.gf - b.ga) !== (a.gf - a.ga) ? (b.gf - b.ga) - (a.gf - a.ga) :
      b.gf - a.gf
    )
  }

  // Recent scored games (all divisions, latest first)
  const recentScored = [...scored]
    .sort((a, b) => `${b.date}${b.startTime}` < `${a.date}${a.startTime}` ? 1 : -1)
    .slice(0, 30)

  // Championship games
  const championships = scored.filter(g => g.isChampionship)

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            {tournament?.logoUrl && <img src={tournament.logoUrl} alt="logo" className="h-12 w-12 object-contain rounded-xl" />}
            <div>
              <h1 className="text-xl font-bold text-gray-900">{tournament?.name}</h1>
              <p className="text-sm text-gray-400">Results & Standings</p>
            </div>
          </div>
          <Link href={`/tournaments/${params.id}/public`}
            className="text-sm text-blue-600 hover:underline">← Schedule</Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 pt-6">

        {/* Championship callout */}
        {championships.length > 0 && (
          <div className="mb-6 space-y-2">
            {championships.map(g => {
              const winner = g.score1! > g.score2! ? g.team1 : g.score2! > g.score1! ? g.team2 : null
              return (
                <div key={g.id} className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-center gap-4">
                  <span className="text-2xl">🏆</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-0.5">{g.division} — Championship</p>
                    <p className="text-sm font-bold text-gray-800">
                      {winner ? <>{winner} wins!</> : 'Draw'}
                    </p>
                    <p className="text-xs text-gray-500">{g.team1} {g.score1} – {g.score2} {g.team2}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-5">
          {(['standings','scores'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors capitalize ${tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {t === 'standings' ? '📊 Standings' : '🎯 Scores'}
            </button>
          ))}
        </div>

        {/* Division selector */}
        {tab === 'standings' && (
          <div className="flex gap-1.5 flex-wrap mb-5">
            {divisions.map(d => (
              <button key={d} onClick={() => setSelDiv(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selDiv === d ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {d}
              </button>
            ))}
          </div>
        )}

        {/* Standings table */}
        {tab === 'standings' && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            {selDiv ? (
              <>
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-700">{selDiv}</p>
                </div>
                {(() => {
                  const standings = buildStandings(selDiv)
                  if (standings.length === 0) return (
                    <div className="px-5 py-10 text-center text-gray-400 text-sm">No scored games yet.</div>
                  )
                  return (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500">Team</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">GP</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">W</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">L</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">T</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">GF</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500">GA</th>
                          <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 font-bold">PTS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {standings.map((s, i) => (
                          <tr key={s.team} className={i === 0 ? 'bg-amber-50/40' : 'hover:bg-gray-50/50'}>
                            <td className="px-5 py-3 font-medium text-gray-800">
                              {i === 0 && <span className="mr-1.5 text-amber-500">🥇</span>}
                              {i === 1 && <span className="mr-1.5 text-gray-400">🥈</span>}
                              {i === 2 && <span className="mr-1.5 text-amber-700">🥉</span>}
                              {s.team}
                            </td>
                            <td className="text-center px-3 py-3 text-gray-500">{s.gamesPlayed}</td>
                            <td className="text-center px-3 py-3 font-semibold text-emerald-600">{s.w}</td>
                            <td className="text-center px-3 py-3 text-red-500">{s.l}</td>
                            <td className="text-center px-3 py-3 text-gray-500">{s.t}</td>
                            <td className="text-center px-3 py-3 text-gray-500">{s.gf}</td>
                            <td className="text-center px-3 py-3 text-gray-500">{s.ga}</td>
                            <td className="text-center px-3 py-3 font-bold text-gray-800">{s.pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
              </>
            ) : (
              <div className="px-5 py-10 text-center text-gray-400 text-sm">Select a division above.</div>
            )}
          </div>
        )}

        {/* Scores tab */}
        {tab === 'scores' && (
          <div className="space-y-4">
            {recentScored.length === 0 && <div className="text-center py-12 text-gray-400">No scores posted yet.</div>}
            {/* Group by date */}
            {[...new Set(recentScored.map(g => g.date))].map(date => (
              <div key={date}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{fmtDate(date)}</p>
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
                  {recentScored.filter(g => g.date === date).map(g => {
                    const t1wins = g.score1! > g.score2!
                    const t2wins = g.score2! > g.score1!
                    return (
                      <div key={g.id} className="px-5 py-3 flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-14 flex-shrink-0">{fmt12(g.startTime)}</span>
                        <div className="flex-1 flex items-center gap-2">
                          <span className={`flex-1 text-sm text-right ${t1wins ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{g.team1}</span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold ${t1wins ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{g.score1}</span>
                            <span className="text-gray-300 text-xs">–</span>
                            <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-bold ${t2wins ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{g.score2}</span>
                          </div>
                          <span className={`flex-1 text-sm ${t2wins ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{g.team2}</span>
                        </div>
                        <span className="text-xs text-gray-400 w-24 text-right truncate">{g.division}</span>
                        {g.isChampionship && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">🏆</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
