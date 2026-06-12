'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
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
  flight?: string
  numberOffset?: number
  seeds: Record<string, string>
  games: BracketGame[]
}

interface Props {
  tournamentId: string
  division: string
  planFormat?: 'single' | 'double' | '2gg'
  planCount?: string
  planConsolation?: string
  planLoserConsolation?: boolean
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

export default function BracketBuilder({ tournamentId, division, planFormat, planCount, planConsolation, planLoserConsolation }: Props) {
  const [loading, setLoading] = useState(true)
  const [bracket, setBracket] = useState<BracketData | null>(null)
  const [tab, setTab] = useState<'seeding' | 'manage' | 'preview'>('seeding')
  const [showAddGame, setShowAddGame] = useState(false)
  const [seeds, setSeeds] = useState<Record<string, string>>({})
  const [standings, setStandings] = useState<{ team: string; w: number; l: number; t: number; gf: number; ga: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [selFormat, setSelFormat] = useState<'single' | 'double' | '2gg'>(planFormat ?? 'single')
  const [selCountInput, setSelCountInput] = useState(planCount ?? '4')
  const [consolationInput, setConsolationInput] = useState(planConsolation ?? '0')
  const [loserConsolation, setLoserConsolation] = useState(planLoserConsolation ?? false)
  const [creating, setCreating] = useState(false)

  // Flighting (Stage 2): a division can hold multiple brackets (Flight A/B)
  const [flights, setFlights] = useState<BracketData[]>([])
  const [activeFlight, setActiveFlight] = useState<string>('A')
  const activeRef = useRef('A')
  useEffect(() => { activeRef.current = activeFlight }, [activeFlight])
  const [showSplit, setShowSplit] = useState(false)
  const [cutoffInput, setCutoffInput] = useState('8')
  const [fmtA, setFmtA] = useState<'single' | 'double' | '2gg'>('single')
  const [fmtB, setFmtB] = useState<'single' | 'double' | '2gg'>('single')
  const [splitting, setSplitting] = useState(false)

  // Add-game form state
  const [addSection, setAddSection] = useState('consolation')
  const [addRound, setAddRound] = useState(1)
  const [addT1, setAddT1] = useState('')
  const [addT2, setAddT2] = useState('')
  const [addLabel, setAddLabel] = useState('')
  const [addingGame, setAddingGame] = useState(false)
  const [removingGame, setRemovingGame] = useState<number | null>(null)

  const apiBase = `/api/tournaments/${tournamentId}/divisions/${division}/bracket`
  const flightApi = `${apiBase}?flight=${activeFlight}`

  const loadBracket = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(apiBase)
      const raw = r.ok ? await r.json() : []
      const list: BracketData[] = Array.isArray(raw) ? raw : (raw && raw.id ? [raw] : [])
      setFlights(list)
      const keep = list.find(f => (f.flight || 'A') === activeRef.current)
      const active = keep || list[0] || null
      setActiveFlight(active ? (active.flight || 'A') : 'A')
      setBracket(active)
      setSeeds(active?.seeds || {})
    } catch { setFlights([]); setBracket(null) } finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => { loadBracket() }, [loadBracket])

  const loadStandings = useCallback(async () => {
    try {
      const pg = await fetch(`/api/tournaments/${tournamentId}/divisions/${division}/pool-games`).then(r => r.ok ? r.json() : [])
      const stats: Record<string, { w: number; l: number; t: number; gf: number; ga: number }> = {}
      const add = (team: string) => { if (team && !stats[team]) stats[team] = { w: 0, l: 0, t: 0, gf: 0, ga: 0 } }
      for (const g of (Array.isArray(pg) ? pg : [])) {
        add(g.team1); add(g.team2)
        if (g.score1 == null || g.score2 == null || g.score1 === '' || g.score2 === '') continue
        const s1 = Number(g.score1), s2 = Number(g.score2)
        if (stats[g.team1]) { stats[g.team1].gf += s1; stats[g.team1].ga += s2; if (s1 > s2) stats[g.team1].w++; else if (s1 < s2) stats[g.team1].l++; else stats[g.team1].t++ }
        if (stats[g.team2]) { stats[g.team2].gf += s2; stats[g.team2].ga += s1; if (s2 > s1) stats[g.team2].w++; else if (s2 < s1) stats[g.team2].l++; else stats[g.team2].t++ }
      }
      const rows = Object.entries(stats).map(([team, st]) => ({ team, ...st })).sort((a, b) => b.w - a.w || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)
      setStandings(rows)
    } catch { setStandings([]) }
  }, [tournamentId, division])

