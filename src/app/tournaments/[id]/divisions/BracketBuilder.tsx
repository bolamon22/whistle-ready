'use client'
import { useEffect, useState, useCallback } from 'react'
import { TEMPLATE_CATALOG, BRACKET_TEMPLATES, type GameTemplate } from '@/lib/bracketTemplates'

// ── Types ──────────────────────────────────────────────────────────────────

interface BracketGame {
  id: string
  gameNumber: number
  label: string | null
  team1Source: string
  team2Source: string
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
  planFormat?: 'single' | 'double' | '2gg'
  planCount?: string
  planConsolation?: string
}

// ── Layout constants ───────────────────────────────────────────────────────

const GAME_H = 72
const GAME_W = 216
const CONN_W = 48
const GAME_GAP = 16
const UNIT = GAME_H + GAME_GAP
const LABEL_H = 28

function gameTop(round: number, idx: number): number {
  const spacing = UNIT * Math.pow(2, round - 1)
  const firstCenter = GAME_H / 2 + (spacing - UNIT) / 2
  return firstCenter + idx * spacing - GAME_H / 2
}

function roundLabel(round: number, maxRound: number): string {
  if (round === maxRound) return 'Final'
  if (round === maxRound - 1 && maxRound >= 3) return 'Semifinals'
  if (round === maxRound - 2 && maxRound >= 4) return 'Quarterfinals'
  return `Round ${round}`
}

const FORMAT_LABELS: Record<string, string> = {
  single: 'Single Elimination',
  double: 'Double Elimination',
  '2gg': '2-Game Guarantee',
}

const SECTION_LABELS: Record<string, string> = {
  winners: 'Winners Bracket',
  championship: 'Championship',
  consolation: 'Consolation',
  losers: "Losers' Bracket",
}

// ── Main component ─────────────────────────────────────────────────────────

