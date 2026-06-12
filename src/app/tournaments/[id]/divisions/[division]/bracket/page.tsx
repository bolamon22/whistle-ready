'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { resolveTeam } from '@/lib/bracketTemplates'

interface BracketGame {
  id: string; gameNumber: number; round: number; section: string
  team1Source: string; team2Source: string; label: string
  team1: string; team2: string
  score1: number | null; score2: number | null
  winner: string; loser: string
  field: string; startTime: string; gameDate: string
}

interface Bracket {
  id: string; format: string; teamCount: number
  flight?: string; numberOffset?: number
  seeds: Record<string, string>; games: BracketGame[]
}

function GameCard({ game, seeds, allGames, onClick, isChamp }: {
  game: BracketGame; seeds: Record<string, string>
  allGames: BracketGame[]; onClick: () => void; isChamp?: boolean
}) {
  const t1 = game.team1 || resolveTeam(game.team1Source, seeds, allGames)
  const t2 = game.team2 || resolveTeam(game.team2Source, seeds, allGames)
  const hasScore = game.score1 !== null && game.score2 !== null
  const isDone = !!game.winner
  return (
    <button onClick={onClick}
      className={`w-48 text-left rounded-lg border transition-all hover:shadow-md ${
        isChamp ? 'border-amber-400 bg-amber-50 shadow-sm'
        : isDone ? 'border-green-300 bg-green-50'
        : 'border-slate-200 bg-white hover:border-slate-300'}`}>
      {game.label && (
        <div className={`px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded-t-lg ${
          isChamp ? 'bg-amber-400 text-white' : 'bg-slate-600 text-white'}`}>
          {game.label}
        </div>
      )}
      <div className="px-2 py-1.5">
        <div className={`flex items-center justify-between text-sm py-0.5 border-b border-slate-100 ${
          isDone && game.winner === t1 ? 'font-bold text-green-700' : 'text-slate-700'}`}>
          <span className="truncate max-w-[120px]">{t1 || <span className="text-slate-300 italic text-xs">TBD</span>}</span>
          {hasScore && <span className={`ml-1 font-mono text-xs w-5 text-right ${game.winner === t1 ? 'text-green-700 font-bold' : 'text-slate-500'}`}>{game.score1}</span>}
        </div>
        <div className={`flex items-center justify-between text-sm py-0.5 ${
          isDone && game.winner === t2 ? 'font-bold text-green-700' : 'text-slate-700'}`}>
          <span className="truncate max-w-[120px]">{t2 || <span className="text-slate-300 italic text-xs">TBD</span>}</span>
          {hasScore && <span className={`ml-1 font-mono text-xs w-5 text-right ${game.winner === t2 ? 'text-green-700 font-bold' : 'text-slate-500'}`}>{game.score2}</span>}
        </div>
        {(game.field || game.startTime || game.gameDate) ? (
          <div className="mt-1 text-xs text-slate-400 truncate">{[game.gameDate, game.startTime, game.field].filter(Boolean).join(' · ')}</div>
        ) : (
          <div className="mt-1 text-xs text-slate-300">G{game.gameNumber} · click to edit</div>
        )}
      </div>
    </button>
  )
}