  useEffect(() => { loadStandings() }, [loadStandings])

  async function handleCreate() {
    setCreating(true); setError(null)
    try {
      const r = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: selFormat, teamCount: Math.max(2, parseInt(selCountInput) || 2), consolationCount: Math.max(0, parseInt(consolationInput) || 0), loserConsolation, seeds: {} }),
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
      const r = await fetch(flightApi, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seeds }),
      })
      if (!r.ok) throw new Error('Failed to save')
      const d = await r.json()
      setBracket(prev => prev ? { ...prev, seeds: d.seeds || {} } : prev)
      setSeeds(d.seeds || {})
      setFlights(prev => prev.map(f => f.id === bracket.id ? { ...f, seeds: d.seeds || {} } : f))
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
      const r = await fetch(flightApi, {
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
      setFlights(prev => prev.map(f => f.id === updated.id ? updated : f))
      setAddT1(''); setAddT2(''); setAddLabel('')
    } catch (e: any) {
      setError(e.message)
    } finally {
      setAddingGame(false)
    }
  }

  async function handleRenameSeed(seedNum: number, value: string) {
    const next = { ...seeds, [String(seedNum)]: value }
    setSeeds(next)
    if (!bracket) return
    try {
      const r = await fetch(flightApi, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seeds: next }) })
      if (r.ok) { const d = await r.json(); setBracket(prev => prev ? { ...prev, seeds: d.seeds || {} } : prev); setSeeds(d.seeds || {}); setFlights(prev => prev.map(f => f.id === bracket.id ? { ...f, seeds: d.seeds || {} } : f)) }
    } catch { /* ignore */ }
  }

  async function handleRemoveGame(gameNumber: number) {
    if (!confirm(`Remove game B${gameNumber} from the bracket?`)) return
    setRemovingGame(gameNumber)
    try {
      const r = await fetch(flightApi, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeGame: gameNumber }),
      })
      if (!r.ok) throw new Error('Failed to remove game')
      const updated = await r.json()
      setBracket(updated)
      setSeeds(updated.seeds || {})
      setFlights(prev => prev.map(f => f.id === updated.id ? updated : f))
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRemovingGame(null)
    }
  }

  async function handleLabelChange(gameNumber: number, label: string) {
    try {
      await fetch(flightApi, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updateLabel: { gameNumber, label } }),
      })
      setBracket(prev => prev ? { ...prev, games: prev.games.map(g => g.gameNumber === gameNumber ? { ...g, label } : g) } : prev)
      setFlights(prev => prev.map(f => (f.flight || 'A') === activeRef.current ? { ...f, games: f.games.map(g => g.gameNumber === gameNumber ? { ...g, label } : g) } : f))
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

  function switchFlight(fl: string) {
    const target = flights.find(x => (x.flight || 'A') === fl)
    if (!target) return
    setActiveFlight(fl)
    setBracket(target)
    setSeeds(target.seeds || {})
  }

  async function handleSplit() {
    setSplitting(true); setError(null)
    try {
      const total = standings.length || (bracket?.teamCount ?? 0)
      if (total < 3) throw new Error('Need at least 3 ranked teams to split into flights.')
      const cut = Math.max(1, Math.min(parseInt(cutoffInput) || 1, total - 1))
      const seedMap: Record<string, string> = {}
      if (standings.length) standings.forEach((r, i) => { seedMap[String(i + 1)] = r.team })
      else Object.assign(seedMap, seeds)
      const r = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ split: {
          cutoff: cut, total,
          flightA: { format: fmtA, consolationCount: 0, loserConsolation: false },
          flightB: { format: fmtB, consolationCount: 0, loserConsolation: false },
          seeds: seedMap,
        } }),
      })
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed to split') }
      setShowSplit(false)
      activeRef.current = 'A'
      await loadBracket()
      setTab('preview')
    } catch (e: any) { setError(e.message) } finally { setSplitting(false) }
  }

  const totalTeams = standings.length || (bracket?.teamCount ?? 0)
  const cutPreview = Math.max(1, Math.min(parseInt(cutoffInput) || 1, Math.max(1, totalTeams - 1)))
  const flightBCount = Math.max(0, totalTeams - cutPreview)
  const splitFormatPickers = ([['Flight A', fmtA, setFmtA], ['Flight B', fmtB, setFmtB]] as [string, string, (v: 'single' | 'double' | '2gg') => void][])
  const splitPanel = (
    <div className="mb-5 rounded-xl border border-teal-500/40 bg-slate-800/80 p-5">
      <p className="text-base font-semibold text-white mb-1">Split into flights</p>
      <p className="text-sm text-slate-300 mb-4">
        Two brackets, each with its own champion. Teams rank by pool standings, then split at the cutoff.
      </p>

      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Cutoff</label>
      <div className="flex items-center gap-3 mb-4">
        <input type="number" min={1} value={cutoffInput} onChange={e => setCutoffInput(e.target.value)}
          className="w-20 bg-slate-900 border border-slate-600 text-white text-base rounded-lg px-3 py-2 text-center focus:outline-none focus:border-teal-500" />
        <span className="text-sm text-slate-300">top seeds go to <span className="font-semibold text-teal-300">Flight A</span> · the rest to <span className="font-semibold text-teal-300">Flight B</span></span>
      </div>

      {totalTeams > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2.5">
            <p className="text-xs font-semibold text-teal-300 uppercase tracking-wider">Flight A</p>
            <p className="text-sm text-white mt-1">{cutPreview} {cutPreview === 1 ? 'team' : 'teams'}</p>
            <p className="text-xs text-slate-400 mt-0.5">seeds 1–{cutPreview}</p>
          </div>
          <div className="rounded-lg bg-slate-900/70 border border-slate-700 px-3 py-2.5">
            <p className="text-xs font-semibold text-teal-300 uppercase tracking-wider">Flight B</p>
            <p className="text-sm text-white mt-1">{flightBCount} {flightBCount === 1 ? 'team' : 'teams'}</p>
            <p className="text-xs text-slate-400 mt-0.5">{flightBCount > 0 ? `seeds ${cutPreview + 1}–${totalTeams}` : '—'}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        {splitFormatPickers.map(([lbl, val, set]) => (
          <div key={lbl}>
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">{lbl} format</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(['single', 'double', '2gg'] as const).map(ff => (
                <button key={ff} onClick={() => set(ff)}
                  className={`py-2 rounded-lg text-xs font-medium border transition-colors ${val === ff ? 'bg-teal-600 border-teal-500 text-white' : 'bg-slate-900 border-slate-600 text-slate-300 hover:text-white hover:border-slate-500'}`}>
                  {ff === 'single' ? 'Single' : ff === 'double' ? 'Double' : '2GG'}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button onClick={handleSplit} disabled={splitting}
        className="w-full py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors">
        {splitting ? 'Splitting…' : (totalTeams > 0 ? `Split into ${cutPreview} + ${flightBCount} flights` : 'Split into flights')}
      </button>
      {standings.length === 0 && (
        <p className="text-xs text-amber-400/90 mt-3">No pool standings yet — finish pool play (or seed manually) so flights split by rank.</p>
      )}
    </div>
  )

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

        <div className="mb-5">
          <button onClick={() => setShowSplit(v => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-teal-300 border border-slate-700 hover:border-teal-500 transition-colors">
            {showSplit ? '← Single bracket' : 'Split into flights (2 champions)'}
          </button>
        </div>
        {showSplit && splitPanel}

        {error && (
          <div className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {!showSplit && (<>
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

        <label className="mb-5 flex items-start gap-3 bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer">
          <input type="checkbox" checked={loserConsolation} onChange={e => setLoserConsolation(e.target.checked)} className="mt-0.5 accent-teal-500" />
          <span className="text-sm">
            <span className="font-semibold text-white">Everyone in the bracket · guarantee a 2nd game</span>
            <span className="block text-slate-400 mt-0.5">For 2 pool-game divisions. All teams play; first-round losers get a loser-fed consolation game (plus auto &ldquo;if needed&rdquo; games), so the bracket fills the 4-game guarantee. Set &ldquo;Teams in bracket&rdquo; to the full team count.</span>
          </span>
        </label>

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
        </>)}
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
          {(['seeding', 'preview'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === t
                  ? 'bg-teal-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {t === 'seeding' ? 'Seeds' : 'Preview'}
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

      {/* Flight switcher / split control */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {flights.length > 1 ? (
          <>
            <span className="text-[11px] text-slate-500 uppercase tracking-wider mr-1">Flights</span>
            {flights.map(f => {
              const fl = f.flight || 'A'
              return (
                <button key={fl} onClick={() => switchFlight(fl)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${activeFlight === fl ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700'}`}>
                  Flight {fl} · {f.teamCount}
                </button>
              )
            })}
          </>
        ) : (
          <button onClick={() => setShowSplit(v => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-teal-300 border border-slate-700 hover:border-teal-500 transition-colors">
            {showSplit ? 'Cancel split' : 'Split into flights (2 champions)'}
          </button>
        )}
      </div>

      {showSplit && flights.length <= 1 && splitPanel}

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
          {standings.length > 0 && (
            <div className="mb-5 rounded-xl border border-slate-700 overflow-hidden bg-slate-800">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-900">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Pool standings</span>
                <button onClick={() => { const next = { ...seeds }; standings.forEach((r, i) => { next[String(i + 1)] = r.team }); setSeeds(next) }}
                  className="text-[11px] text-teal-300 hover:text-teal-200">Seed from standings ↓</button>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-900 text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-1.5 font-semibold">#</th>
                    <th className="text-left px-2 py-1.5 font-semibold">Team</th>
                    <th className="px-2 py-1.5 font-semibold">W-L{standings.some(x => x.t > 0) ? '-T' : ''}</th>
                    <th className="px-2 py-1.5 font-semibold">GF</th>
                    <th className="px-2 py-1.5 font-semibold">GA</th>
                    <th className="px-2 py-1.5 font-semibold">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {standings.map((r, i) => (
                    <tr key={r.team}>
                      <td className="px-3 py-1.5 text-slate-400">{i + 1}</td>
                      <td className="px-2 py-1.5 font-medium text-white">{r.team}</td>
                      <td className="px-2 py-1.5 text-center text-slate-200">{r.w}-{r.l}{standings.some(x => x.t > 0) ? `-${r.t}` : ''}</td>
                      <td className="px-2 py-1.5 text-center text-slate-200">{r.gf}</td>
                      <td className="px-2 py-1.5 text-center text-slate-200">{r.ga}</td>
                      <td className={`px-2 py-1.5 text-center font-medium ${r.gf - r.ga > 0 ? 'text-emerald-400' : r.gf - r.ga < 0 ? 'text-red-400' : 'text-slate-400'}`}>{r.gf - r.ga > 0 ? '+' : ''}{r.gf - r.ga}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
            {Array.from({ length: Math.max(bracket.teamCount, ...bracket.games.flatMap(g => [g.team1Source, g.team2Source]).filter(x => !!x && x.startsWith('seed:')).map(x => parseInt(x.split(':')[1]) || 0)) }, (_, i) => i + 1).map(n => (
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

      {/* ── Add/remove games panel (toggled from Preview via '+ Add game') ── */}
      {tab === 'preview' && showAddGame && (
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
                            <span className="text-xs font-mono text-slate-500 w-8 shrink-0">B{(bracket.numberOffset || 0) + g.gameNumber}</span>
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
          numberOffset={bracket.numberOffset || 0}
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
          onRemoveGame={handleRemoveGame}
          onRenameSeed={handleRenameSeed}
          onAddGame={() => setShowAddGame(v => !v)}
        />
      )}
    </div>
  )
}

// ── Visual Bracket Preview ─────────────────────────────────────────────────

function resolveLabel(src: string, seeds: Record<string, string>, offset = 0): string {
  if (!src) return 'TBD'
  const [type, n] = src.split(':')
  if (type === 'seed') return seeds[n] || `Seed ${n}`
  if (type === 'winner') return `W-B${offset + Number(n)}`
  if (type === 'loser') return `L-B${offset + Number(n)}`
  return src
}

function BracketPreview({ template, seeds, division, numberOffset = 0, onLabelChange, onRemoveGame, onRenameSeed, onAddGame }: {
  template: GameTemplate[]
  seeds: Record<string, string>
  division?: string
  numberOffset?: number
  onLabelChange?: (gameNumber: number, label: string) => void
  onRemoveGame?: (gameNumber: number) => void
  onRenameSeed?: (seedNum: number, value: string) => void
  onAddGame?: () => void
}) {
  const [editingLabel, setEditingLabel] = useState<{ gameNumber: number; value: string } | null>(null)
  const [editingSeat, setEditingSeat] = useState<{ gameNumber: number; slot: number; value: string } | null>(null)

  function renderSlot(gameNumber: number, src: string, slot: number) {
    const label = resolveLabel(src, seeds, numberOffset)
    const computed = label.startsWith('W-') || label.startsWith('L-')
    if (src.startsWith('seed:') && onRenameSeed) {
      const seedNum = parseInt(src.split(':')[1])
      if (editingSeat && editingSeat.gameNumber === gameNumber && editingSeat.slot === slot) {
        return (
          <input autoFocus value={editingSeat.value} placeholder={`Seed ${seedNum}`}
            onChange={e => setEditingSeat({ gameNumber, slot, value: e.target.value })}
            onBlur={() => { onRenameSeed(seedNum, editingSeat.value); setEditingSeat(null) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { onRenameSeed(seedNum, editingSeat.value); setEditingSeat(null) } }}
            className="bg-transparent border-b border-teal-400 text-white text-xs outline-none w-full" />
        )
      }
      return (
        <button onClick={() => setEditingSeat({ gameNumber, slot, value: seeds[String(seedNum)] ?? '' })}
          title="Click to rename" className="truncate text-xs font-medium text-left w-full text-white hover:text-teal-300 cursor-text">{label}</button>
      )
    }
    return <span className={`truncate text-xs font-medium ${computed ? 'text-slate-400 italic' : 'text-white'}`}>{label}</span>
  }

  const mainGames = template.filter(g => g.section === 'winners' || g.section === 'championship')
  const sideGames = template.filter(g => g.section === 'consolation' || g.section === 'losers')
  const mainRounds = [...new Set(mainGames.map(g => g.round))].sort((a, b) => a - b)
  const maxRound = mainRounds.length > 0 ? Math.max(...mainRounds) : 1

  function colLeft(r: number) { return (r - 1) * (GAME_W + CONN_W) }

  // ── Feeder-graph layout ──────────────────────────────────────────────
  // Position each game from the games that feed it rather than a fixed
  // per-round formula. A game fed by a single round-N game (because its other
  // slot is a BYE) sits in line with that feeder, so the connector is straight
  // and the winner's next game is directly to the right. A game fed by two
  // games centers between them.
  const mainByNum: Record<number, GameTemplate> = {}
  mainGames.forEach(g => { mainByNum[g.gameNumber] = g })
  const feederOf = (g: GameTemplate): (number | null)[] =>
    [g.t1, g.t2].map(src => {
      const [type, n] = (src || '').split(':')
      const num = parseInt(n)
      return (type === 'winner' || type === 'loser') && mainByNum[num] ? num : null
    })
  const referenced = new Set<number>()
  mainGames.forEach(g => feederOf(g).forEach(fn => { if (fn) referenced.add(fn) }))
  const roots = mainGames
    .filter(g => !referenced.has(g.gameNumber))
    .sort((a, b) => b.round - a.round || a.gameNumber - b.gameNumber)
  const yByNum: Record<number, number> = {}
  let leafSlot = 0
  const placeY = (num: number): number => {
    if (yByNum[num] !== undefined) return yByNum[num]
    const g = mainByNum[num]
    if (!g) return 0
    const [f1, f2] = feederOf(g)
    const childYs: number[] = []
    if (f1) childYs.push(placeY(f1))
    if (f2) childYs.push(placeY(f2))
    const y = childYs.length > 0
      ? childYs.reduce((a, b) => a + b, 0) / childYs.length
      : (leafSlot++ * UNIT)
    yByNum[num] = y
    return y
  }
  roots.forEach(r => placeY(r.gameNumber))
  mainGames.forEach(g => { if (yByNum[g.gameNumber] === undefined) yByNum[g.gameNumber] = leafSlot++ * UNIT })

  const positions: Record<number, { x: number; y: number; cy: number }> = {}
  mainGames.forEach(g => {
    const y = yByNum[g.gameNumber]
    positions[g.gameNumber] = { x: colLeft(g.round), y, cy: y + GAME_H / 2 }
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
        // Single feeder (other slot is a bye) — the next game is aligned, so draw a straight line.
        connectors.push(
          <path key={`sf-${game.gameNumber}`} d={`M${f.x+GAME_W},${f.cy} H${pos.x}`} fill="none" stroke="#475569" strokeWidth="1.5"/>
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
      {(onAddGame || onRenameSeed) && (
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-slate-500">Click a team to rename · × removes a game</span>
          {onAddGame && <button onClick={onAddGame} className="text-[11px] text-slate-400 hover:text-teal-300">+ Add game</button>}
        </div>
      )}
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
                  <span className="text-[10px] font-mono text-teal-300">B{numberOffset + game.gameNumber}</span>
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
                  {onRemoveGame && <button onClick={() => onRemoveGame(game.gameNumber)} title="Remove game" className="text-[12px] leading-none text-slate-500 hover:text-red-400 ml-1">×</button>}
                </div>
                {[game.t1, game.t2].map((src, i) => (
                  <div key={i} className={`flex-1 flex items-center px-2.5 ${i === 0 ? 'border-b border-slate-700/80' : ''}`}>
                    {renderSlot(game.gameNumber, src, i)}
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
                  <span className="text-[10px] font-mono text-teal-300">B{numberOffset + game.gameNumber}</span>
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
                  {onRemoveGame && <button onClick={() => onRemoveGame(game.gameNumber)} title="Remove game" className="text-[12px] leading-none text-slate-500 hover:text-red-400 ml-1">×</button>}
                </div>
                {[game.t1, game.t2].map((src, i) => (
                  <div key={i} className={`px-2 py-1 flex items-center ${i === 0 ? 'border-b border-slate-700' : ''}`}>
                    {renderSlot(game.gameNumber, src, i)}
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