export default function BracketBuilder({ tournamentId, division, planFormat, planCount, planConsolation }: Props) {
  const [loading, setLoading] = useState(true)
  const [bracket, setBracket] = useState<BracketData | null>(null)
  const [tab, setTab] = useState<'seeding' | 'manage' | 'preview'>('seeding')
  const [seeds, setSeeds] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selFormat, setSelFormat] = useState<'single' | 'double' | '2gg'>(planFormat ?? 'single')
  const [selCountInput, setSelCountInput] = useState(planCount ?? '4')
  const [consolationInput, setConsolationInput] = useState(planConsolation ?? '0')
  const [creating, setCreating] = useState(false)

  // Add-game form state
  const [addSection, setAddSection] = useState('consolation')
  const [addRound, setAddRound] = useState(1)
  const [addT1, setAddT1] = useState('')
  const [addT2, setAddT2] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [addingGame, setAddingGame] = useState(false)
  const [removingGame, setRemovingGame] = useState<number | null>(null)

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
        body: JSON.stringify({ format: selFormat, teamCount: Math.max(2, parseInt(selCountInput) || 2), consolationCount: Math.max(0, parseInt(consolationInput) || 0), seeds: {} }),
      })
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || 'Failed to create') }
      await loadBracket()
      setTab('seeding')
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

  async function handleAddGame() {
    if (!bracket || !addT1.trim() || !addT2.trim()) return
    setAddingGame(true); setError(null)
    const maxNum = bracket.games.length > 0
      ? Math.max(...bracket.games.map(g => g.gameNumber))
      : 0
    try {
      const r = await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addGame: {
            gameNumber: maxNum + 1,
            round: addRound,
            section: addSection,
            t1Source: addT1.trim(),
            t2Source: addT2.trim(),
            label: addLabel.trim(),
          },
        }),
      })
      if (!r.ok) throw new Error('Failed to add game')
      const updated = await r.json()
      setBracket(updated)
      setSeeds(updated.seeds || {})
      setAddT1(''); setAddT2(''); setAddLabel('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAddingGame(false)
    }
  }

  async function handleRemoveGame(gameNumber: number) {
    if (!confirm(`Remove game B${gameNumber} from the bracket?`)) return
    setRemovingGame(gameNumber)
    try {
      const r = await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeGame: gameNumber }),
      })
      if (!r.ok) throw new Error('Failed to remove game')
      const updated = await r.json()
      setBracket(updated)
      setSeeds(updated.seeds || {})
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRemovingGame(null)
    }
  }

  async function handleLabelChange(gameNumber: number, label: string) {
    try {
      await fetch(apiBase, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updateLabel: { gameNumber, label } }),
      })
      setBracket(prev => prev ? { ...prev, games: prev.games.map(g => g.gameNumber === gameNumber ? { ...g, label } : g) } : prev)
    } catch { /* ignore */ }
  }

  function quickAddConsolation() {
    if (!bracket) return
    const mainGames = bracket.games.filter(g =>
      g.section === 'winners' || g.section === 'championship'
    )
    const maxRound = mainGames.length > 0
      ? Math.max(...mainGames.map(g => g.round))
      : 1
    const semis = mainGames
      .filter(g => g.round === maxRound - 1)
      .sort((a, b) => a.gameNumber - b.gameNumber)
    setAddSection('consolation')
    setAddRound(maxRound)
    setAddLabel('3rd Place')
    if (semis.length >= 2) {
      setAddT1(`loser:${semis[0].gameNumber}`)
      setAddT2(`loser:${semis[1].gameNumber}`)
    } else {
      setAddT1(''); setAddT2('')
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
        Loading bracket…
      </div>
    )
  }

  // ── Setup wizard ───────────────────────────────────────────────────────

  if (!bracket) {
    const selCount = Math.max(2, parseInt(selCountInput) || 2)
    const entry = TEMPLATE_CATALOG.find(t => t.key === `${selFormat}-${selCount}`)

    return (
      <div className="py-6 px-2 max-w-lg">
        <p className="text-sm text-slate-400 mb-6">
          No bracket yet. Choose a format and team count, then add or remove games as needed.
        </p>

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

        <div className="mb-5 grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Teams in bracket
            </label>
            <input
              type="number" min="2" max="64"
              value={selCountInput}
              onChange={e => setSelCountInput(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-teal-500"
              placeholder="e.g. 2"
            />
            <p className="text-xs text-slate-600 mt-1">Top N seeds advance to bracket</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Consolation games
            </label>
            <input
              type="number" min="0" max="20"
              value={consolationInput}
              onChange={e => setConsolationInput(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-teal-500"
              placeholder="0"
            />
            <p className="text-xs text-slate-600 mt-1">Extra consolation game slots</p>
          </div>
        </div>

        <div className="mb-5 bg-slate-800 border border-slate-700 rounded-xl p-4 text-sm">
          {entry ? (
            <>
              <div className="font-semibold text-white">{entry.label} · {entry.teamCount} teams</div>
              <div className="text-slate-400 mt-0.5">{entry.description}</div>
            </>
          ) : (
            <>
              <div className="font-semibold text-white">
                {FORMAT_LABELS[selFormat]} · {selCount} team{selCount !== 1 ? 's' : ''}
              </div>
              <div className="text-slate-400 mt-0.5">
                {selCount - 1} game{selCount - 2 !== 0 ? 's' : ''} · bracket generated automatically
                {parseInt(consolationInput) > 0 && ` · ${consolationInput} consolation slot${parseInt(consolationInput) > 1 ? 's' : ''}`}
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="w-full py-3 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm"
        >
          {creating ? 'Creating…' : 'Generate Bracket'}
        </button>
      </div>
    )
  }

  // ── Bracket exists ─────────────────────────────────────────────────────

  const entry = TEMPLATE_CATALOG.find(e => e.key === `${bracket.format}-${bracket.teamCount}`)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <span className="font-semibold text-white text-sm">
            {entry?.label ?? FORMAT_LABELS[bracket.format] ?? bracket.format}
          </span>
          <span className="ml-2 text-slate-400 text-sm">
            {bracket.teamCount} seeds · {bracket.games.length} games
          </span>
        </div>
        <div className="flex items-center gap-1">
          {(['seeding', 'manage', 'preview'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === t
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {t === 'seeding' ? 'Seeds' : t === 'manage' ? 'Games' : 'Preview'}
            </button>
          ))}
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

      {/* ── Seeds tab ─────────────────────────────────────────────────────── */}
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
          <p className="mt-3 text-xs text-slate-500">
            After saving, click <strong className="text-slate-400">Preview</strong> to see the bracket.
          </p>
        </div>
      )}

      {/* ── Games management tab ──────────────────────────────────────────── */}
      {tab === 'manage' && (
        <div>
          <p className="text-sm text-slate-400 mb-4">
            Add or remove games. Changes apply immediately.
          </p>

          {/* Game list grouped by section */}
          {bracket.games.length === 0 ? (
            <p className="text-sm text-slate-500 italic mb-5">No games yet — add one below.</p>
          ) : (
            <div className="mb-6 space-y-4">
              {(['winners', 'championship', 'consolation', 'losers'] as const)
                .map(sec => {
                  const games = bracket.games
                    .filter(g => g.section === sec)
                    .sort((a, b) => a.gameNumber - b.gameNumber)
                  if (games.length === 0) return null
                  return (
                    <div key={sec}>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                        {SECTION_LABELS[sec]}
                      </p>
                      <div className="space-y-1">
                        {games.map(g => (
                          <div
                            key={g.gameNumber}
                            className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2"
                          >
                            <span className="text-xs font-mono text-slate-500 w-8 shrink-0">B{g.gameNumber}</span>
                            <span className="text-xs text-slate-500 shrink-0">R{g.round}</span>
                            <span className="flex-1 text-xs text-slate-300 truncate font-mono">
                              {g.team1Source} <span className="text-slate-600 font-sans">vs</span> {g.team2Source}
                            </span>
                            {g.label && (
                              <span className="text-xs text-amber-400 shrink-0 mr-1">{g.label}</span>
                            )}
                            <button
                              onClick={() => handleRemoveGame(g.gameNumber)}
                              disabled={removingGame === g.gameNumber}
                              className="text-slate-600 hover:text-red-400 transition-colors text-sm shrink-0 w-6 text-center"
                              title="Remove game"
                            >
                              {removingGame === g.gameNumber ? '…' : '✕'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}

          {/* Add game form */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Add Game</p>
              <button
                onClick={quickAddConsolation}
                className="text-xs px-2.5 py-1 rounded-lg bg-slate-700 text-teal-400 hover:bg-slate-600 transition-colors"
              >
                ⚡ Quick Consolation
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Section</label>
                <select
                  value={addSection}
                  onChange={e => setAddSection(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="winners">Winners</option>
                  <option value="consolation">Consolation</option>
                  <option value="championship">Championship</option>
                  <option value="losers">Losers</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Round</label>
                <input
                  type="number"
                  min={1}
                  value={addRound}
                  onChange={e => setAddRound(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Team 1 source</label>
                <input
                  type="text"
                  value={addT1}
                  onChange={e => setAddT1(e.target.value)}
                  placeholder="seed:1 or winner:3"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Team 2 source</label>
                <input
                  type="text"
                  value={addT2}
                  onChange={e => setAddT2(e.target.value)}
                  placeholder="seed:4 or loser:3"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-500 mb-1 block">Label <span className="text-slate-600">(optional)</span></label>
                <input
                  type="text"
                  value={addLabel}
                  onChange={e => setAddLabel(e.target.value)}
                  placeholder="e.g. 3rd Place, Gold, Consolation Final"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-3">
              Source syntax: <code className="text-slate-500 bg-slate-900/50 px-1 rounded">seed:N</code>{' '}
              <code className="text-slate-500 bg-slate-900/50 px-1 rounded">winner:N</code>{' '}
              <code className="text-slate-500 bg-slate-900/50 px-1 rounded">loser:N</code>
              {' '}where N is a game number (e.g. winner:3 = winner of B3)
            </p>

            <button
              onClick={handleAddGame}
              disabled={addingGame || !addT1.trim() || !addT2.trim()}
              className="px-5 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {addingGame ? 'Adding…' : '+ Add Game'}
            </button>
          </div>
        </div>
      )}

      {/* ── Preview tab ───────────────────────────────────────────────────── */}
      {tab === 'preview' && (
        <BracketPreview
          template={bracket.games.map(g => ({
            gameNumber: g.gameNumber,
            round: g.round,
            section: g.section as 'winners' | 'losers' | 'consolation' | 'championship',
            t1: g.team1Source,
            t2: g.team2Source,
            label: g.label || undefined,
          }))}
          seeds={seeds}
          division={division}
          onLabelChange={handleLabelChange}
        />
      )}
    </div>
  )
}

// ── Visual Bracket Preview ─────────────────────────────────────────────────

function resolveLabel(src: string, seeds: Record<string, string>): string {
  if (!src) return 'TBD'
  const [type, n] = src.split(':')
  if (type === 'seed') return seeds[n] || `Seed ${n}`
  if (type === 'winner') return `W-B${n}`
  if (type === 'loser') return `L-B${n}`
  return src
}

function BracketPreview({ template, seeds, division, onLabelChange }: {
  template: GameTemplate[]
  seeds: Record<string, string>
  division?: string
  onLabelChange?: (gameNumber: number, label: string) => void
}) {
  const [editingLabel, setEditingLabel] = useState<{ gameNumber: number; value: string } | null>(null)

  const mainGames = template.filter(g => g.section === 'winners' || g.section === 'championship')
  const sideGames = template.filter(g => g.section === 'consolation' || g.section === 'losers')
  const mainRounds = [...new Set(mainGames.map(g => g.round))].sort((a, b) => a - b)
  const maxRound = mainRounds.length > 0 ? Math.max(...mainRounds) : 1

  function colLeft(r: number) { return (r - 1) * (GAME_W + CONN_W) }
  function gamesInRound(r: number) { return mainGames.filter(g => g.round === r).sort((a, b) => a.gameNumber - b.gameNumber) }

  const positions: Record<number, { x: number; y: number; cy: number }> = {}
  mainRounds.forEach(r => {
    gamesInRound(r).forEach((g, idx) => {
      const y = gameTop(r, idx)
      positions[g.gameNumber] = { x: colLeft(r), y, cy: y + GAME_H / 2 }
    })
  })

  const canvasW = colLeft(maxRound) + GAME_W + 24
  const canvasH = mainGames.length > 0
    ? Math.max(...mainGames.map(g => (positions[g.gameNumber]?.y ?? 0) + GAME_H)) + 24
    : 120

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
        connectors.push(<path key={`a-${game.gameNumber}`} d={`M${f1.x+GAME_W},${f1.cy} H${midX}`} fill="none" stroke="#475569" strokeWidth="1.5"/>)
        connectors.push(<path key={`b-${game.gameNumber}`} d={`M${f2.x+GAME_W},${f2.cy} H${midX}`} fill="none" stroke="#475569" strokeWidth="1.5"/>)
        connectors.push(<line key={`c-${game.gameNumber}`} x1={midX} y1={f1.cy} x2={midX} y2={f2.cy} stroke="#475569" strokeWidth="1.5"/>)
        connectors.push(<path key={`d-${game.gameNumber}`} d={`M${midX},${pos.cy} H${pos.x}`} fill="none" stroke="#475569" strokeWidth="1.5"/>)
      }
    } else if (feeders.length === 1) {
      const f = positions[feeders[0]]
      if (f) {
        const midX = f.x + GAME_W + CONN_W / 2
        connectors.push(
          <path key={`sf-${game.gameNumber}`} d={`M${f.x+GAME_W},${f.cy} C${midX},${f.cy} ${midX},${pos.cy} ${pos.x},${pos.cy}`} fill="none" stroke="#475569" strokeWidth="1.5"/>
        )
      }
    }
  })

  if (mainGames.length === 0) {
    return (
      <div className="text-center py-10 text-slate-500 text-sm">
        No bracket games yet — go to <strong className="text-slate-400">Games</strong> tab to add some.
      </div>
    )
  }

  return (
    <div>
      {/* Round column labels */}
      <div style={{ position: 'relative', width: canvasW, height: LABEL_H }} className="mb-1">
        {mainRounds.map(r => (
          <div
            key={r}
            style={{ position: 'absolute', left: colLeft(r), width: GAME_W, textAlign: 'center' }}
            className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider"
          >
            {roundLabel(r, maxRound)}
          </div>
        ))}
      </div>

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
                className={`rounded-lg border text-xs flex flex-col overflow-hidden ${isChamp ? 'border-amber-400/60 bg-gradient-to-b from-amber-950/60 to-slate-900 shadow-lg shadow-amber-900/20' : 'border-slate-600/80 bg-slate-800/90'}`}>
                <div className={`px-2 py-0.5 flex items-center justify-between ${isChamp ? 'bg-amber-500/10' : 'bg-black/20'}`}>
                  <span className="text-[10px] font-mono text-slate-500">B{game.gameNumber}</span>
                  {(() => {
                    const displayLabel = game.label || (isChamp ? (division ? `${division} Champion` : 'Champion') : undefined)
                    if (!displayLabel) return null
                    if (editingLabel?.gameNumber === game.gameNumber) {
                      return (
                        <input
                          autoFocus
                          value={editingLabel.value}
                          onChange={e => setEditingLabel({ gameNumber: game.gameNumber, value: e.target.value })}
                          onBlur={() => { onLabelChange?.(game.gameNumber, editingLabel.value); setEditingLabel(null) }}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { onLabelChange?.(game.gameNumber, editingLabel.value); setEditingLabel(null) } }}
                          className="text-[10px] bg-transparent border-b border-amber-400 text-amber-300 outline-none w-28 text-right"
                        />
                      )
                    }
                    return (
                      <button
                        onClick={() => setEditingLabel({ gameNumber: game.gameNumber, value: displayLabel })}
                        title="Click to edit label"
                        className={`text-[10px] font-semibold hover:opacity-70 cursor-text text-right ${isChamp ? 'text-amber-400' : 'text-amber-400/70'}`}
                      >
                        {isChamp && '🏆 '}{displayLabel}
                      </button>
                    )
                  })()}
                </div>
                {[game.t1, game.t2].map((src, i) => (
                  <div key={i} className={`flex-1 flex items-center px-2.5 ${i === 0 ? 'border-b border-slate-700/80' : ''}`}>
                    <span className={`truncate text-xs font-medium ${resolveLabel(src, seeds).startsWith('W-') || resolveLabel(src, seeds).startsWith('L-') ? 'text-slate-400 italic' : 'text-white'}`}>
                      {resolveLabel(src, seeds)}
                    </span>
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
              <div key={game.gameNumber} className="rounded-lg border border-slate-600/80 bg-slate-800/90 text-xs overflow-hidden">
                <div className="px-2 py-0.5 bg-black/20 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-500">B{game.gameNumber}</span>
                  {(() => {
                    const displayLabel = game.label
                    if (!displayLabel) return null
                    if (editingLabel?.gameNumber === game.gameNumber) {
                      return (
                        <input autoFocus value={editingLabel.value}
                          onChange={e => setEditingLabel({ gameNumber: game.gameNumber, value: e.target.value })}
                          onBlur={() => { onLabelChange?.(game.gameNumber, editingLabel.value); setEditingLabel(null) }}
                          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { onLabelChange?.(game.gameNumber, editingLabel.value); setEditingLabel(null) } }}
                          className="text-[10px] bg-transparent border-b border-slate-400 text-slate-200 outline-none w-24 text-right"
                        />
                      )
                    }
                    return (
                      <button onClick={() => setEditingLabel({ gameNumber: game.gameNumber, value: displayLabel })}
                        title="Click to edit label"
                        className="text-[10px] text-amber-400/70 hover:text-amber-400 cursor-text">
                        {displayLabel}
                      </button>
                    )
                  })()}
                </div>
                {[game.t1, game.t2].map((src, i) => (
                  <div key={i} className={`px-2 py-1 flex items-center ${i === 0 ? 'border-b border-slate-700' : ''}`}>
                    <span className={`truncate text-xs font-medium ${resolveLabel(src, seeds).startsWith('W-') || resolveLabel(src, seeds).startsWith('L-') ? 'text-slate-400 italic' : 'text-slate-100'}`}>
                      {resolveLabel(src, seeds)}
                    </span>
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
