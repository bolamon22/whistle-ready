'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

interface Tournament {
  id: string; name: string; startDate: string; endDate: string
  location: string; logoUrl: string; sport: string
}
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; pool: string | null; location: string
  team1: string; team2: string
  score1: number | null; score2: number | null
  isCanceled: boolean; isChampionship: boolean
}
interface Standing {
  team: string; w: number; l: number; t: number; gf: number; ga: number; pts: number
}

const fmtDate = (d: string) => { if (!d) return ''; const [y,m,day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}/${y}` }

function calcStandings(games: Game[], division: string, pool?: string): Standing[] {
  const map: Record<string, Standing> = {}
  const ensure = (t: string) => { if (!map[t]) map[t] = { team: t, w: 0, l: 0, t: 0, gf: 0, ga: 0, pts: 0 } }
  const relevant = games.filter(g =>
    g.division === division && !g.isCanceled && !g.isChampionship &&
    (pool !== undefined ? g.pool === pool : true)
  )
  relevant.forEach(g => { ensure(g.team1); ensure(g.team2) })
  relevant.filter(g => g.score1 !== null && g.score2 !== null).forEach(g => {
    const s1 = g.score1!, s2 = g.score2!
    map[g.team1].gf += s1; map[g.team1].ga += s2
    map[g.team2].gf += s2; map[g.team2].ga += s1
    if (s1 > s2) { map[g.team1].w++; map[g.team1].pts += 3; map[g.team2].l++ }
    else if (s2 > s1) { map[g.team2].w++; map[g.team2].pts += 3; map[g.team1].l++ }
    else { map[g.team1].t++; map[g.team1].pts++; map[g.team2].t++; map[g.team2].pts++ }
  })
  return Object.values(map).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga))
}

function GameCard({ g, followedTeams, toggleFollow }: { g: Game, followedTeams: string[], toggleFollow: (t: string) => void }) {
  const hasScore = g.score1 !== null && g.score2 !== null
  const isHighlighted = followedTeams.includes(g.team1) || followedTeams.includes(g.team2)
  return (
    <div className={`bg-white border rounded-xl overflow-hidden ${isHighlighted ? 'border-blue-300 shadow-sm' : 'border-gray-200'}`}>
      <div className="px-3 sm:px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-400 mb-2">
          <span className="font-medium text-gray-600">{fmtDate(g.date)}</span>
          <span>·</span><span className="font-semibold text-gray-700">{g.startTime}</span>
          <span>·</span><span>{g.location}</span>
          {g.isChampionship && <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-semibold">🏆 Champ</span>}
          <span className="ml-auto text-gray-300">#{g.gameNumber}</span>
        </div>
        <div className="space-y-1.5">
          {[{team: g.team1, score: g.score1, opp: g.score2}, {team: g.team2, score: g.score2, opp: g.score1}].map(({team, score, opp}) => (
            <div key={team} className={`flex items-center justify-between rounded-lg px-3 py-2.5 ${hasScore && score! > opp! ? 'bg-green-50' : hasScore && score! < opp! ? 'bg-red-50/40' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => toggleFollow(team)} className="text-base hover:scale-110 transition-transform flex-shrink-0 touch-manipulation">
                  {followedTeams.includes(team) ? '⭐' : '☆'}
                </button>
                <span className={`font-semibold text-sm truncate ${hasScore && score! > opp! ? 'text-green-700' : 'text-gray-800'}`}>{team}</span>
              </div>
              {hasScore && <span className={`text-xl font-bold flex-shrink-0 ml-2 ${score! > opp! ? 'text-green-700' : 'text-gray-500'}`}>{score}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function StandingsTable({ standings, followedTeams }: { standings: Standing[], followedTeams: string[] }) {
  if (!standings.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[360px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 sm:px-4 py-3 text-gray-500 font-semibold text-xs">Team</th>
              <th className="text-center px-2 py-3 text-gray-500 font-semibold w-8 text-xs">W</th>
              <th className="text-center px-2 py-3 text-gray-500 font-semibold w-8 text-xs">L</th>
              <th className="text-center px-2 py-3 text-gray-500 font-semibold w-8 text-xs">T</th>
              <th className="hidden sm:table-cell text-center px-3 py-3 text-gray-500 font-semibold w-12 text-xs">GF</th>
              <th className="hidden sm:table-cell text-center px-3 py-3 text-gray-500 font-semibold w-12 text-xs">GA</th>
              <th className="text-center px-2 py-3 text-gray-500 font-semibold w-10 text-xs">+/-</th>
              <th className="text-center px-2 py-3 text-gray-500 font-semibold w-10 text-xs">Pts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {standings.map((s, i) => (
              <tr key={s.team} className={i === 0 ? 'bg-yellow-50/50' : ''}>
                <td className="px-3 sm:px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-xs text-gray-400 w-4 inline-block text-center">{i+1}</span>}</span>
                    <span className="font-medium text-gray-800 text-xs sm:text-sm">{s.team}</span>
                    {followedTeams.includes(s.team) && <span className="text-xs">⭐</span>}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center font-semibold text-green-700 text-xs">{s.w}</td>
                <td className="px-2 py-2.5 text-center font-semibold text-red-600 text-xs">{s.l}</td>
                <td className="px-2 py-2.5 text-center text-gray-500 text-xs">{s.t}</td>
                <td className="hidden sm:table-cell px-3 py-2.5 text-center text-gray-600 text-xs">{s.gf}</td>
                <td className="hidden sm:table-cell px-3 py-2.5 text-center text-gray-600 text-xs">{s.ga}</td>
                <td className={`px-2 py-2.5 text-center font-medium text-xs ${s.gf-s.ga > 0 ? 'text-green-600' : s.gf-s.ga < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {s.gf-s.ga > 0 ? '+' : ''}{s.gf-s.ga}
                </td>
                <td className="px-2 py-2.5 text-center font-bold text-blue-700 text-xs">{s.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">W=3pts · T=1pt · Championship games excluded</div>
    </div>
  )
}

export default function PublicTournamentPage() {
  const { id } = useParams()
  const [tournament, setTournament] = useState<Tournament | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'schedule' | 'standings'>('schedule')
  const [filterDiv, setFilterDiv] = useState('ALL')
  const [filterDate, setFilterDate] = useState('ALL')
  const [filterTeam, setFilterTeam] = useState('ALL')
  const [followedTeams, setFollowedTeams] = useState<string[]>([])

  useEffect(() => {
    Promise.all([
      fetch(`/api/tournaments/${id}`).then(r => r.json()),
      fetch(`/api/tournaments/${id}/games`).then(r => r.json()),
    ]).then(([t, g]) => { setTournament(t); setGames(Array.isArray(g) ? g : []); setLoading(false) })
    try { const saved = JSON.parse(localStorage.getItem(`follows-${id}`) || '[]'); setFollowedTeams(saved) } catch {}
  }, [id])

  const toggleFollow = (team: string) => {
    setFollowedTeams(prev => {
      const next = prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team]
      localStorage.setItem(`follows-${id}`, JSON.stringify(next))
      return next
    })
  }

  const divisions = useMemo(() => ['ALL', ...Array.from(new Set(games.map(g => g.division).filter(Boolean))).sort()], [games])
  const dates = useMemo(() => ['ALL', ...Array.from(new Set(games.map(g => g.date).filter(Boolean))).sort()], [games])
  const allTeams = useMemo(() => Array.from(new Set(games.flatMap(g => [g.team1, g.team2]).filter(Boolean))).sort(), [games])
  const filteredGames = useMemo(() => games
    .filter(g => !g.isCanceled)
    .filter(g => filterDiv === 'ALL' || g.division === filterDiv)
    .filter(g => filterDate === 'ALL' || g.date === filterDate)
    .filter(g => filterTeam === 'ALL' || g.team1 === filterTeam || g.team2 === filterTeam)
    .sort((a, b) => a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.startTime < b.startTime ? -1 : 1)
  , [games, filterDiv, filterDate, filterTeam])
  const divisionGroups = useMemo(() => filterDiv === 'ALL' ? Array.from(new Set(filteredGames.map(g => g.division))).sort() : [filterDiv], [filteredGames, filterDiv])
  const standingDivisions = useMemo(() => Array.from(new Set(games.filter(g => !g.isCanceled).map(g => g.division))).sort(), [games])

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3">
          {tournament?.logoUrl && <img src={tournament.logoUrl} alt="logo" className="h-9 w-9 sm:h-10 sm:w-10 object-contain rounded-xl border border-gray-100 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <h1 className="text-sm sm:text-lg font-bold text-gray-800 leading-tight line-clamp-2">{tournament?.name}</h1>
            <p className="text-xs text-gray-400 truncate">{tournament?.location}{tournament?.startDate && ` · ${fmtDate(tournament.startDate)}${tournament.endDate && tournament.endDate !== tournament.startDate ? ` – ${fmtDate(tournament.endDate)}` : ''}`}</p>
          </div>
          <Link href={`/tournaments/${id}/player-register`} target="_blank" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-2.5 sm:px-3 py-2 rounded-lg flex-shrink-0 whitespace-nowrap">Register →</Link>
        </div>
        <div className="max-w-5xl mx-auto px-3 sm:px-4 flex">
          {(['schedule','standings'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`flex-1 sm:flex-none px-4 sm:px-5 py-2.5 text-sm font-medium border-b-2 transition-colors text-center ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'schedule' ? '📅 Schedule' : '🏆 Standings'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-5">
        {tab === 'schedule' && (
          <>
            <div className="grid grid-cols-2 sm:flex gap-2 flex-wrap mb-4">
              <select value={filterDiv} onChange={e => setFilterDiv(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0">
                {divisions.map(d => <option key={d} value={d}>{d === 'ALL' ? 'All Divisions' : d}</option>)}
              </select>
              <select value={filterDate} onChange={e => setFilterDate(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0">
                {dates.map(d => <option key={d} value={d}>{d === 'ALL' ? 'All Dates' : fmtDate(d)}</option>)}
              </select>
              <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} className="col-span-2 sm:col-span-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0">
                <option value="ALL">All Teams</option>
                {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {(filterDiv !== 'ALL' || filterDate !== 'ALL' || filterTeam !== 'ALL') && (
                <button onClick={() => { setFilterDiv('ALL'); setFilterDate('ALL'); setFilterTeam('ALL') }} className="text-sm text-gray-500 hover:text-gray-700 underline self-center">Clear</button>
              )}
              <span className="text-sm text-gray-400 self-center">{filteredGames.length} games</span>
            </div>
            {followedTeams.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-4 items-center">
                <span className="text-xs text-gray-400">⭐ Following:</span>
                {followedTeams.map(t => (
                  <button key={t} onClick={() => setFilterTeam(filterTeam === t ? 'ALL' : t)} className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${filterTeam === t ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>{t}</button>
                ))}
              </div>
            )}
            {divisionGroups.map(div => {
              const divGames = filteredGames.filter(g => g.division === div)
              if (!divGames.length) return null
              const pools = Array.from(new Set(divGames.map(g => g.pool).filter(Boolean))).sort() as string[]
              return (
                <div key={div} className="mb-8">
                  <h2 className="text-sm font-extrabold text-gray-700 uppercase tracking-wider mb-3 border-l-4 border-blue-500 pl-3">{div}</h2>
                  {pools.length > 0 ? (
                    <div className="space-y-5">
                      {pools.map(pool => {
                        const poolGames = divGames.filter(g => g.pool === pool)
                        if (!poolGames.length) return null
                        return (
                          <div key={pool}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">Pool {pool}</span>
                              <span className="text-xs text-gray-400">{poolGames.length} game{poolGames.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="space-y-2">{poolGames.map(g => <GameCard key={g.id} g={g} followedTeams={followedTeams} toggleFollow={toggleFollow} />)}</div>
                          </div>
                        )
                      })}
                      {divGames.filter(g => !g.pool).map(g => <GameCard key={g.id} g={g} followedTeams={followedTeams} toggleFollow={toggleFollow} />)}
                    </div>
                  ) : (
                    <div className="space-y-2">{divGames.map(g => <GameCard key={g.id} g={g} followedTeams={followedTeams} toggleFollow={toggleFollow} />)}</div>
                  )}
                </div>
              )
            })}
            {filteredGames.length === 0 && <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-3">📅</div><p>No games found.</p></div>}
          </>
        )}
        {tab === 'standings' && (
          <div className="space-y-8">
            {standingDivisions.map(div => {
              const divGames = games.filter(g => g.division === div && !g.isCanceled)
              const pools = Array.from(new Set(divGames.map(g => g.pool).filter(Boolean))).sort() as string[]
              return (
                <div key={div}>
                  <h2 className="text-sm font-extrabold text-gray-700 uppercase tracking-wider mb-3 border-l-4 border-blue-500 pl-3">{div}</h2>
                  {pools.length > 0 ? (
                    <div className="space-y-4">
                      {pools.map(pool => {
                        const standings = calcStandings(games, div, pool)
                        if (!standings.length) return null
                        return (
                          <div key={pool}>
                            <div className="flex items-center gap-2 mb-2"><span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">Pool {pool}</span></div>
                            <StandingsTable standings={standings} followedTeams={followedTeams} />
                          </div>
                        )
                      })}
                    </div>
                  ) : <StandingsTable standings={calcStandings(games, div)} followedTeams={followedTeams} />}
                </div>
              )
            })}
            {standingDivisions.length === 0 && <div className="text-center py-16 text-gray-400"><div className="text-4xl mb-3">🏆</div><p>Standings appear once games are scheduled.</p></div>}
          </div>
        )}
      </div>
    </div>
  )
}