function BracketSection({ games, seeds, allGames, onGameClick, sectionLabel }: {
  games: BracketGame[]; seeds: Record<string, string>; allGames: BracketGame[]
  onGameClick: (g: BracketGame) => void; sectionLabel?: string
}) {
  if (games.length === 0) return null
  const rounds = [...new Set(games.map(g => g.round))].sort((a, b) => a - b)
  const minRound = rounds[0]
  const BASE_SLOT = 100

  function rlabel(r: number) {
    const rfe = rounds.length - (r - minRound)
    if (rfe === 1) return 'Final'
    if (rfe === 2) return 'Semis'
    if (rfe === 3) return 'Quarters'
    return `Round ${r - minRound + 1}`
  }

  return (
    <div>
      {sectionLabel && <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 mt-4">{sectionLabel}</p>}
      <div className="flex items-start gap-10 overflow-x-auto pb-2">
        {rounds.map(round => {
          const roundGames = games.filter(g => g.round === round)
          const slotH = BASE_SLOT * Math.pow(2, round - minRound)
          return (
            <div key={round} className="flex flex-col flex-shrink-0">
              <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">{rlabel(round)}</p>
              {roundGames.map(g => (
                <div key={g.id} className="flex items-center" style={{ height: slotH }}>
                  <GameCard game={g} seeds={seeds} allGames={allGames} onClick={() => onGameClick(g)} isChamp={g.section === 'championship'} />
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GameModal({ game, seeds, allGames, divisionParam, tournamentId, onClose, onSaved }: {
  game: BracketGame; seeds: Record<string, string>; allGames: BracketGame[]
  divisionParam: string; tournamentId: string
  onClose: () => void; onSaved: (u: BracketGame) => void
}) {
  const t1 = game.team1 || resolveTeam(game.team1Source, seeds, allGames)
  const t2 = game.team2 || resolveTeam(game.team2Source, seeds, allGames)
  const [score1, setScore1] = useState(game.score1 !== null ? String(game.score1) : '')
  const [score2, setScore2] = useState(game.score2 !== null ? String(game.score2) : '')
  const [field,  setField]  = useState(game.field || '')
  const [date,   setDate]   = useState(game.gameDate || '')
  const [time,   setTime]   = useState(game.startTime || '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/tournaments/${tournamentId}/divisions/${divisionParam}/bracket/games/${game.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score1: score1 !== '' ? Number(score1) : null, score2: score2 !== '' ? Number(score2) : null, field, startTime: time, gameDate: date, team1: t1, team2: t2 }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Save failed'); setSaving(false); return }
    toast.success(data.winner ? `Winner: ${data.winner}` : 'Saved')
    onSaved(data); onClose()
  }

  async function clearScore() {
    setSaving(true)
    const res = await fetch(`/api/tournaments/${tournamentId}/divisions/${divisionParam}/bracket/games/${game.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clearScore: true }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error('Clear failed'); setSaving(false); return }
    toast.success('Score cleared'); onSaved(data); onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <div><h2 className="font-bold text-slate-800">Game {game.gameNumber}</h2>{game.label && <p className="text-xs text-slate-500">{game.label}</p>}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl w-7 h-7 flex items-center justify-center">x</button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</p>
            <div className="flex items-center gap-3">
              <label className="flex-1"><span className="text-xs text-slate-500 block mb-1 truncate">{t1 || 'Team 1'}</span>
                <input type="number" min="0" value={score1} onChange={e => setScore1(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" placeholder="--" /></label>
              <span className="text-slate-300 mt-4 font-bold">vs</span>
              <label className="flex-1"><span className="text-xs text-slate-500 block mb-1 truncate">{t2 || 'Team 2'}</span>
                <input type="number" min="0" value={score2} onChange={e => setScore2(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" placeholder="--" /></label>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Schedule</p>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="text-xs text-slate-500 block mb-1">Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" /></label>
              <label><span className="text-xs text-slate-500 block mb-1">Time</span><input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" /></label>
            </div>
            <label><span className="text-xs text-slate-500 block mb-1">Field</span>
              <input type="text" value={field} onChange={e => setField(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" placeholder="e.g. Field 3" /></label>
          </div>
          {game.winner && <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">Winner: <strong>{game.winner}</strong></div>}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          {game.winner && <button onClick={clearScore} disabled={saving} className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg">Clear</button>}
          <button onClick={onClose} className="flex-1 text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 text-sm font-semibold bg-sdy-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function SeedPanel({ teamCount, seeds, divisionParam, tournamentId, onClose, onSaved }: {
  teamCount: number; seeds: Record<string, string>
  divisionParam: string; tournamentId: string
  onClose: () => void; onSaved: (s: Record<string, string>) => void
}) {
  const [local, setLocal] = useState<Record<string, string>>(seeds)
  const [saving, setSaving] = useState(false)
  const [loadingPools, setLoadingPools] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/tournaments/${tournamentId}/divisions/${divisionParam}/bracket`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seeds: local }),
    })
    if (!res.ok) { toast.error('Failed to save seeds'); setSaving(false); return }
    toast.success('Seeds saved'); onSaved(local); onClose()
  }

  async function loadFromPools() {
    setLoadingPools(true)
    try {
      const [poolsRes, gamesRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}/divisions/${divisionParam}/pools`),
        fetch(`/api/tournaments/${tournamentId}/divisions/${divisionParam}/pool-games`),
      ])
      if (!poolsRes.ok) throw new Error('Could not load pools')
      const pools: Array<{ name: string; teamNames: string[] }> = await poolsRes.json()
      const poolGames: Array<{ team1: string; team2: string; score1: number | null; score2: number | null }> =
        gamesRes.ok ? await gamesRes.json() : []

      // Compute per-team stats from completed games
      const stats: Record<string, { W: number; L: number; T: number; GF: number; GA: number }> = {}
      for (const pool of pools) {
        for (const t of (pool.teamNames || [])) stats[t] = { W: 0, L: 0, T: 0, GF: 0, GA: 0 }
      }
      for (const g of poolGames) {
        if (g.score1 === null || g.score2 === null) continue
        const [t1, t2] = [g.team1, g.team2]
        if (!stats[t1]) stats[t1] = { W: 0, L: 0, T: 0, GF: 0, GA: 0 }
        if (!stats[t2]) stats[t2] = { W: 0, L: 0, T: 0, GF: 0, GA: 0 }
        stats[t1].GF += g.score1; stats[t1].GA += g.score2
        stats[t2].GF += g.score2; stats[t2].GA += g.score1
        if (g.score1 > g.score2)      { stats[t1].W++; stats[t2].L++ }
        else if (g.score2 > g.score1) { stats[t2].W++; stats[t1].L++ }
        else                          { stats[t1].T++; stats[t2].T++ }
      }

      const pts   = (t: string) => (stats[t]?.W ?? 0) * 3 + (stats[t]?.T ?? 0)
      const gdiff = (t: string) => (stats[t]?.GF ?? 0) - (stats[t]?.GA ?? 0)
      const gfor  = (t: string) =>  stats[t]?.GF ?? 0

      // Rank teams within each pool by pts -> GD -> GF
      const rankedPools = [...pools]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => ({
          name: p.name,
          teams: [...(p.teamNames || [])].sort((a, b) => {
            const dp = pts(b) - pts(a);    if (dp !== 0) return dp
            const dd = gdiff(b) - gdiff(a); if (dd !== 0) return dd
            return gfor(b) - gfor(a)
          }),
        }))

      // Interleave seeds: 1st from each pool, then 2nd from each pool, etc.
      const maxFinish = Math.max(0, ...rankedPools.map(p => p.teams.length))
      const seeded: string[] = []
      for (let rank = 0; rank < maxFinish && seeded.length < teamCount; rank++) {
        for (const pool of rankedPools) {
          if (rank < pool.teams.length && seeded.length < teamCount) seeded.push(pool.teams[rank])
        }
      }

      const newSeeds: Record<string, string> = {}
      seeded.forEach((t, i) => { newSeeds[String(i + 1)] = t })
      setLocal(newSeeds)
      const hasScores = poolGames.some(g => g.score1 !== null && g.score2 !== null)
      toast.success(`${seeded.length} teams seeded by ${hasScores ? 'standings' : 'pool order'}`)
    } catch { toast.error('Could not load standings') }
    setLoadingPools(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Assign Seeds</h2>
          <div className="flex gap-2">
            <button onClick={loadFromPools} disabled={loadingPools} className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg font-medium">{loadingPools ? 'Loading...' : 'Load from Pools'}</button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl w-7 h-7 flex items-center justify-center">x</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
          {Array.from({ length: teamCount }, (_, i) => i + 1).map(seed => (
            <div key={seed} className="flex items-center gap-3">
              <span className="w-8 text-right text-xs font-bold text-slate-400">#{seed}</span>
              <input type="text" value={local[String(seed)] || ''} onChQnge={e => setLocal(prev => ({ ...prev, [String(seed)]: e.target.value }))}
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-400" placeholder={`Seed ${seed} team name`} />
            </div>
          ))}
        </div>
        <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 px-4 py-2 rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving} className="flex-1 text-sm font-semibold bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Save Seeds'}</button>
        </div>
      </div>
    </div>
  )
}

export default function BracketPage() {
  const { id, division } = useParams<{ id: string; division: string }>()
  const router = useRouter()
  const divName = decodeURIComponent(division)
  const [bracket, setBracket] = useState<Bracket | null>(null)
  const [flights, setFlights] = useState<Bracket[]>([])
  const [activeFlight, setActiveFlight] = useState<string>('A')
  const activeFlightRef = useRef('A')
  useEffect(() => { activeFlightRef.current = activeFlight }, [activeFlight])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [selectedGame, setSelectedGame] = useState<BracketGame | null>(null)
  const [showSeeds, setShowSeeds] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [setupFormat, setSetupFormat] = useState<'single' | 'double'>('single')
  const [setupCount, setSetupCount] = useState(8)
  const [view, setView] = useState<'bracket' | 'games'>('bracket')
  const [wizardStep, setWizardStep] = useState<1|2|3>(1)
  const [wizardPools, setWizardPools] = useState<{name:string;teamNames:string[]}[]>([])
  const [wizardPoolsLoading, setWizardPoolsLoading] = useState(false)
  const [setupTeamsPerPool, setSetupTeamsPerPool] = useState(2)
  const [setupSeedMethod, setSetupSeedMethod] = useState<'cross-pool'|'by-record'|'manual'>('cross-pool')

  function validBracketSize(n: number): number {
    if (n <= 4) return 4
    if (n <= 8) return 8
    return 16
  }

  async function loadPoolsForWizard() {
    setWizardPoolsLoading(true)
    try {
      const r = await fetch(`/api/tournaments/${id}/divisions/${division}/pools`)
      if (r.ok) {
        const data = await r.json()
        setWizardPools(Array.isArray(data) ? data : [])
      }
    } catch {}
    setWizardPoolsLoading(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/tournaments/${id}/divisions/${division}/bracket`)
    if (res.ok) {
      const data = await res.json()
      const list: Bracket[] = Array.isArray(data) ? data : (data && data.id ? [data] : [])
      setFlights(list)
      const keep = list.find(f => (f.flight || 'A') === activeFlightRef.current)
      const active = keep || list[0] || null
      setActiveFlight(active ? (active.flight || 'A') : 'A')
      setBracket(active)
    }
    setLoading(false)
  }, [id, division])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (!bracket && !loading) loadPoolsForWizard() }, [bracket, loading])

  async function createBracket() {
    setCreating(true)
    let seeds: Record<string,string> = {}
    const targetCount = wizardPools.length > 0 ? validBracketSize(wizardPools.length * setupTeamsPerPool) : setupCount
    if (setupSeedMethod !== 'manual' && wizardPools.length > 0) {
      try {
        const gamesRes = await fetch(`/api/tournaments/${id}/divisions/${division}/pool-games`)
        const poolGames: any[] = gamesRes.ok ? await gamesRes.json() : []
        const stats: Record<string,{W:number;L:number;T:number;GF:number;GA:number}> = {}
        for (const pool of wizardPools) {
          for (const t of (pool.teamNames || [])) stats[t] = {W:0,L:0,T:0,GF:0,GA:0}
        }
        for (const g of poolGames) {
          if (g.score1 == null || g.score2 == null) continue
          const s1 = Number(g.score1), s2 = Number(g.score2)
          if (stats[g.team1]) { if(s1>s2)stats[g.team1].W++;else if(s1<s2)stats[g.team1].L++;else stats[g.team1].T++;stats[g.team1].GF+=s1;stats[g.team1].GA+=s2 }
          if (stats[g.team2]) { if(s2>s1)stats[g.team2].W++;else if(s2<s1)stats[g.team2].L++;else stats[g.team2].T++;stats[g.team2].GF+=s2;stats[g.team2].GA+=s1 }
        }
        const sortTeam = (a:string,b:string) => {
          const sa=stats[a]||{W:0,L:0,T:0,GF:0,GA:0}, sb=stats[b]||{W:0,L:0,T:0,GF:0,GA:0}
          if(sb.W!==sa.W)return sb.W-sa.W
          if((sb.GF-sb.GA)!==(sa.GF-sa.GA))return(sb.GF-sb.GA)-(sa.GF-sa.GA)
          return sb.GF-sa.GF
        }
        if (setupSeedMethod === 'cross-pool') {
          const ranked: Record<string,string[]> = {}
          for (const pool of wizardPools) ranked[pool.name] = (pool.teamNames||[]).slice().sort(sortTeam)
          let seedNum = 1
          for (let place = 0; place < setupTeamsPerPool; place++) {
            for (const pool of wizardPools) {
              const team = ranked[pool.name][place]
              if (team && seedNum <= targetCount) seeds[String(seedNum++)] = team
            }
          }
        } else {
          const all = Object.keys(stats).sort(sortTeam).slice(0, targetCount)
          all.forEach((t,i) => { seeds[String(i+1)] = t })
        }
      } catch {}
    }
    const res = await fetch(`/api/tournaments/${id}/divisions/${division}/bracket`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: setupFormat, teamCount: targetCount, seeds }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error || 'Failed'); setCreating(false); return }
    setBracket(data); setFlights([data]); setActiveFlight('A'); setCreating(false)
    if (setupSeedMethod === 'manual') setShowSeeds(true)
    toast.success('Bracket created')
  }

  async function resetBracket() {
    setResetting(true)
    const res = await fetch(`/api/tournaments/${id}/divisions/${division}/bracket`, { method: 'DELETE' })
    if (res.ok) { setBracket(null); setFlights([]); toast.success('Bracket reset') } else { toast.error('Failed') }
    setResetting(false); setShowReset(false)
  }

  function handleGameSaved(updated: BracketGame) {
    setBracket(prev => prev ? { ...prev, games: prev.games.map(g => g.id === updated.id ? updated : g) } : prev)
  }

  function fmtSrc(src: string) {
    if (!src) return '—'
    if (src.startsWith('seed:')) return 'Seed ' + src.slice(5)
    if (src.startsWith('winner:')) return 'W-B' + src.slice(7)
    if (src.startsWith('loser:')) return 'L-B' + src.slice(6)
    return src
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <p className="text-slate-400 animate-pulse">Loading bracket...</p>
    </div>
  )

  const totalAdvancing = wizardPools.length > 0 ? wizardPools.length * setupTeamsPerPool : setupCount
  const bracketSize = wizardPools.length > 0 ? validBracketSize(totalAdvancing) : setupCount

  if (!bracket) return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-2">
        <button onClick={() => router.push(`/tournaments/${id}/divisions`)} className="text-sm text-slate-500 hover:text-slate-700">← Divisions</button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-500 text-sm">{divName}</span>
        <span className="text-slate-300">/</span>
        <span className="font-semibold text-slate-700 text-sm">Bracket</span>
      </div>
      <div className="max-w-lg mx-auto px-6 py-10">
        <div className="flex items-center justify-center gap-2 mb-8">
          {([1,2,3] as const).map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                s < wizardStep ? 'bg-sky-600 text-white' : s === wizardStep ? 'bg-sky-600 text-white ring-4 ring-sky-100' : 'bg-slate-200 text-slate-400'}`}>
                {s < wizardStep ? '✓' : s}
              </div>
              {s < 3 && <div className={`w-8 h-0.5 ${s < wizardStep ? 'bg-sky-600' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {wizardStep === 1 && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">How many teams advance?</h2>
              <p className="text-sm text-slate-500 mb-6">{divName}</p>
              {wizardPoolsLoading ? (
                <p className="text-sm text-slate-400 animate-pulse">Loading pools...</p>
              ) : wizardPools.length > 0 ? (
                <div>
                  <p className="text-xs text-slate-500 mb-3 bg-slate-50 rounded-lg px-3 py-2">
                    {wizardPools.length} pool{wizardPools.length !== 1 ? 's' : ''} detected
                  </p>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Teams advancing per pool</p>
                  <div className="flex gap-2 mb-4">
                    {[1,2,3,4].map(n => (
                      <button key={n} onClick={() => setSetupTeamsPerPool(n)}
                        className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${setupTeamsPerPool === n ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-center text-slate-400">
                    {wizardPools.length} pools x {setupTeamsPerPool} = {totalAdvancing} teams &rarr; {bracketSize}-team bracket
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-3">Teams in bracket</p>
                  <div className="flex gap-2">
                    {[4,8,16].map(n => (
                      <button key={n} onClick={() => setSetupCount(n)}
                        className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-bold transition-all ${setupCount === n ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => setWizardStep(2)}
                className="w-full mt-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors text-sm">
                Next: Choose Format
              </button>
            </div>
          )}
          {wizardStep === 2 && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">Elimination format</h2>
              <p className="text-sm text-slate-500 mb-6">{bracketSize}-team bracket</p>
              <div className="space-y-3 mb-6">
                <button onClick={() => setSetupFormat('single')}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${setupFormat === 'single' ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">Single Elimination</p>
                      <p className="text-xs text-slate-500 mt-0.5">One loss and you are out</p>
                    </div>
                    <span className="text-xs text-slate-400 ml-3">{bracketSize - 1} games</span>
                  </div>
                </button>
                {bracketSize <= 8 && (
                  <button onClick={() => setSetupFormat('double')}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${setupFormat === 'double' ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">Double Elimination</p>
                        <p className="text-xs text-slate-500 mt-0.5">Two losses to eliminate</p>
                      </div>
                      <span className="text-xs text-slate-400 ml-3">{bracketSize === 4 ? 6 : 13} games</span>
                    </div>
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setWizardStep(1)}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-sm">
                  Back
                </button>
                <button onClick={() => setWizardStep(3)}
                  className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors text-sm">
                  Next: Seeding
                </button>
              </div>
            </div>
          )}
          {wizardStep === 3 && (
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-1">Seeding method</h2>
              <p className="text-sm text-slate-500 mb-6">{bracketSize}-team {setupFormat} elimination</p>
              <div className="space-y-3 mb-6">
                {wizardPools.length > 0 && (
                  <button onClick={() => setSetupSeedMethod('cross-pool')}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${setupSeedMethod === 'cross-pool' ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-800">Cross-pool seeding</p>
                        <p className="text-xs text-slate-500 mt-0.5">1st from each pool, then 2nd from each pool, etc.</p>
                      </div>
                      <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full ml-2 flex-shrink-0">Recommended</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Balanced bracket across pools</p>
                  </button>
                )}
                {wizardPools.length > 0 && (
                  <button onClick={() => setSetupSeedMethod('by-record')}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${setupSeedMethod === 'by-record' ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div>
                      <p className="font-semibold text-slate-800">By overall record</p>
                      <p className="text-xs text-slate-500 mt-0.5">Best win % across all pools gets top seed</p>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">Win % then goal differential then goals scored</p>
                  </button>
                )}
                <button onClick={() => setSetupSeedMethod('manual')}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${setupSeedMethod === 'manual' ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div>
                    <p className="font-semibold text-slate-800">Manual</p>
                    <p className="text-xs text-slate-500 mt-0.5">Assign seeds yourself after creating the bracket</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Seed entry panel opens after creation</p>
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setWizardStep(2)}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-sm">
                  Back
                </button>
                <button onClick={createBracket} disabled={creating}
                  className="flex-1 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50 text-sm">
                  {creating ? 'Creating...' : 'Create Bracket'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
  const winnerGames = bracket.games.filter(g => g.section === 'winners')
  const loserGames  = bracket.games.filter(g => g.section === 'losers')
  const champGames  = bracket.games.filter(g => g.section === 'championship')
  const champion    = champGames[0]?.winner || null
  const seededCount = Object.values(bracket.seeds).filter(Boolean).length

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => router.push(`/tournaments/${id}/divisions`)} className="text-sm text-slate-500 hover:text-slate-700">Divisions</button>
        <span className="text-slate-300">/</span><span className="text-slate-600 font-medium">{divName}</span>
        <span className="text-slate-300">/</span><span className="font-semibold text-slate-800">Bracket</span>
        {flights.length > 1 && (
          <div className="ml-2 flex bg-slate-100 rounded-lg p-0.5">
            {flights.map(f => {
              const fl = f.flight || 'A'
              return (
                <button key={fl} onClick={() => { setActiveFlight(fl); setBracket(f) }}
                  className={`px-2.5 py-1 text-sm rounded-md font-medium transition-colors ${activeFlight === fl ? 'bg-white shadow text-teal-700' : 'text-slate-500 hover:text-slate-700'}`}>
                  Flight {fl}
                </button>
              )
            })}
          </div>
        )}
        <div className="ml-4 flex bg-slate-100 rounded-lg p-0.5">
          <button onClick={() => setView('bracket')}
            className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${view === 'bracket' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            Bracket
          </button>
          <button onClick={() => setView('games')}
            className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${view === 'games' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}>
            Games ({bracket.games.length})
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-1 rounded-full capitalize">{bracket.format} elim · {bracket.teamCount} teams</span>
          <button onClick={() => setShowSeeds(true)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors font-medium ${seededCount < bracket.teamCount ? 'border-amber-400 bg-amber-90 text-amber-700 hover:bg-amber-100' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            Seeds ({seededCount}/{bracket.teamCount})
          </button>
          <button onClick={() => setShowReset(true)} className="text-sm px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">Reset</button>
        </div>
      </div>

      {caampion && <div className="bg-amber-400 text-white text-center py-2 font-bold tracking-wide">Champion: {caampion}</div>}

      {view === 'games' ? (
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Game</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Team 1</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Team 2</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Date & Time</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Field</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Score</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {bracket.games.slice().sort((a,b) => a.round - b.round || a.gameNumber - b.gameNumber).map(game => {
                const t1 = game.team1 || resolveTeam(game.team1Source, bracket.seeds, bracket.games)
                const t2 = game.team2 || resolveTeam(game.team2Source, bracket.seeds, bracket.games)
                const t1Label = t1 || fmtSrc(game.team1Source)
                const t2Label = t2 || fmtSrc(game.team2Source)
                const hasScore = game.score1 !== null && game.score2 !== null
                const fmtDate = (d: string) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }) : ''
                const dt = [fmtDate(game.gameDate), game.startTime].filter(Boolean).join(' ') || '—'
                const isChamp = game.section === 'championship'
                return (
                  <tr key={game.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isChamp && <span className="text-[10px] font-bold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Final</span>}
                        <span className="text-sm font-semibold text-slate-800">Round {game.round} – B{game.gameNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{t1Label ? t1Label : <span className="text-slate-300 italic text-xs">TBD</span>}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{t2Label ? t2Label : <span className="text-slate-300 italic text-xs">TBD</span>}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{dt}</td>
                    <td className="px-4 py-3 text-sm text-slate-500 max-w-[180px] truncate">{game.field || <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-sm font-semibold">
                      {hasScore
                        ? <span className={game.winner ? 'text-green-700' : 'text-slate-800'}>{game.score1}–{game.score2}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setSelectedGame(game)}
                        className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors font-medium">
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
      <div className="px-6 py-6 overflow-x-auto">
        {bracket.format === 'single' ? (
          <BracketSection games={[...winnerGames, ...champGames]} seeds={bracket.seeds} allGames={bracket.games} onGameClick={setSelectedGame} />
        ) : (
          <div className="space-y-2">
            <BracketSection games={winnerGames} seeds={bracket.seeds} allGames={bracket.games} onGameClick={setSelectedGame} sectionLabel="Winners Bracket" />
            <BracketSection games={loserGames}  seeds={bracket.seeds} allGames={bracket.games} onGameClick={setSelectedGame} sectionLabel="Losers Bracket" />
            {champGames.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 mt-4">Championship</p>
                <div className="flex gap-3">{champGames.map(g => <GameCard key={g.id} game={g} seeds={bracket.seeds} allGames={bracket.games} onClick={() => setSelectedGame(g)} isChamp />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {selectedGame && <GameModal game={selectedGame} seeds={bracket.seeds} allGames={bracket.games} divisionParam={division} tournamentId={id} onClose={() => setSelectedGame(null)} onSaved={handleGameSaved} />}
      {showSeeds && <SeedPanel teamCount={bracket.teamCount} seeds={bracket.seeds} divisionParam={division} tournamentId={id} onClose={() => setShowSeeds(false)} onSaved={s => setBracket(prev => prev ? { ...prev, seeds: s } : prev)} />}
      {showReset && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6">
            <h2 className="font-bold text-slate-800 mb-2">Reset Bracket?</h2>
            <p className="text-sm text-slate-500 mb-5">This will delete all bracket games and scores for {divName}.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowReset(false)} className="flex-1 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={resetBracket} disabled={resetting} className="flex-1 py-2 text-sm font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50">{resetting ? 'Resetting...' : 'Reset'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
