'use client'
import { useEffect, useState, useCallback } from 'react'
import { TEMPLATE_CATALOG, BRACKET_TEMPLATES, type GameTemplate, type TemplateCatalogEntry } from '@/lib/bracketTemplates'

// ── Types ─────────────────────────────────────────────────────────────

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

// ── Layout constants ──────────────────────────────────────────────────

const GAME_H = 72
const GAME_W = 210
const CONN_W = 44
const GAME_GAP = 12
const UNIT = GAME_H + GAME_GAP

function gameTop(round: number, idx: number): number {
  const spacing = UNIT * Math.pow(2, round - 1)
  const firstCenter = GAME_H / 2 + (spacing - UNIT) / 2
  return firstCenter + idx * spacing - GAME_H / 2
}

function srcLabel(src: string): string {
  if (!src) return 'TBD'
  const [type, n] = src.split(':')
  if (type === 'seed') return `Seed ${n}`
  if (type === 'winner') return `W-B${n}`
  if (type === 'loser') return `L-B${n}`
  return src
}

const FORMAT_LABELS: Record<string, string> = {
  single: 'Single Elimination',
  double: 'Double Elimination',
  '2gg': '2-Game Guarantee',
}

// ── Main component ────────────────────────────────────────────────────

export default function BracketBuilder({ tournamentId, division }: Props) {
  const [loading, setLoading] = useState(true)
  const [bracket, setBracket] = useState<BracketData | null>(null)
  const [tab, setTab] = useState<'seeding' | 'preview'>('seeding')
  const [seeds, setSeeds] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selFormat, setSelFormat] = useState<'single' | 'double' | '2gg'>('single')
  const [selCount, setSelCount] = useState<number>(8)
  const [creating, setCreating] = useState(false)

  const apiBase = `/api/tournaments/${tournamentId}/divisions/${division}/bracket`

  const loadBracket = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(apiBase)
      if (r.ok) {
        const d = await r.json()
        setBracket(d)
        setSeeds(d.seeds || {})
      } else {
        setBracket(null)
      }
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => { loadBracket() }, [loadBracket])

  async function handleCreate() {
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
      setBracket(prev => prev ? { ...prev, seeds: d.seeds || {} } : prev)
      setSeeds(d.seeds || {})
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this bracket and all its games? This cannot be undone.')) return
    setDeleting(true)
    try {
      await fetch(apiBase, { method: 'DELETE' })
      setBracket(null)
      setSeeds({})
    } finally { setDeleting(false) }
  }

  // ── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
        Loading bracket…
      </div>
    )
  }

  // ── Setup wizard ─────────────────────────────────────────────────

  if (!bracket) {
    const validCounts = [...new Set(
      TEMPLATE_CATALOG.filter(t => t.format === selFormat).map(t => t.teamCount)
    )].sort((a, b) => a - b)
    if (!validCounts.includes(selCount)) setSelCount(validCounts[1] ?? validCounts[0])
    const entry = TEMPLATE_CATALOG.find(t => t.key === `${selFormat}-${selCount}`)

    return (
      <div className="py-6 px-2 max-w-lg">
        <p className="text-sm text-slate-400 mb-6">No bracket yet. Choose a format and team count to generate one.</p>

        {error && (
          <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Format</p>
          <div className="grid grid-cols-3 gap-2">
            {(['single', 'double', '2gg'] as const).map(fmt => (
              <button
                key={fmt}
                onClick={() => setSelFormat(fmt)}
                className={`py-3 px-2 rounded-lg border text-sm font-medium text-center transition-all ${
                  selFormat === fmt
                    ? 'bg-teal-600 border-teal-500 text-white shadow-lg shadow-teal-900/30'
                    : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                {FORMAT_LABELS[fmt]}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Teams</p>
          <div className="flex gap-2">
            {validCounts.map(n => (
              <button
                key={n}
                onClick={() => setSelCount(n)}
                className={`w-14 py-2.5 rounded-lg border text-sm font-bold transition-all ${
                  selCount === n
                    ? 'bg-teal-600 border-teal-500 text-white'
                    : 'bg-slate-800 border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {entry && (
          <div className="mb-5 bg-slate-800 border border-slate-700 rounded-xl p-4 text-sm">
            <div className="font-semibold text-white">{entry.label} · {entry.teamCount} teams</div>
            <div className="text-slate-400 mt-0.5">{entry.description}</div>
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={creating || !entry}
          className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm"
        >
          {creating ? 'Creating…' : 'Generate Bracket'}
        </button>
      </div>
    )
  }

  // ── Bracket exists ────────────────────────────────────────────────

  const entry = TEMPLATE_CATALOG.find(e => e.key === `${bracket.format}-${bracket.teamCount}`)
  const template = BRACKET_TEMPLATES[`${bracket.format}-${bracket.teamCount}`] ?? []

  return (
    <div>
      {/* Header bar */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <span className="font-semibold text-white text-sm">
            {entry?.label ?? FORMAT_LABELS[bracket.format] ?? bracket.format}
          </span>
          <span className="ml-2 text-slate-400 text-sm">{bracket.teamCount} teams · {entry?.gameCount ?? template.length} games</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('seeding')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'seeding' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Seeds
          </button>
          <button
            onClick={() => setTab('preview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'preview' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            Preview
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="ml-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Reset'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* ── Seeds tab ─────────────────────────────────────────── */}
      {tab === 'seeding' && (
        <div>
          <p className="text-sm text-slate-400 mb-4">
            Enter team names for each seed. Leave blank to show "Seed N" on the bracket.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
            {Array.from({ length: bracket.teamCount }, (_, i) => i + 1).map(n => (
              <div key={n} className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-500 w-12 text-right shrink-0">#{n}</span>
                <input
                  type="text"
                  value={seeds[String(n)] ?? ''}
                  onChange={e => setSeeds(prev => ({ ...prev, [String(n)]: e.target.value }))}
                  placeholder={`Seed ${n}`}
                  className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500/30"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSaveSeeds}
            disabled={saving}
            className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {saving ? 'Saving…' : 'Save Seeds'}
          </button>
          <p className="mt-3 text-xs text-slate-500">After saving, click <strong className="text-slate-400">Preview</strong> to see the bracket.</p>
        </div>
      )}

      {/* ── Preview tab ───────────────────────────────────────── */}
      {tab === 'preview' && (
        <BracketPreview template={template} seeds={seeds} />
      )}
    </div>
  )
}

// ── Visual Bracket Preview ────────────────────────────────────────────

function resolveLabel(src: string, seeds: Record<string, string>): string {
  if (!src) return 'TBD'
  const [type, n] = src.split(':')
  if (type === 'seed') return seeds[n] || `Seed ${n}`
  if (type === 'winner') return `W-B${n}`
  if (type === 'loser') return `L-B${n}`
  return src
}

function BracketPreview({ template, seeds }: { template: GameTemplate[]; seeds: Record<string, string> }) {
  const mainGames = template.filter(g => g.section === 'winners' || g.section === 'championship')
  const sideGames = template.filter(g => g.section === 'consolation' || g.section === 'losers')
  const mainRounds = [...new Set(mainGames.map(g => g.round))].sort((a, b) => a - b)
  const maxRound = Math.max(...mainRounds)

  function colLeft(r: number) { return (r - 1) * (GAME_W + CONN_W) }
  function gamesInRound(r: number) { return mainGames.filter(g => g.round === r).sort((a, b) => a.gameNumber - b.gameNumber) }

  const positions: Record<number, { x: number; y: number; cy: number }> = {}
  mainRounds.forEach(r => {
    gamesInRound(r).forEach((g, idx) => {
      const y = gameTop(r, idx)
      positions[g.gameNumber] = { x: colLeft(r), y, cy: y + GAME_H / 2 }
    })
  })

  const canvasW = colLeft(maxRound) + GAME_W + 20
  const canvasH = Math.max(...mainGames.map(g => (positions[g.gameNumber]?.y ?? 0) + GAME_H)) + 20

  const connectors: JSX.Element[] = []
  mainGames.forEach(game => {
    const pos = positions[game.gameNumber]
    if (!pos) return
    const feeders: number[] = []
    ;[game.t1, game.t2].forEach(src => {
      const [type, n] = src.split(':')
      if ((type === 'winner' || type === 'loser') && positions[parseInt(n)]) feeders.push(parseInt(n))
    })
    if (feeders.length >= 2) {
      const f1 = positions[feeders[0]], f2 = positions[feeders[1]]
      if (f1 && f2) {
        const midX = f1.x + GAME_W + CONN_W / 2
        connectors.push(<path key={`a-${game.gameNumber}`} d={`M${f1.x+GAME_W},${f1.cy} H${midX}`} fill="none" stroke="#334155" strokeWidth="1.5"/>)
        connectors.push(<path key={`b-${game.gameNumber}`} d={`M${f2.x+GAME_W},${f2.cy} H${midX}`} fill="none" stroke="#334155" strokeWidth="1.5"/>)
        connectors.push(<line key={`c-${game.gameNumber}`} x1={midX} y1={f1.cy} x2={midX} y2={f2.cy} stroke="#334155" strokeWidth="1.5"/>)
        connectors.push(<path key={`d-${game.gameNumber}`} d={`M${midX},${pos.cy} H${pos.x}`} fill="none" stroke="#334155" strokeWidth="1.5"/>)
      }
    } else if (feeders.length === 1) {
      const f = positions[feeders[0]]
      if (f) connectors.push(<path key={`sf-${game.gameNumber}`} d={`M${f.x+GAME_W},${f.cy} H${pos.x}`} fill="none" stroke="#334155" strokeWidth="1.5"/>)
    }
  })

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div style={{ position: 'relative', width: canvasW, height: canvasH, minHeight: 120 }}>
          <svg style={{ position: 'absolute', top: 0, left: 0, width: canvasW, height: canvasH, pointerEvents: 'none' }} viewBox={`0 0 ${canvasW} ${canvasH}`}>
            {connectors}
          </svg>
          {mainGames.map(game => {
            const pos = positions[game.gameNumber]
            if (!pos) return null
            const isChamp = game.section === 'championship'
            return (
              <div key={game.gameNumber} style={{ position: 'absolute', left: pos.x, top: pos.y, width: GAME_W, height: GAME_H }}
                className={`rounded-lg border text-xs flex flex-col overflow-hidden ${isChamp ? 'border-amber-500/50 bg-amber-500/10' : 'border-slate-600 bg-slate-800'}`}>
                <div className="px-2 py-0.5 bg-black/20 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">B{game.gameNumber}</span>
                  {game.label && <span className="text-[10px] text-amber-400">{game.label}</span>}
                </div>
                {[game.t1, game.t2].map((src, i) => (
                  <div key={i} className={`flex-1 flex items-center px-2 ${i === 0 ? 'border-b border-slate-700' : ''}`}>
                    <span className="truncate text-slate-200 text-[11px]">{resolveLabel(src, seeds)}</span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {sideGames.length > 0 && (
        <div className="mt-5 pt-4 border-t border-slate-700">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {sideGames.some(g => g.section === 'losers') ? "Losers' Bracket" : 'Consolation Games'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sideGames.map(game => (
              <div key={game.gameNumber} className="rounded-lg border border-slate-600 bg-slate-800 text-xs overflow-hidden">
                <div className="px-2 py-0.5 bg-black/20 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">B{game.gameNumber}</span>
                  {game.label && <span className="text-[10px] text-slate-400">{game.label}</span>}
                </div>
                {[game.t1, game.t2].map((src, i) => (
                  <div key={i} className={`px-2 py-1 flex items-center ${i === 0 ? 'border-b border-slate-700' : ''}`}>
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
