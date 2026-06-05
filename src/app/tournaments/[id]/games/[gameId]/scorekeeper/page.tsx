'use client'
import { useEffect, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'

interface Game {
  id: string; gameNumber: string; division: string; location: string
  team1: string; team2: string; score1: number | null; score2: number | null
  isChampionship: boolean; isCanceled: boolean
}
interface Penalty {
  id: string; team: 1 | 2; playerNum: string; duration: number; elapsed: number; active: boolean
}

export default function ScorekeeperPage({ params }: { params: { id: string; gameId: string } }) {
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [score1, setScore1] = useState(0)
  const [score2, setScore2] = useState(0)
  const [clockRunning, setClockRunning] = useState(false)
  const [clockMs, setClockMs] = useState(0)
  const [penalties, setPenalties] = useState<Penalty[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showPenaltyForm, setShowPenaltyForm] = useState<1 | 2 | null>(null)
  const [penPlayer, setPenPlayer] = useState('')
  const [penDuration, setPenDuration] = useState(2)
  const [gameEnded, setGameEnded] = useState(false)
  const clockRef = useRef<NodeJS.Timeout | null>(null)
  const startRef = useRef<number>(0)

  useEffect(() => {
    fetch(`/api/games/${params.gameId}`).then(r => r.json()).then((g: Game) => {
      setGame(g)
      setScore1(g.score1 ?? 0)
      setScore2(g.score2 ?? 0)
      if (g.score1 != null && g.score2 != null) setGameEnded(true)
      setLoading(false)
    })
    return () => { if (clockRef.current) clearInterval(clockRef.current) }
  }, [params.gameId])

  // Clock tick
  useEffect(() => {
    if (clockRunning) {
      startRef.current = Date.now() - clockMs
      clockRef.current = setInterval(() => {
        const now = Date.now() - startRef.current
        setClockMs(now)
        setPenalties(prev => prev.map(p =>
          p.active ? { ...p, elapsed: p.elapsed + 1, active: p.elapsed + 1 < p.duration * 60 } : p
        ))
      }, 1000)
    } else {
      if (clockRef.current) clearInterval(clockRef.current)
    }
    return () => { if (clockRef.current) clearInterval(clockRef.current) }
  }, [clockRunning])

  async function saveScore() {
    setSaving(true)
    await fetch(`/api/games/${params.gameId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score1, score2 }),
    })
    setSaving(false); setSaved(true)
    toast.success('Score saved!')
    setTimeout(() => setSaved(false), 2000)
  }

  function addPenalty() {
    if (!showPenaltyForm) return
    setPenalties(p => [...p, {
      id: Math.random().toString(36).slice(2),
      team: showPenaltyForm, playerNum: penPlayer,
      duration: penDuration, elapsed: 0, active: true,
    }])
    setPenPlayer(''); setShowPenaltyForm(null)
    toast.success(`${penDuration}-min penalty added`)
  }

  function removePenalty(id: string) {
    setPenalties(p => p.filter(x => x.id !== id))
  }

  const clockSecs = Math.floor(clockMs / 1000)
  const mm = Math.floor(clockSecs / 60)
  const ss = clockSecs % 60
  const clockStr = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

  const team1Pens = penalties.filter(p => p.team === 1 && p.active)
  const team2Pens = penalties.filter(p => p.team === 2 && p.active)

  function penTimeLeft(p: Penalty) {
    const remaining = p.duration * 60 - p.elapsed
    const m = Math.floor(remaining / 60), s = remaining % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  if (loading || !game) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Loading…</div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none">
      <Toaster position="top-center" toastOptions={{ style: { background: '#1f2937', color: '#fff', border: '1px solid #374151' } }} />

      {/* Top info bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">{game.division}</p>
          <p className="text-xs text-gray-400">Game #{game.gameNumber} · {game.location}</p>
        </div>
        {game.isChampionship && <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-1 rounded-full">🏆 Championship</span>}
        <button onClick={saveScore} disabled={saving}
          className={`text-sm font-semibold px-4 py-1.5 rounded-xl transition-colors ${saved ? 'bg-emerald-700 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'} disabled:opacity-50`}>
          {saving ? '…' : saved ? '✓ Saved' : 'Save'}
        </button>
      </div>

      {/* Clock */}
      <div className="flex flex-col items-center py-5 border-b border-gray-800">
        <div className="text-5xl font-mono font-bold tracking-wider text-white mb-4">{clockStr}</div>
        <div className="flex gap-3">
          <button onClick={() => setClockRunning(r => !r)}
            className={`px-8 py-3 rounded-2xl text-base font-bold transition-colors ${clockRunning ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            {clockRunning ? '⏸ Pause' : '▶ Start'}
          </button>
          <button onClick={() => { setClockRunning(false); setClockMs(0) }}
            className="px-5 py-3 rounded-2xl text-base font-bold bg-gray-800 hover:bg-gray-700 text-gray-300">
            Reset
          </button>
        </div>
      </div>

      {/* Scoreboard */}
      <div className="flex flex-1 divide-x divide-gray-800">
        {/* Team 1 */}
        <div className="flex-1 flex flex-col items-center px-4 py-5">
          <p className="text-sm font-semibold text-gray-300 text-center mb-3 leading-tight">{game.team1}</p>
          <div className="text-7xl font-bold text-white mb-4 tabular-nums">{score1}</div>
          <div className="flex gap-3 mb-5">
            <button onClick={() => setScore1(s => Math.max(0, s - 1))}
              className="w-14 h-14 rounded-2xl bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-gray-300 active:scale-95 transition-transform">–</button>
            <button onClick={() => setScore1(s => s + 1)}
              className="w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 text-2xl font-bold active:scale-95 transition-transform">+</button>
          </div>
          {/* Penalties */}
          <div className="w-full space-y-1.5 mb-3">
            {team1Pens.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-red-950/60 border border-red-900/40 rounded-xl px-3 py-2">
                <div>
                  <span className="text-xs text-red-400 font-semibold">#{p.playerNum || '—'}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.duration} min</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold text-red-400">{penTimeLeft(p)}</span>
                  <button onClick={() => removePenalty(p.id)} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowPenaltyForm(1)}
            className="text-xs text-red-400 border border-red-900/40 hover:bg-red-950/40 px-4 py-2 rounded-xl transition-colors">
            + Penalty
          </button>
        </div>

        {/* Team 2 */}
        <div className="flex-1 flex flex-col items-center px-4 py-5">
          <p className="text-sm font-semibold text-gray-300 text-center mb-3 leading-tight">{game.team2}</p>
          <div className="text-7xl font-bold text-white mb-4 tabular-nums">{score2}</div>
          <div className="flex gap-3 mb-5">
            <button onClick={() => setScore2(s => Math.max(0, s - 1))}
              className="w-14 h-14 rounded-2xl bg-gray-800 hover:bg-gray-700 text-2xl font-bold text-gray-300 active:scale-95 transition-transform">–</button>
            <button onClick={() => setScore2(s => s + 1)}
              className="w-14 h-14 rounded-2xl bg-blue-600 hover:bg-blue-500 text-2xl font-bold active:scale-95 transition-transform">+</button>
          </div>
          {/* Penalties */}
          <div className="w-full space-y-1.5 mb-3">
            {team2Pens.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-red-950/60 border border-red-900/40 rounded-xl px-3 py-2">
                <div>
                  <span className="text-xs text-red-400 font-semibold">#{p.playerNum || '—'}</span>
                  <span className="text-xs text-gray-500 ml-2">{p.duration} min</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-bold text-red-400">{penTimeLeft(p)}</span>
                  <button onClick={() => removePenalty(p.id)} className="text-gray-600 hover:text-red-400 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setShowPenaltyForm(2)}
            className="text-xs text-red-400 border border-red-900/40 hover:bg-red-950/40 px-4 py-2 rounded-xl transition-colors">
            + Penalty
          </button>
        </div>
      </div>

      {/* End game button */}
      <div className="px-4 pb-6 pt-3 border-t border-gray-800">
        <button onClick={() => { saveScore(); setGameEnded(true); setClockRunning(false) }}
          className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-base active:scale-98 transition-all">
          End Game & Save Score
        </button>
        {gameEnded && (
          <p className="text-center text-xs text-emerald-400 mt-2">
            Final: {game.team1} {score1} – {score2} {game.team2}
          </p>
        )}
      </div>

      {/* Penalty modal */}
      {showPenaltyForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">
              Penalty — {showPenaltyForm === 1 ? game.team1 : game.team2}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Player # (optional)</label>
                <input className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={penPlayer} onChange={e => setPenPlayer(e.target.value)} placeholder="e.g. 23" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-2">Duration</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 5].map(n => (
                    <button key={n} onClick={() => setPenDuration(n)}
                      className={`py-3 rounded-xl text-sm font-bold transition-colors ${penDuration === n ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                      {n} min
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={addPenalty} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-white">Start Penalty</button>
                <button onClick={() => { setShowPenaltyForm(null); setPenPlayer('') }} className="px-5 py-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
