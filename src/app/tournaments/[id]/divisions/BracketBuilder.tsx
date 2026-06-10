'use client'
import { useEffect, useState, useCallback } from 'react'
import { TEMPLATE_CATALOG, BRACKET_TEMPLATES, type GameTemplate, type TemplateCatalogEntry } from '@/lib/bracketTemplates'

// ── Types ────────────────────────────────────────────────────────────

interface BracketGame {
  id: string
  gameNumber: number
  label: string | null
  t1Source: string
  t2Source: string
  section: string
  round: number
}

interface BracketData {
  id: string
  format: string
  teamCount: number
  seeds: Record<string, string>
  games: BracketGame[]
}

interface Props {
  tournamentId: string
  division: string
}

// ── Visual layout constants ──────────────────────────────────────────

const GAME_H  = 72
const GAME_W  = 210
const CONN_W  = 44
const GAME_GAP = 12
const UNIT    = GAME_H + GAME_GAP  // 84

function gameTop(round: number, indexInRound: number): number {
  const spacing = UNIT * Math.pow(2, round - 1)
  const firstCenter = GAME_H / 2 + (spacing - UNIT) / 2
  const cy = firstCenter + indexInRound * spacing
  return cy - GAME_H / 2
}

function gameCY(round: number, indexInRound: number): number {
  return gameTop(round, indexInRound) + GAME_H / 2
}

// ── Source label helper ──────────────────────────────────────────────

function srcLabel(src: string): string {
  if (!src) return 'TBD'
  const [type, n] = src.split(':')
  if (type === 'seed')   return `Seed ${n}`
  if (type === 'winner') return `W-B${n}`
  if (type === 'loser')  return `L-B${n}`
  return src
}

// ── Format display name helper ────────────────────────────────────────

const FORMAT_LABELS: Record<string, string> = {
  single: 'Single Elimination',
  double: 'Double Elimination',
  '2gg':  '2-Game Guarantee',
}

// ── Main Component ───────────────────────────────────────────────────

