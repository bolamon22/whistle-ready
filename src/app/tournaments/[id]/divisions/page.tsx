'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import toast from 'react-hot-toast'
import TournamentNav from '../TournamentNav'

interface Division { name: string; teamCount: number; poolCount: number }
interface Pool { id: string; name: string; teamNames: string[] }
interface PoolGame {
  id: string; gameNumber: string; pool: string | null
  team1: string; team2: string; date: string; startTime: string; location: string
}

interface Team {
  id: string; teamName: string; clubName: string; division: string
  coachName: string; coachPhone: string; coachEmail: string
  pool: string | null; paid: number; owed: number; paymentStatus: 'paid' | 'partial' | 'unpaid'
}

function payBadge(status: Team['paymentStatus']) {
  if (status === 'paid')    return <span className="text-xs font-medium bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Paid</span>
  if (status === 'partial') return <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Partial</span>
  return <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Unpaid</span>
}

export default function DivisionsPage() {
  const { id } = useParams<{ id: string }>()
  const [tournament, setTournament] = useState<{ name: string; logoUrl: string } | null>(null)
  const [divisions, setDivisions] = useState<Division[]>([])
  const [activeDiv, setActiveDiv] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'teams' | 'pools' | 'pool-games'>('teams')
  const [teams, setTeams] = useState<Team[]>([])
  const [pools, setPools] = useState<Pool[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingDiv, setLoadingDiv] = useState(false)
  const [poolGames, setPoolGames] = useState<PoolGame[]>([])

  // Pool games state
  const [generating, setGenerating] = useState(false)
  const [genDate, setGenDate] = useState('')
  const [genRefCount, setGenRefCount] = useState('2')
  const [gamesPerTeam, setGamesPerTeam] = useState('2')
  const [renumbering, setRenumbering] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  // Swap teams state
  const [swapA, setSwapA] = useState<string | null>(null)
  const [swapB, setSwapB] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)

  // Pool management
  const [newPoolName, setNewPoolName] = useState('')
  const [addingPool, setAddingPool] = useState(false)
  const [assigningTeam, setAssigningTeam] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/tournaments/${id}`).then(r => r.json()),
      fetch(`/api/tournaments/${id}/divisions`).then(r => r.json()),
    ]).then(([t, d]) => {
      setTournament(t)
      setDivisions(d)
      if (d.length > 0) selectDiv(d[0].name)
      setLoading(false)
    })
  }, [id])

  async function loadPoolGames(div: string) {
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/pool-games`)
    const data = await res.json()
    setPoolGames(Array.isArray(data) ? data : [])
  }

  const selectDiv = useCallback((div: string) => {
    setActiveDiv(div)
    setLoadingDiv(true)
    setSwapA(null); setSwapB(null)
    Promise.all([
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/teams`).then(r => r.json()),
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(div)}/pool-games`).then(r => r.json()),
    ]).then(([teamData, gameData]) => {
      setTeams(teamData.teams ?? [])
      setPools(teamData.pools ?? [])
      setPoolGames(Array.isArray(gameData) ? gameData : [])
      setLoadingDiv(false)
    })
  }, [id])

  async function addPool() {
    if (!newPoolName.trim() || !activeDiv) return
    setAddingPool(true)
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pools`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newPoolName.trim() }),
    })
    const pool = await res.json()
    if (!res.ok) {
      toast.error(pool.error ?? 'Failed to create pool')
      setAddingPool(false)
      return
    }
    setPools(p => [...p, pool])
    setDivisions(d => d.map(div => div.name === activeDiv ? { ...div, poolCount: div.poolCount + 1 } : div))
    setNewPoolName('')
    setAddingPool(false)
    toast.success(`${pool.name} created`)
  }

  async function deletePool(poolId: string) {
    if (!activeDiv || !confirm('Delete this pool? Team assignments will be cleared.')) return
    await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pools`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ poolId }),
    })
    setPools(p => p.filter(x => x.id !== poolId))
    setDivisions(d => d.map(div => div.name === activeDiv ? { ...div, poolCount: div.poolCount - 1 } : div))
    setTeams(t => t.map(x => ({ ...x, pool: x.pool === pools.find(p => p.id === poolId)?.name ? null : x.pool })))
    toast.success('Pool deleted')
  }

  async function assignTeamToPool(teamName: string, poolName: string | null) {
    if (!activeDiv) return
    setAssigningTeam(teamName)
    const newPools = pools.map(p => {
      const names = p.teamNames.filter(n => n !== teamName)
      if (poolName && p.name === poolName) names.push(teamName)
      return { ...p, teamNames: names }
    })
    await Promise.all(newPools.map(p =>
      fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pools`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolId: p.id, teamNames: p.teamNames }),
      })
    ))
    setPools(newPools)
    setTeams(t => t.map(x => x.teamName === teamName ? { ...x, pool: poolName } : x))
    setAssigningTeam(null)
  }

  async function swapTeams() {
    if (!swapA || !swapB || !activeDiv) return
    const teamA = teams.find(t => t.teamName === swapA)
    const teamB = teams.find(t => t.teamName === swapB)
    if (!teamA || !teamB) return
    setSwapping(true)
    await Promise.all([
      assignTeamToPool(swapA, teamB.pool),
      assignTeamToPool(swapB, teamA.pool),
    ])
    setSwapA(null); setSwapB(null)
    setSwapping(false)
    toast.success('Teams swapped')
  }

    async function generateGames() {
    if (!activeDiv) return
    setGenerating(true)
    const res = await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate', date: genDate, refCount: Number(genRefCount), gamesPerTeam: Number(gamesPerTeam), clearExisting: true }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? 'Failed to generate games'); setGenerating(false); return }
    await loadPoolGames(activeDiv)
    setGenerating(false)
    toast.success(`${data.generated} games created — each team plays ${gamesPerTeam} game${Number(gamesPerTeam) !== 1 ? 's' : ''}`)
  }

  async function renumberGames() {
    if (!activeDiv) return
    setRenumbering(true)
    await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'renumber' }),
    })
    await loadPoolGames(activeDiv)
    setRenumbering(false)
    toast.success('Games renumbered')
  }

  async function clearGames() {
    if (!activeDiv) return
    setShowClearConfirm(false)
    await fetch(`/api/tournaments/${id}/divisions/${encodeURIComponent(activeDiv)}/pool-games`, { method: 'DELETE' })
    setPoolGames([])
    toast.success('Pool games cleared')
  }

if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 animate-pulse">Loading divisions...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      <TournamentNav id={id} name={tournament?.name ?? ''} logoUrl={tournament?.logoUrl} />

      <div className="max-w-6xl mx-auto px-6 pb-12">
        <div className="flex gap-6">

          {/* -- Sidebar -------------------------------------------- */}
          <div className="w-56 flex-shrink-0">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden sticky top-6">
              <div className="bg-slate-800 px-4 py-3">
                <p className="text-xs font-bold text-white uppercase tracking-wider">Divisions</p>
              </div>
              {divisions.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-slate-400">
                  No divisions yet.
                  <Link href={`/tournaments/${id}/builder`} className="block mt-1 text-sky-500 hover:underline">Set up in Builder -></Link>
                </div>
              ) : (
                <div>
                  {divisions.map(div => (
                    <button key={div.name} onClick={() => selectDiv(div.name)}
                      className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 transition-colors ${activeDiv === div.name ? 'bg-sky-50 border-l-2 border-l-sky-500' : 'hover:bg-slate-50'}`}>
                      <p className={`text-sm font-semibold truncate ${activeDiv === div.name ? 'text-sky-700' : 'text-slate-700'}`}>{div.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{div.teamCount} teams · {div.poolCount} pools</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* -- Main content --------------------------------------- */}
          <div className="flex-1 min-w-0">
            {!activeDiv ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                Select a division to get started
              </div>
            ) : loadingDiv ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 animate-pulse">Loading...</div>
            ) : (
              <>
                {/* Sub-tabs */}
                <div className="flex items-center gap-1 mb-4 border-b border-slate-200">
                  {(['teams', 'pools', 'pool-games'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px capitalize transition-colors ${activeTab === tab ? 'border-sky-600 text-sky-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                      {tab === 'teams' ? `Teams (${teams.length})` : tab === 'pools' ? `Pools (${pools.length})` : `Pool Games (${poolGames.length})`}
                    </button>
                  ))}
                </div>

                {/* -- TEAMS TAB -- */}
                {activeTab === 'teams' && (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h2 className="font-bold text-slate-800">Teams ({teams.length})</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{activeDiv}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {swapA && swapB ? (
                          <button onClick={swapTeams} disabled={swapping}
                            className="btn-primary btn-sm disabled:opacity-50">
                            {swapping ? 'Swapping...' : `<-> Swap ${swapA} <-> ${swapB}`}
                          </button>
                        ) : swapA ? (
                          <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                            Now select the second team to swap with <strong>{swapA}</strong>
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Click a team row to start a swap</span>
                        )}
                        {(swapA || swapB) && (
                          <button onClick={() => { setSwapA(null); setSwapB(null) }}
                            className="text-xs text-slate-400 hover:text-slate-600">x Cancel</button>
                        )}
                      </div>
                    </div>

                    {teams.length === 0 ? (
                      <div className="px-5 py-12 text-center text-slate-400 text-sm">
                        No teams registered in this division yet.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Team</th>
                            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Club</th>
                            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pool</th>
                            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment</th>
                            <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Coach</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teams.map((team, i) => {
                            const isSwapA = swapA === team.teamName
                            const isSwapB = swapB === team.teamName
                            return (
                              <tr key={team.id}
                                onClick={() => {
                                  if (isSwapA) { setSwapA(null); return }
                                  if (isSwapB) { setSwapB(null); return }
                                  if (!swapA) setSwapA(team.teamName)
                                  else setSwapB(team.teamName)
                                }}
                                className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors ${isSwapA || isSwapB ? 'bg-amber-50' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/50 hover:bg-slate-100/50'}`}>
                                <td className="px-5 py-3 font-semibold text-slate-800">
                                  <div className="flex items-center gap-2">
                                    {(isSwapA || isSwapB) && <span className="text-amber-500"><-></span>}
                                    {team.teamName}
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-slate-500 text-xs">{team.clubName}</td>
                                <td className="px-3 py-3">
                                  {pools.length > 0 ? (
                                    <select
                                      value={team.pool ?? ''}
                                      onChange={e => { e.stopPropagation(); assignTeamToPool(team.teamName, e.target.value || null) }}
                                      onClick={e => e.stopPropagation()}
                                      disabled={assigningTeam === team.teamName}
                                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50">
                                      <option value="">-- No pool --</option>
                                      {pools.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                  ) : (
                                    <span className="text-xs text-slate-400">--</span>
                                  )}
                                </td>
                                <td className="px-3 py-3">{payBadge(team.paymentStatus)}</td>
                                <td className="px-3 py-3 text-xs text-slate-500">
                                  <div>{team.coachName}</div>
                                  {team.coachPhone && <div className="text-slate-400">{team.coachPhone}</div>}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {/* -- POOLS TAB -- */}
                {activeTab === 'pools' && (
                  <div className="space-y-4">
                    {/* Assign teams button */}
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-slate-400">{teams.filter(t => !t.pool).length > 0 ? `${teams.filter(t => !t.pool).length} teams unassigned` : 'All teams assigned'}</p>
                      <Link href={`/tournaments/${id}/divisions/${encodeURIComponent(activeDiv!)}/assign-pools`}
                        className="btn-primary btn-sm">
                        Assign Teams to Pools ->
                      </Link>
                    </div>

                    {/* Add pool */}
                    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-3">
                      <input className="input flex-1 text-sm" placeholder="Pool name (e.g. Pool A, Pool 1)"
                        value={newPoolName} onChange={e => setNewPoolName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addPool()} />
                      <button onClick={addPool} disabled={!newPoolName.trim() || addingPool}
                        className="btn-primary btn-sm disabled:opacity-50">
                        {addingPool ? 'Adding...' : '+ Add Pool'}
                      </button>
                    </div>

                    {pools.length === 0 ? (
                      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                        No pools yet. Add a pool above to get started.
                      </div>
                    ) : (
                      pools.map(pool => {
                        const poolTeams = teams.filter(t => t.pool === pool.name)
                        const unassigned = teams.filter(t => !t.pool)
                        return (
                          <div key={pool.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                              <h3 className="font-semibold text-slate-700">{pool.name}</h3>
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400">{poolTeams.length} teams</span>
                                <button onClick={() => deletePool(pool.id)}
                                  className="text-xs text-red-400 hover:text-red-600">Delete</button>
                              </div>
                            </div>
                            {poolTeams.length === 0 ? (
                              <p className="px-5 py-4 text-sm text-slate-400">No teams assigned yet. Use the Teams tab to assign.</p>
                            ) : (
                              <table className="w-full text-sm">
                                <tbody>
                                  {poolTeams.map((team, i) => (
                                    <tr key={team.id} className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                      <td className="px-5 py-2.5 font-medium text-slate-800">{team.teamName}</td>
                                      <td className="px-3 py-2.5 text-xs text-slate-400">{team.clubName}</td>
                                      <td className="px-3 py-2.5">{payBadge(team.paymentStatus)}</td>
                                      <td className="px-3 py-2.5 text-right">
                                        <button onClick={() => assignTeamToPool(team.teamName, null)}
                                          className="text-xs text-slate-400 hover:text-red-500">Remove</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                            {/* Quick-add unassigned teams */}
                            {unassigned.length > 0 && (
                              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50">
                                <p className="text-xs text-slate-400 mb-2">Add team to this pool:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {unassigned.map(t => (
                                    <button key={t.id} onClick={() => assignTeamToPool(t.teamName, pool.name)}
                                      className="text-xs bg-white border border-slate-200 hover:border-sky-300 hover:bg-sky-50 text-slate-600 hover:text-sky-700 px-2.5 py-1 rounded-lg transition-colors">
                                      + {t.teamName}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })
                    )}

                    {/* Unassigned summary */}
                    {pools.length > 0 && teams.filter(t => !t.pool).length > 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
                        <p className="text-sm font-medium text-amber-700">
                          {teams.filter(t => !t.pool).length} team{teams.filter(t => !t.pool).length !== 1 ? 's' : ''} not assigned to a pool
                        </p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          {teams.filter(t => !t.pool).map(t => t.teamName).join(', ')}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* -- POOL GAMES TAB -- */}
                {activeTab === 'pool-games' && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Date (optional)</label>
                          <input type="date" className="input text-sm" value={genDate} onChange={e => setGenDate(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Refs per game</label>
                          <select className="input text-sm" value={genRefCount} onChange={e => setGenRefCount(e.target.value)}>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-1">Games per team</label>
                          <input type="number" min="1" max="10" className="input text-sm w-20" value={gamesPerTeam} onChange={e => setGamesPerTeam(e.target.value)} />
                        </div>
                        <button onClick={generateGames} disabled={generating || pools.length === 0}
                          className="btn-primary btn-sm disabled:opacity-50">
                          {generating ? 'Generating...' : '⚡ Generate Games'}
                        </button>
                        {poolGames.length > 0 && (
                          <>
                            <button onClick={renumberGames} disabled={renumbering}
                              className="btn-sm border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                              {renumbering ? 'Renumbering...' : '# Renumber'}
                            </button>
                            {showClearConfirm ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-600">Delete all games?</span>
                                <button onClick={clearGames} className="text-xs text-red-600 font-semibold hover:underline">Yes, clear</button>
                                <button onClick={() => setShowClearConfirm(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setShowClearConfirm(true)} className="text-xs text-red-400 hover:text-red-600">Clear all</button>
                            )}
                          </>
                        )}
                      </div>
                      {pools.length === 0 && (
                        <p className="mt-3 text-xs text-amber-600">No pools yet -- create pools and assign teams first.</p>
                      )}
                    </div>
                    {poolGames.length === 0 ? (
                      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
                        No pool games yet. Add pools with teams, then click ⚡ Generate Games.
                      </div>
                    ) : (
                      (() => {
                        const byPool = poolGames.reduce((acc: Record<string, PoolGame[]>, g) => {
                          const key = g.pool ?? 'Unassigned'
                          if (!acc[key]) acc[key] = []
                          acc[key].push(g)
                          return acc
                        }, {} as Record<string, PoolGame[]>)
                        return Object.entries(byPool).map(([poolName, games]) => (
                          <div key={poolName} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                              <h3 className="font-semibold text-slate-700">{poolName}</h3>
                              <span className="text-xs text-slate-400">{games.length} game{games.length !== 1 ? 's' : ''}</span>
                            </div>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100">
                                  <th className="text-left px-5 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">#</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Home</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Away</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                                </tr>
                              </thead>
                              <tbody>
                                {games.map((g, i) => (
                                  <tr key={g.id} className={`border-b border-slate-50 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                                    <td className="px-5 py-2.5 font-mono text-xs text-slate-500">{g.gameNumber}</td>
                                    <td className="px-3 py-2.5 font-medium text-slate-800">{g.team1}</td>
                                    <td className="px-3 py-2.5 text-slate-600">{g.team2}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-400">{g.date || '--'}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-400">{g.startTime || '--'}</td>
                                    <td className="px-3 py-2.5 text-xs text-slate-400">{g.location || '--'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))
                      })()
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
