'use client'
import { useEffect, useRef, useState } from 'react'
import TournamentNav from '../TournamentNav'
import toast, { Toaster } from 'react-hot-toast'
import { Search, X, ChevronDown, ChevronUp, Check, ClipboardCheck } from 'lucide-react'

interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; pool: string | null; location: string
  team1: string; team2: string
  score1: number | null; score2: number | null
  isCanceled: boolean; isChampionship: boolean
}
type Draft = { s1: string; s2: string; note: string; dirty: boolean }
type GroupBy = 'division' | 'field'
type ShowFilter = 'all' | 'scored' | 'unscored'
type SortBy = 'time' | 'game'

function fmt12(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function gameLabel(g: Game) {
  if (g.isChampionship) return `Bracket game ${g.gameNumber}`
  if (g.pool) return `Pool game ${g.gameNumber}`
  return `Game ${g.gameNumber}`
}
// Parse "Tamarac Sports Complex - 02" → { complex: "Tamarac Sports Complex", field: "02" }
function parseLocation(loc: string): { complex: string; field: string } {
  const sep = loc.lastIndexOf(' - ')
  if (sep > 0) return { complex: loc.slice(0, sep).trim(), field: loc.slice(sep + 3).trim() }
  return { complex: loc, field: '' }
}

export default function PostScoresPage({ params }: { params: { id: string } }) {
  const [tName, setTName]   = useState('')
  const [tLogo, setTLogo]   = useState('')
  const [games, setGames]   = useState<Game[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<Record<string, boolean>>({})
  const [groupBy, setGroupBy]       = useState<GroupBy>('division')
  const [showFilter, setShowFilter] = useState<ShowFilter>('all')
  const [search,     setSearch]     = useState('')
  const [sortBy, setSortBy]         = useState<SortBy>('time')
  const [selGroup, setSelGroup]     = useState('__all__')
  const [expandedComplexes, setExpandedComplexes] = useState<Record<string, boolean>>({})
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(t => {
      setTName(t.name); setTLogo(t.logoUrl || '')
    })
    fetch(`/api/tournaments/${params.id}/games`).then(r => r.json()).then((g: Game[]) => {
      setGames(g)
      const d: Record<string, Draft> = {}
      g.forEach(game => { d[game.id] = { s1: game.score1 != null ? String(game.score1) : '', s2: game.score2 != null ? String(game.score2) : '', note: '', dirty: false } })
      setDrafts(d)
      // Auto-expand first complex
      const complexes = [...new Set(g.map(x => parseLocation(x.location).complex))]
      if (complexes[0]) setExpandedComplexes({ [complexes[0]]: true })
      setLoading(false)
    })
  }, [params.id])

  // Build sidebar structure
  const divisions = [...new Set(games.filter(g => !g.isCanceled).map(g => g.division))].sort()
  // Complexes → fields
  const complexMap = new Map<string, Set<string>>()
  games.filter(g => !g.isCanceled).forEach(g => {
    const { complex, field } = parseLocation(g.location)
    if (!complexMap.has(complex)) complexMap.set(complex, new Set())
    if (field) complexMap.get(complex)!.add(field)
  })

  function groupKey(g: Game) {
    if (groupBy === 'division') return g.division
    return g.location || 'Unknown'
  }
  function scoredIn(key: string) {
    return games.filter(g => !g.isCanceled && groupKey(g) === key && g.score1 != null && g.score2 != null).length
  }
  function totalIn(key: string) {
    return games.filter(g => !g.isCanceled && groupKey(g) === key).length
  }
  function complexScored(complex: string) {
    return games.filter(g => !g.isCanceled && parseLocation(g.location).complex === complex && g.score1 != null).length
  }
  function complexTotal(complex: string) {
    return games.filter(g => !g.isCanceled && parseLocation(g.location).complex === complex).length
  }

  const panelGames = games
    .filter(g => !g.isCanceled)
    .filter(g => {
      if (selGroup === '__all__') return true
      if (selGroup.startsWith('__complex__')) {
        const complex = selGroup.replace('__complex__', '')
        return parseLocation(g.location).complex === complex
      }
      return groupKey(g) === selGroup
    })
    .filter(g => {
      const scored = g.score1 != null && g.score2 != null
      if (showFilter === 'scored') return scored
      if (showFilter === 'unscored') return !scored
      return true
    })
    .filter(g => !search || [g.team1, g.team2, g.location].some(s => s.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => {
      if (sortBy === 'time') {
        const aKey = `${a.date}T${a.startTime}`
        const bKey = `${b.date}T${b.startTime}`
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0
      }
      return a.gameNumber.localeCompare(b.gameNumber, undefined, { numeric: true })
    })

  const panelGrouped = new Map<string, Game[]>()
  panelGames.forEach(g => {
    const key = groupBy === 'division' ? g.division : parseLocation(g.location).complex
    if (!panelGrouped.has(key)) panelGrouped.set(key, [])
    panelGrouped.get(key)!.push(g)
  })

  function setDraft(id: string, field: keyof Draft, val: string | boolean) {
    setDrafts(d => ({ ...d, [id]: { ...d[id], [field]: val, dirty: true } }))
  }

  async function saveGame(gameId: string) {
    const draft = drafts[gameId]
    if (!draft?.dirty) return
    setSaving(s => ({ ...s, [gameId]: true }))
    const body = { score1: draft.s1 === '' ? null : Number(draft.s1), score2: draft.s2 === '' ? null : Number(draft.s2) }
    await fetch(`/api/games/${gameId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setGames(gs => gs.map(g => g.id === gameId ? { ...g, ...body } : g))
    setDrafts(d => ({ ...d, [gameId]: { ...d[gameId], dirty: false } }))
    setSaving(s => ({ ...s, [gameId]: false }))
  }

  async function toggleFinal(gameId: string, checked: boolean) {
    const draft = drafts[gameId]
    if (checked && (draft.s1 === '' || draft.s2 === '')) { toast.error('Enter both scores first'); return }
    setDrafts(d => ({ ...d, [gameId]: { ...d[gameId], dirty: true } }))
    await saveGame(gameId)
  }

  function handleKey(e: React.KeyboardEvent, gameId: string, field: 's1' | 's2') {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault(); saveGame(gameId)
      const keys = panelGames.flatMap(g => [`${g.id}-s1`, `${g.id}-s2`])
      const next = keys[keys.indexOf(`${gameId}-${field}`) + 1]
      if (next) inputRefs.current[next]?.focus()
    }
  }

  const totalScored = games.filter(g => !g.isCanceled && g.score1 != null && g.score2 != null).length
  const totalGames  = games.filter(g => !g.isCanceled).length

  if (loading) return <div className="p-10 text-center text-slate-400">Loading…</div>

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Toaster />
      <TournamentNav id={params.id} name={tName} logoUrl={tLogo} />

      {/* Page header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Post scores</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              <span className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 border border-teal-100 rounded-full px-2.5 py-0.5 font-medium">
                <ClipboardCheck size={12} /> Tournament director &amp; schedule manager
              </span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">{totalScored}<span className="text-slate-400 font-normal text-lg">/{totalGames}</span></p>
            <p className="text-xs text-slate-400">games scored</p>
          </div>
        </div>
      </div>

      {/* Top toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 flex-wrap">
        <div className="relative w-full sm:w-auto flex-1 sm:flex-none sm:min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
<Search className="h-4 w-4" />
          </span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search teams or field…"
            className="w-full pl-9 pr-8 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"><X size={14} /></button>}
        </div>
        <div className="flex items-center gap-3">
          <select value={groupBy} onChange={e => { setGroupBy(e.target.value as GroupBy); setSelGroup('__all__') }}
            className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none font-medium">
            <option value="division">Show by division</option>
            <option value="field">Show by complex / field</option>
          </select>
        </div>
        <p className="text-xs text-slate-400">All changes will be saved automatically</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── SIDEBAR ── */}
        <div className="hidden sm:flex sm:flex-col w-52 flex-shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
          {/* All */}
          <button onClick={() => setSelGroup('__all__')}
            className={`w-full text-left px-4 py-3 border-b border-slate-100 flex items-center justify-between text-sm transition-colors ${selGroup === '__all__' ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
            <span>All {groupBy === 'division' ? 'divisions' : 'fields'}</span>
            <span className={`text-xs ${totalScored === totalGames ? 'text-emerald-500 font-semibold' : 'text-slate-400'}`}>{totalScored}/{totalGames}</span>
          </button>

          {/* Division sidebar */}
          {groupBy === 'division' && divisions.map(div => {
            const scored = scoredIn(div); const total = totalIn(div)
            return (
              <button key={div} onClick={() => setSelGroup(div)}
                className={`w-full text-left px-4 py-2.5 border-b border-slate-50 flex items-center justify-between transition-colors ${selGroup === div ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                <span className="text-sm truncate pr-2">{div}</span>
                <span className={`text-xs flex-shrink-0 ${scored === total ? 'text-emerald-500 font-semibold' : scored > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{scored}/{total}</span>
              </button>
            )
          })}

          {/* Complex → Field sidebar */}
          {groupBy === 'field' && [...complexMap.entries()].map(([complex, fields]) => {
            const expanded = expandedComplexes[complex] ?? false
            const cs = complexScored(complex); const ct = complexTotal(complex)
            const fieldList = [...fields].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
            return (
              <div key={complex}>
                {/* Complex header */}
                <button onClick={() => setExpandedComplexes(e => ({ ...e, [complex]: !expanded }))}
                  className="w-full text-left px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors">
                  <span className="text-xs font-semibold text-slate-700 truncate pr-2">{complex}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs ${cs === ct ? 'text-emerald-500' : 'text-slate-400'}`}>{cs}/{ct}</span>
                    <span className="text-slate-400 text-xs">{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
                  </div>
                </button>
                {expanded && (
                  <>
                    {/* All Fields under complex */}
                    <button
                      onClick={() => {
                        // Select all games at this complex
                        setSelGroup(`__complex__${complex}`)
                      }}
                      className={`w-full text-left px-6 py-2 border-b border-slate-50 text-sm transition-colors ${selGroup === `__complex__${complex}` ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}>
                      All fields
                    </button>
                    {fieldList.map(field => {
                      const loc = field ? `${complex} - ${field}` : complex
                      const fs = games.filter(g => !g.isCanceled && g.location === loc && g.score1 != null).length
                      const ft = games.filter(g => !g.isCanceled && g.location === loc).length
                      return (
                        <button key={field} onClick={() => setSelGroup(loc)}
                          className={`w-full text-left px-6 py-2 border-b border-slate-50 flex items-center justify-between transition-colors ${selGroup === loc ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}>
                          <span className="text-sm font-medium">{field}</span>
                          <span className={`text-xs ${fs === ft ? 'text-emerald-500' : 'text-slate-300'}`}>{fs}/{ft}</span>
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* ── MAIN PANEL ── */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {/* Panel header */}
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-slate-800">
                {selGroup === '__all__' ? `All ${groupBy === 'division' ? 'divisions' : 'fields'}` :
                 selGroup.startsWith('__complex__') ? selGroup.replace('__complex__', '') + ' — All fields' :
                 selGroup}
              </h2>
              {selGroup.startsWith('__complex__') && <p className="text-xs text-slate-400">{selGroup.replace('__complex__','')}</p>}
            </div>
            <div className="flex gap-2 flex-wrap">
              <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
                className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
                <option value="time">Sort by date/time</option>
                <option value="game">Sort by game #</option>
              </select>
              <select value={showFilter} onChange={e => setShowFilter(e.target.value as ShowFilter)}
                className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none">
                <option value="all">Show all games</option>
                <option value="scored">Show final games</option>
                <option value="unscored">Show not final games</option>
              </select>
            </div>
          </div>

          {panelGames.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              {showFilter === 'unscored' ? <span className="inline-flex items-center gap-1.5"><Check size={16} className="text-emerald-500" /> All games in this view are scored.</span> : 'No games found.'}
            </div>
          ) : (
            <div className="space-y-4">
              {[...panelGrouped.entries()].map(([grpName, grpGames]) => (
                <div key={grpName} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  {selGroup === '__all__' && (
                    <div className="px-5 py-2.5 bg-slate-800 flex items-center justify-between">
                      <p className="text-sm font-semibold text-white">{grpName}</p>
                      <p className="text-xs text-slate-400">{grpGames.filter(g => g.score1 != null).length}/{grpGames.length} scored</p>
                    </div>
                  )}
                  <div className="overflow-x-auto">
                  {/* Column headers */}
                  <div className="grid grid-cols-12 gap-2 px-5 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide min-w-[600px]">
                    <div className="col-span-3">Game</div>
                    <div className="col-span-3">Team 1</div>
                    <div className="col-span-2 text-center">Score</div>
                    <div className="col-span-2">Team 2</div>
                    <div className="col-span-1">Note</div>
                    <div className="col-span-1 text-center">Final</div>
                  </div>
                  {grpGames.map(game => {
                    const draft = drafts[game.id] || { s1: '', s2: '', note: '', dirty: false }
                    const isScored = game.score1 != null && game.score2 != null
                    const t1wins = isScored && game.score1! > game.score2!
                    const t2wins = isScored && game.score2! > game.score1!
                    return (
                      <div key={game.id}
                        className={`grid grid-cols-12 gap-2 px-5 py-3 items-center border-b border-slate-50 last:border-0 min-w-[600px] ${draft.dirty ? 'bg-amber-50/40' : isScored ? '' : 'hover:bg-slate-50/50'}`}>
                        {/* Game info */}
                        <div className="col-span-3">
                          <p className={`text-xs font-semibold ${game.isChampionship ? 'text-amber-600' : 'text-slate-700'}`}>{gameLabel(game)}</p>
                          <p className="text-xs text-slate-400">{fmtDate(game.date)}, {fmt12(game.startTime)}</p>
                          <p className="text-xs text-slate-400 truncate">{game.location}</p>
                        </div>
                        {/* Team 1 */}
                        <div className={`col-span-3 text-sm truncate ${t1wins ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{game.team1}</div>
                        {/* Scores */}
                        <div className="col-span-2 flex items-center gap-1 justify-center">
                          <input ref={el => { inputRefs.current[`${game.id}-s1`] = el }}
                            type="number" min="0" max="99"
                            className={`w-12 text-center text-sm font-bold border rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-teal-400 ${t1wins ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300'}`}
                            value={draft.s1} placeholder="–"
                            onChange={e => setDraft(game.id, 's1', e.target.value)}
                            onKeyDown={e => handleKey(e, game.id, 's1')}
                            onBlur={() => saveGame(game.id)} />
                          <span className="text-slate-400 text-xs">–</span>
                          <input ref={el => { inputRefs.current[`${game.id}-s2`] = el }}
                            type="number" min="0" max="99"
                            className={`w-12 text-center text-sm font-bold border rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-teal-400 ${t2wins ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300'}`}
                            value={draft.s2} placeholder="–"
                            onChange={e => setDraft(game.id, 's2', e.target.value)}
                            onKeyDown={e => handleKey(e, game.id, 's2')}
                            onBlur={() => saveGame(game.id)} />
                        </div>
                        {/* Team 2 */}
                        <div className={`col-span-2 text-sm truncate ${t2wins ? 'font-bold text-slate-900' : 'text-slate-600'}`}>{game.team2}</div>
                        {/* Note */}
                        <div className="col-span-1">
                          <input className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-300 text-slate-600"
                            value={draft.note}
                            placeholder="Note…"
                            onChange={e => setDraft(game.id, 'note', e.target.value)} />
                        </div>
                        {/* Final checkbox */}
                        <div className="col-span-1 flex justify-center">
                          {saving[game.id] ? (
                            <span className="text-xs text-teal-400">…</span>
                          ) : (
                            <input type="checkbox"
                              checked={isScored && !draft.dirty}
                              onChange={e => toggleFinal(game.id, e.target.checked)}
                              className="w-4 h-4 accent-teal-600 cursor-pointer" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>{/* end overflow-x-auto */}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
