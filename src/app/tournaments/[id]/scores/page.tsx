'use client'
import { useEffect, useState, useRef } from 'react'
import TournamentNav from '../TournamentNav'
import toast, { Toaster } from 'react-hot-toast'

interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null
  isCanceled: boolean; isChampionship: boolean
}

type ScoreDraft = { score1: string; score2: string; dirty: boolean }

function fmt12(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

export default function PostScoresPage({ params }: { params: { id: string } }) {
  const [tName, setTName] = useState('')
  const [tLogo, setTLogo] = useState('')
  const [games, setGames] = useState<Game[]>([])
  const [drafts, setDrafts] = useState<Record<string, ScoreDraft>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [selDate, setSelDate] = useState('')
  const [selDiv, setSelDiv] = useState('')
  const [showScored, setShowScored] = useState(true)
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    fetch(`/api/tournaments/${params.id}`).then(r => r.json()).then(t => {
      setTName(t.name); setTLogo(t.logoUrl || '')
    })
    fetch(`/api/tournaments/${params.id}/games`).then(r => r.json()).then((g: Game[]) => {
      setGames(g)
      const d: Record<string, ScoreDraft> = {}
      g.forEach(game => {
        d[game.id] = {
          score1: game.score1 != null ? String(game.score1) : '',
          score2: game.score2 != null ? String(game.score2) : '',
          dirty: false,
        }
      })
      setDrafts(d)
      // Default to first date with games
      const dates = [...new Set(g.map(x => x.date))].sort()
      if (dates.length) setSelDate(dates[0])
      setLoading(false)
    })
  }, [params.id])

  const dates = [...new Set(games.map(g => g.date))].sort()
  const divisions = [...new Set(games.map(g => g.division))].sort()

  const visible = games.filter(g => {
    if (g.isCanceled) return false
    if (selDate && g.date !== selDate) return false
    if (selDiv && g.division !== selDiv) return false
    if (!showScored && g.score1 != null && g.score2 != null) return false
    return true
  }).sort((a, b) => a.startTime < b.startTime ? -1 : 1)

  function setDraft(gameId: string, field: 'score1' | 'score2', val: string) {
    setDrafts(d => ({ ...d, [gameId]: { ...d[gameId], [field]: val, dirty: true } }))
  }

  async function saveGame(gameId: string) {
    const draft = drafts[gameId]
    if (!draft?.dirty) return
    setSaving(s => ({ ...s, [gameId]: true }))
    const body: Record<string, unknown> = {
      score1: draft.score1 === '' ? null : Number(draft.score1),
      score2: draft.score2 === '' ? null : Number(draft.score2),
    }
    await fetch(`/api/games/${gameId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setGames(gs => gs.map(g => g.id === gameId ? {
      ...g,
      score1: body.score1 as number | null,
      score2: body.score2 as number | null,
    } : g))
    setDrafts(d => ({ ...d, [gameId]: { ...d[gameId], dirty: false } }))
    setSaving(s => ({ ...s, [gameId]: false }))
  }

  async function saveAll() {
    const dirty = Object.entries(drafts).filter(([, d]) => d.dirty)
    if (!dirty.length) { toast('No changes to save'); return }
    await Promise.all(dirty.map(([id]) => saveGame(id)))
    toast.success(`${dirty.length} score${dirty.length !== 1 ? 's' : ''} saved`)
  }

  function handleKeyDown(e: React.KeyboardEvent, gameId: string, field: 'score1' | 'score2') {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      saveGame(gameId)
      // Move to next input
      const allKeys = visible.flatMap(g => [`${g.id}-score1`, `${g.id}-score2`])
      const cur = `${gameId}-${field}`
      const next = allKeys[allKeys.indexOf(cur) + 1]
      if (next) inputRefs.current[next]?.focus()
    }
  }

  const dirtyCount = Object.values(drafts).filter(d => d.dirty).length
  const scoredCount = games.filter(g => !g.isCanceled && g.score1 != null && g.score2 != null).length
  const totalCount  = games.filter(g => !g.isCanceled).length

  if (loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      <Toaster />
      <TournamentNav id={params.id} name={tName} logoUrl={tLogo} />

      <div className="max-w-4xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Post Scores</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {scoredCount} of {totalCount} games scored
              {dirtyCount > 0 && <span className="ml-2 text-amber-600 font-medium">· {dirtyCount} unsaved</span>}
            </p>
          </div>
          <button onClick={saveAll} disabled={dirtyCount === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold px-5 py-2 rounded-xl text-sm transition-colors">
            {dirtyCount > 0 ? `Save ${dirtyCount} Score${dirtyCount !== 1 ? 's' : ''}` : 'All Saved ✓'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap mb-5 items-center">
          {/* Date tabs */}
          <div className="flex gap-1 flex-wrap">
            {dates.map(d => {
              const dt = new Date(d + 'T12:00:00')
              const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              return (
                <button key={d} onClick={() => setSelDate(d === selDate ? '' : d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selDate === d ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {label}
                </button>
              )
            })}
          </div>
          {/* Division filter */}
          <select value={selDiv} onChange={e => setSelDiv(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 bg-white focus:outline-none">
            <option value="">All divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {/* Show scored toggle */}
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer ml-auto">
            <input type="checkbox" checked={showScored} onChange={e => setShowScored(e.target.checked)} className="accent-blue-600" />
            Show scored
          </label>
        </div>

        {/* Games */}
        {visible.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            {!showScored ? 'All games in this view are already scored.' : 'No games found.'}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Column headers */}
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <div className="col-span-1">#</div>
              <div className="col-span-2">Time</div>
              <div className="col-span-2">Division</div>
              <div className="col-span-5">Teams</div>
              <div className="col-span-2 text-center">Score</div>
            </div>

            {visible.map((game, idx) => {
              const draft = drafts[game.id] || { score1: '', score2: '', dirty: false }
              const isScored = game.score1 != null && game.score2 != null
              const isSaving = saving[game.id]

              return (
                <div key={game.id}
                  className={`grid grid-cols-12 gap-2 px-5 py-3 items-center border-b border-gray-50 last:border-0 transition-colors ${draft.dirty ? 'bg-amber-50' : isScored ? 'bg-green-50/40' : 'hover:bg-gray-50/50'}`}>
                  {/* Game # */}
                  <div className="col-span-1">
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${game.isChampionship ? 'bg-amber-100 text-amber-700' : 'text-gray-400'}`}>
                      {game.gameNumber}
                    </span>
                  </div>
                  {/* Time */}
                  <div className="col-span-2 text-xs text-gray-500">{fmt12(game.startTime)}</div>
                  {/* Division */}
                  <div className="col-span-2">
                    <span className="text-xs text-gray-600 truncate block">{game.division}</span>
                    {game.location && <span className="text-xs text-gray-400 truncate block">{game.location}</span>}
                  </div>
                  {/* Teams */}
                  <div className="col-span-5">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium flex-1 truncate ${isScored && game.score1! > game.score2! ? 'text-green-700 font-semibold' : 'text-gray-800'}`}>{game.team1}</span>
                      <span className="text-gray-300 text-xs">vs</span>
                      <span className={`text-sm font-medium flex-1 truncate ${isScored && game.score2! > game.score1! ? 'text-green-700 font-semibold' : 'text-gray-800'}`}>{game.team2}</span>
                    </div>
                  </div>
                  {/* Score inputs */}
                  <div className="col-span-2 flex items-center gap-1.5 justify-end">
                    <input
                      ref={el => { inputRefs.current[`${game.id}-score1`] = el }}
                      type="number" min="0" max="99"
                      className={`w-12 text-center text-sm font-bold border rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${draft.dirty ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                      value={draft.score1}
                      placeholder="–"
                      onChange={e => setDraft(game.id, 'score1', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, game.id, 'score1')}
                      onBlur={() => saveGame(game.id)}
                    />
                    <span className="text-gray-400 text-xs">–</span>
                    <input
                      ref={el => { inputRefs.current[`${game.id}-score2`] = el }}
                      type="number" min="0" max="99"
                      className={`w-12 text-center text-sm font-bold border rounded-lg px-1 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors ${draft.dirty ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                      value={draft.score2}
                      placeholder="–"
                      onChange={e => setDraft(game.id, 'score2', e.target.value)}
                      onKeyDown={e => handleKeyDown(e, game.id, 'score2')}
                      onBlur={() => saveGame(game.id)}
                    />
                    {isSaving && <span className="text-xs text-blue-400">...</span>}
                    {!isSaving && isScored && !draft.dirty && <span className="text-xs text-green-500">✓</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-4 text-center">
          Press Tab or Enter to move between fields — scores save automatically on blur.
        </p>
      </div>
    </div>
  )
}