export default function BracketBuilder({ tournamentId, division }: Props) {
  const [loading, setLoading] = useState(true)
  const [bracket, setBracket]  = useState<BracketData | null>(null)
  const [tab, setTab]          = useState<'seeding' | 'preview'>('seeding')
  const [seeds, setSeeds]      = useState<Record<string, string>>({})
  const [saving, setSaving]    = useState(false)
  const [error, setError]      = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Setup wizard state
  const [selFormat, setSelFormat] = useState<'single' | 'double' | '2gg'>('single')
  const [selCount,  setSelCount]  = useState<number>(8)
  const [creating,  setCreating]  = useState(false)

  const apiBase = `/api/tournaments/${tournamentId}/divisions/${division}/bracket`

  // ── Load bracket ─────────────────────────────────────────────────

  const loadBracket = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(apiBase)
      if (r.ok) {
        const d = await r.json()
        setBracket(d)
        setSeeds(d.seeds || {})
        setTab('seeding')
      } else if (r.status === 404) {
        setBracket(null)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => { loadBracket() }, [loadBracket])

  // ── Create bracket ───────────────────────────────────────────────

  async function handleCreate() {
    const key = `${selFormat}-${selCount}`
    if (!BRACKET_TEMPLATES[key]) { setError('No template for this combination'); return }
    setCreating(true); setError(null)
    try {
      const r = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: selFormat, teamCount: selCount, seeds: {} }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to create') }
      await loadBracket()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  // ── Save seeds ───────────────────────────────────────────────────

  async function handleSaveSeeds() {
    if (!bracket) return
    setSaving(true); setError(null)
    try {
      const r = await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds }),
      })
      if (!r.ok) throw new Error('Failed to save')
      const d = await r.json()
      setBracket(d)
      setSeeds(d.seeds || {})
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete bracket ───────────────────────────────────────────────

  async function handleDelete() {
    if (!confirm('Delete this bracket? This cannot be undone.')) return
    setDeleting(true)
    try {
      await fetch(apiBase, { method: 'DELETE' })
      setBracket(null)
    } finally { setDeleting(false) }
  }

  // ── Render: loading ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        Loading bracket…
      </div>
    )
  }

  // ── Render: setup wizard ─────────────────────────────────────────

  if (!bracket) {
    const validCounts = [...new Set(
      TEMPLATE_CATALOG.filter(t => t.format === selFormat).map(t => t.teamCount)
    )].sort((a, b) => a - b)

    const selectedEntry = TEMPLATE_CATALOG.find(t => t.key === `${selFormat}-${selCount}`)

    return (
      <div className="max-w-xl mx-auto py-8 px-4">
        <h2 className="text-lg font-semibold text-white mb-1">Set Up Bracket</h2>
        <p className="text-sm text-slate-400 mb-6">Choose a format and team count to get started.</p>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {/* Format picker */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Format</label>
          <div className="grid grid-cols-3 gap-2">
            {(['single', 'double', '2gg'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => { setSelFormat(fmt); setSelCount(8) }}
                className={`py-3 px-2 rounded-lg border text-sm font-medium text-center transition-colors ${
                  selFormat === fmt
                    ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20 hover:text-white'
                }`}
              >
                {FORMAT_LABELS[fmt]}
              </button>
            ))}
          </div>
        </div>

        {/* Team count picker */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Team Count</label>
          <div className="flex gap-2">
            {validCounts.map(n => (
              <button
                key={n}
                onClick={() => setSelCount(n)}
                className={`w-14 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${
                  selCount === n
                    ? 'bg-teal-500/20 border-teal-500/50 text-teal-300'
                    : 'bg-white/5 border-white/10 text-slate-300 hover:border-white/20'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Summary card */}
        {selectedEntry && (
          <div className="mb-6 bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="text-sm font-semibold text-white mb-1">
              {selectedEntry.label} — {selectedEntry.teamCount} Teams
            </div>
            <div className="text-xs text-slate-400">{selectedEntry.description}</div>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={creating || !selectedEntry}
          className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
        >
          {creating ? 'Creating…' : 'Create Bracket'}
        </button>
      </div>
    )
  }

  // ── Render: bracket exists ────────────────────────────────────────

  const catalogEntry = TEMPLATE_CATALOG.find(e => e.key === `${bracket.format}-${bracket.teamCount}`)
  const template = BRACKET_TEMPLATES[`${bracket.format}-${bracket.teamCount}`] ?? []

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-sm font-semibold text-white">
            {catalogEntry?.label ?? bracket.format} — {bracket.teamCount} Teams
          </span>
          {catalogEntry && (
            <span className="ml-2 text-xs text-slate-500">{catalogEntry.description}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab('seeding')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'seeding'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Seeds
          </button>
          <button
            onClick={() => setTab('preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === 'preview'
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Preview
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* ── Seeding tab ──────────────────────────────────────────── */}
      {tab === 'seeding' && (
        <div>
          <p className="text-xs text-slate-400 mb-4">
            Enter team names for each seed. These will appear on the bracket.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
            {Array.from({ length: bracket.teamCount }, (_, i) => i + 1).map(n => (
              <div key={n} className="flex items-center gap-2">
                <span className="text-xs text-slate-500 w-14 text-right shrink-0">Seed {n}</span>
                <input
                  type="text"
                  value={seeds[String(n)] ?? ''}
                  onChange={e => setSeeds(prev => ({ ...prev, [String(n)]: e.target.value }))}
                  placeholder={`Seed ${n}`}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50"
                />
              </div>
            ))}
          </div>

          {/* Game list preview */}
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Games</h3>
            <div className="space-y-1">
              {(['winners', 'consolation', 'losers', 'championship'] as const).map(section => {
                const sectionGames = template.filter(g => g.section === section)
                if (!sectionGames.length) return null
                const sectionLabel = section === 'winners' ? "Winners' Bracket"
                  : section === 'losers' ? "Losers' Bracket"
                  : section === 'consolation' ? 'Consolation'
                  : 'Championship'
                return (
                  <div key={section} className="mb-3">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
                      {sectionLabel}
                    </div>
                    {sectionGames.map(g => (
                      <div key={g.gameNumber}
                        className="flex items-center gap-3 py-1.5 px-3 rounded-lg bg-white/3 hover:bg-white/5 text-xs">
                        <span className="text-slate-500 font-mono w-8">B{g.gameNumber}</span>
                        <span className="text-slate-300 flex-1">
                          {seeds[g.t1.split(':')[1]] || srcLabel(g.t1)}
                          <span className="text-slate-600 mx-1.5">vs</span>
                          {seeds[g.t2.split(':')[1]] || srcLabel(g.t2)}
                        </span>
                        <span className="text-slate-600">R{g.round}</span>
                        {g.label && <span className="text-teal-400/70 text-[10px]">{g.label}</span>}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          <button
            onClick={handleSaveSeeds}
            disabled={saving}
            className="px-5 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {saving ? 'Saving…' : 'Save Seeds'}
          </button>
        </div>
      )}

      {/* ── Preview tab ──────────────────────────────────────────── */}
      {tab === 'preview' && (
        <BracketPreview
          template={template}
          seeds={seeds}
          teamCount={bracket.teamCount}
        />
      )}
    </div>
  )
}

// ── Visual Bracket Preview ────────────────────────────────────────────

interface PreviewProps {
  template: GameTemplate[]
  seeds: Record<string, string>
  teamCount: number
}

function resolveLabel(src: string, seeds: Record<string, string>): string {
  if (!src) return 'TBD'
  const [type, n] = src.split(':')
  if (type === 'seed') return seeds[n] || `Seed ${n}`
  if (type === 'winner') return `W-B${n}`
  if (type === 'loser')  return `L-B${n}`
  return src
}

function BracketPreview({ template, seeds, teamCount }: PreviewProps) {
  // Separate by section — winners+championship in main bracket, rest below
  const mainGames = template.filter(g => g.section === 'winners' || g.section === 'championship')
  const sideGames = template.filter(g => g.section === 'consolation' || g.section === 'losers')

  const mainRounds = [...new Set(mainGames.map(g => g.round))].sort((a, b) => a - b)
  const maxRound   = Math.max(...mainRounds)

  // For main bracket: compute column x, game y
  // Column left edge for round R (1-based)
  function colLeft(r: number): number {
    return (r - 1) * (GAME_W + CONN_W)
  }

  // Games in round R (main section)
  function gamesInRound(r: number) {
    return mainGames.filter(g => g.round === r).sort((a, b) => a.gameNumber - b.gameNumber)
  }

  // Build position map: gameNumber -> { x, y, cy }
  const positions: Record<number, { x: number; y: number; cy: number }> = {}

  mainRounds.forEach(r => {
    const games = gamesInRound(r)
    games.forEach((g, idx) => {
      const y  = gameTop(r, idx)
      const cy = y + GAME_H / 2
      const x  = colLeft(r)
      positions[g.gameNumber] = { x, y, cy }
    })
  })

  // Total canvas dimensions
  const canvasW = colLeft(maxRound) + GAME_W + 20
  const canvasH = Math.max(
    ...mainGames.map(g => {
      const p = positions[g.gameNumber]
      return p ? p.y + GAME_H : 0
    })
  ) + 20

  // Build SVG connector lines
  const connectors: JSX.Element[] = []

  mainGames.forEach(game => {
    const pos = positions[game.gameNumber]
    if (!pos) return

    // Find the game's feeders (games whose winner/loser feeds this game)
    const feeders: number[] = []
    ;[game.t1, game.t2].forEach(src => {
      const [type, n] = src.split(':')
      if (type === 'winner' || type === 'loser') {
        const feederGameNum = parseInt(n)
        if (positions[feederGameNum]) feeders.push(feederGameNum)
      }
    })

    if (feeders.length >= 2) {
      const f1pos = positions[feeders[0]]
      const f2pos = positions[feeders[1]]
      if (f1pos && f2pos) {
        const midX = f1pos.x + GAME_W + CONN_W / 2
        // Line from f1 to mid
        connectors.push(
          <path key={`c-${game.gameNumber}-f1`}
            d={`M${f1pos.x + GAME_W},${f1pos.cy} H${midX}`}
            fill="none" stroke="#334155" strokeWidth="1.5" />
        )
        // Line from f2 to mid
        connectors.push(
          <path key={`c-${game.gameNumber}-f2`}
            d={`M${f2pos.x + GAME_W},${f2pos.cy} H${midX}`}
            fill="none" stroke="#334155" strokeWidth="1.5" />
        )
        // Vertical line between f1 and f2 at midX
        connectors.push(
          <line key={`cv-${game.gameNumber}`}
            x1={midX} y1={f1pos.cy} x2={midX} y2={f2pos.cy}
            stroke="#334155" strokeWidth="1.5" />
        )
        // Line from mid to this game
        connectors.push(
          <path key={`c-${game.gameNumber}-in`}
            d={`M${midX},${pos.cy} H${pos.x}`}
            fill="none" stroke="#334155" strokeWidth="1.5" />
        )
      }
    } else if (feeders.length === 1) {
      // Single feeder (e.g., championship from one side)
      const fpos = positions[feeders[0]]
      if (fpos) {
        connectors.push(
          <path key={`c-${game.gameNumber}-sf`}
            d={`M${fpos.x + GAME_W},${fpos.cy} H${pos.x}`}
            fill="none" stroke="#334155" strokeWidth="1.5" />
        )
      }
    }
  })

  // Section color helper
  const sectionColor = (section: string) => {
    if (section === 'championship') return 'border-amber-500/40 bg-amber-500/10'
    if (section === 'consolation' || section === 'losers') return 'border-slate-500/30 bg-slate-500/10'
    return 'border-white/10 bg-white/5'
  }

  return (
    <div>
      {/* Main bracket */}
      <div className="overflow-x-auto pb-4">
        <div style={{ position: 'relative', width: canvasW, height: canvasH, minHeight: 120 }}>
          {/* SVG connector lines */}
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: canvasW, height: canvasH, pointerEvents: 'none' }}
            viewBox={`0 0 ${canvasW} ${canvasH}`}
          >
            {connectors}
          </svg>

          {/* Game cards */}
          {mainGames.map(game => {
            const pos = positions[game.gameNumber]
            if (!pos) return null
            return (
              <div
                key={game.gameNumber}
                style={{
                  position: 'absolute',
                  left: pos.x,
                  top: pos.y,
                  width: GAME_W,
                  height: GAME_H,
                }}
                className={`rounded-lg border text-xs flex flex-col overflow-hidden ${sectionColor(game.section)}`}
              >
                {/* Game number bar */}
                <div className="px-2 py-0.5 bg-black/20 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">B{game.gameNumber}</span>
                  {game.label && <span className="text-[10px] text-teal-400/80">{game.label}</span>}
                </div>
                {/* Team rows */}
                {[game.t1, game.t2].map((src, i) => (
                  <div key={i} className={`flex-1 flex items-center px-2 ${i === 0 ? 'border-b border-white/5' : ''}`}>
                    <span className="truncate text-slate-200 text-[11px]">{resolveLabel(src, seeds)}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* Consolation / Losers bracket */}
      {sideGames.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-4">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {sideGames.some(g => g.section === 'losers') ? "Losers' Bracket" : 'Consolation'}
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {sideGames.map(game => (
              <div key={game.gameNumber}
                className="rounded-lg border border-white/10 bg-white/3 text-xs overflow-hidden">
                <div className="px-2 py-0.5 bg-black/20 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">B{game.gameNumber}</span>
                  {game.label && <span className="text-[10px] text-slate-400">{game.label}</span>}
                  <span className="text-[10px] text-slate-600">R{game.round}</span>
                </div>
                {[game.t1, game.t2].map((src, i) => (
                  <div key={i} className={`px-2 py-1 flex items-center ${i === 0 ? 'border-b border-white/5' : ''}`}>
                    <span className="truncate text-slate-300 text-[11px]">{resolveLabel(src, seeds)}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
