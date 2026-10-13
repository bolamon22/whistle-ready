'use client'
import { useEffect, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { primeAlerts, penaltyOverAlert } from '@/lib/gameAlert'
import { FIELD_REQUEST_TEMPLATES, FIELD_REQUEST_GROUPS, FIELD_REQUEST_URGENCIES, fieldNumberFrom } from '@/lib/fieldRequests'

interface Game {
  id: string; tournamentId?: string; gameNumber: string; division: string; location: string
  team1: string; team2: string; score1: number | null; score2: number | null
  isChampionship: boolean; isCanceled: boolean
}
interface Penalty {
  id: string; team: 1 | 2; playerNum: string
  remaining: number; total: number; active: boolean; paused: boolean
}
interface TournamentDefaults { periodSecs: number; penaltySecs: number; rulesUrl: string; askScorer: boolean; penaltyAlert: boolean; keepAwake: boolean }

const DEFAULTS_FALLBACK: TournamentDefaults = { periodSecs: 20 * 60, penaltySecs: 120, rulesUrl: 'https://sunshineeventsgroup.com/rules/', askScorer: false, penaltyAlert: true, keepAwake: true }
const PRESETS = [30, 60, 120, 180, 300] // :30, 1, 2, 3, 5 min

function fmt(secs: number) {
  const s = Math.max(0, Math.round(secs))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* ---- tournament-wide "smart defaults" ----
   Persisted per tournament so every game inherits the same defaults.
   >>> SWAP POINT: replace loadDefaults/saveDefaults with
   GET/PATCH `/api/tournaments/${tid}/settings` for true cross-device defaults. */
function loadDefaults(tid: string): TournamentDefaults {
  try { return { ...DEFAULTS_FALLBACK, ...JSON.parse(localStorage.getItem('lw:tourney:' + tid) || '{}') } }
  catch { return { ...DEFAULTS_FALLBACK } }
}
function saveDefaults(tid: string, patch: Partial<TournamentDefaults>): TournamentDefaults {
  try {
    const next = { ...loadDefaults(tid), ...patch }
    localStorage.setItem('lw:tourney:' + tid, JSON.stringify(next))
    return next
  } catch { return loadDefaults(tid) }
}

/* ---- this phone's copy of a game in progress ----
   The clock, period, penalty timers and goal scorers live only in the scorer's
   browser (the server keeps the score). Saving them here lets a refresh, Exit or
   a dead battery pick up where it left off; a running clock is caught up by the
   time that passed. Old entries (6h+) are ignored. */
interface SavedGame {
  savedAt: number; clockMs: number; running: boolean; periodSecs: number; period: number
  penalties: Penalty[]; scorers1: string[]; scorers2: string[]
}
const GAME_KEY = (gameId: string) => 'lw:game:' + gameId
function loadGameState(gameId: string): SavedGame | null {
  try {
    const v = JSON.parse(localStorage.getItem(GAME_KEY(gameId)) || 'null') as SavedGame | null
    if (!v || typeof v.savedAt !== 'number' || Date.now() - v.savedAt > 6 * 3600_000) return null
    return { ...v, penalties: Array.isArray(v.penalties) ? v.penalties : [], scorers1: v.scorers1 || [], scorers2: v.scorers2 || [] }
  } catch { return null }
}
function saveGameState(gameId: string, v: SavedGame) {
  try { localStorage.setItem(GAME_KEY(gameId), JSON.stringify(v)) } catch { /* private mode / full */ }
}
function clearGameState(gameId: string) {
  try { localStorage.removeItem(GAME_KEY(gameId)) } catch { /* ignore */ }
}

export default function ScorekeeperPage({ params }: { params: { id: string; gameId: string } }) {
  const tid = params.id // tournament id
  const router = useRouter()
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [defaults, setDefaults] = useState<TournamentDefaults>(DEFAULTS_FALLBACK)
  const [score1, setScore1] = useState(0)
  const [score2, setScore2] = useState(0)

  // countdown clock
  const [periodSecs, setPeriodSecs] = useState(DEFAULTS_FALLBACK.periodSecs)
  const [clockMs, setClockMs] = useState(DEFAULTS_FALLBACK.periodSecs * 1000) // remaining
  const [clockRunning, setClockRunning] = useState(false)
  const clockRef = useRef<NodeJS.Timeout | null>(null)
  const lastTickRef = useRef(0)          // wall-clock time the clock was last advanced to
  const clockMsRef = useRef(0)           // mirror of clockMs for the tick (penalties can't outlast the clock)
  const restoredRef = useRef(false)      // don't persist until this game's saved state has been restored

  const [penalties, setPenalties] = useState<Penalty[]>([])
  // Field request sheet (balls, trainer, water…) without leaving the scorer.
  // Requests sent from this game are remembered so the scorer sees who's coming.
  const [showReq, setShowReq] = useState(false)
  const [reqField, setReqField] = useState('')
  const [reqText, setReqText] = useState('')
  const [reqDetail, setReqDetail] = useState('')
  const [reqGroup, setReqGroup] = useState('all')
  const [reqUrg, setReqUrg] = useState('Medium')
  const [reqSending, setReqSending] = useState(false)
  const [myReqs, setMyReqs] = useState<{ id: string; text: string; at: string; acks: string[] }[]>([])
  const [penOver, setPenOver] = useState<string[]>([])   // "penalty over" banners until dismissed
  const prevActivePens = useRef<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [gameEnded, setGameEnded] = useState(false)

  // clock-setup modal
  const [showClockSetup, setShowClockSetup] = useState(false)
  const [setupMin, setSetupMin] = useState(12)
  const [setupSec, setSetupSec] = useState(0)
  const [saveClockDefault, setSaveClockDefault] = useState(true)

  // add-penalty form
  const [showPenaltyForm, setShowPenaltyForm] = useState<1 | 2 | null>(null)
  const [penPlayer, setPenPlayer] = useState('')
  const [penSecs, setPenSecs] = useState(120)
  const [customMin, setCustomMin] = useState(2)
  const [customSec, setCustomSec] = useState(0)
  const [useCustom, setUseCustom] = useState(false)
  const [keepOpen, setKeepOpen] = useState(false)
  const [savePenDefault, setSavePenDefault] = useState(false)

  // edit-penalty modal
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMin, setEditMin] = useState(0)
  const [editSec, setEditSec] = useState(0)

  // rules slide-over (viewer) + shared scoring config (rules text + no-ties)
  const [showRules, setShowRules] = useState(false)
  const [rulesText, setRulesText] = useState('')          // optional scorer notes (scoringConfig.rules)
  const [eventRules, setEventRules] = useState('')        // the tournament's published rules, looked up automatically
  const [eventRulesSource, setEventRulesSource] = useState('')
  const [exiting, setExiting] = useState(false)
  const savedScores = useRef<{ s1: number; s2: number }>({ s1: 0, s2: 0 })
  const [noTies, setNoTies] = useState(false)
  const [periodFormat, setPeriodFormat] = useState('halves')
  const [periodBreakMin, setPeriodBreakMin] = useState(0)
  const [officialTimeOnField, setOfficialTimeOnField] = useState(true)
  const [currentPeriod, setCurrentPeriod] = useState(1)
  const [savingCfg, setSavingCfg] = useState(false)
  const [teamLogos, setTeamLogos] = useState<Record<string, string>>({})

  // settings + goal-scorer
  const [showSettings, setShowSettings] = useState(false)
  const [goalTeam, setGoalTeam] = useState<1 | 2 | null>(null)
  const [goalPlayer, setGoalPlayer] = useState('')
  const [scorers1, setScorers1] = useState<string[]>([])
  const [scorers2, setScorers2] = useState<string[]>([])

  // load game + tournament defaults
  useEffect(() => {
    fetch(`/api/games/${params.gameId}`).then(r => r.json()).then((g: Game) => {
      const d = loadDefaults(g.tournamentId ?? tid)
      setGame(g); setDefaults(d)
      setScore1(g.score1 ?? 0); setScore2(g.score2 ?? 0)
      savedScores.current = { s1: g.score1 ?? 0, s2: g.score2 ?? 0 }
      setPeriodSecs(d.periodSecs); setClockMs(d.periodSecs * 1000)
      setSetupMin(Math.floor(d.periodSecs / 60)); setSetupSec(d.periodSecs % 60)
      setPenSecs(d.penaltySecs)
      if (g.score1 != null && g.score2 != null) setGameEnded(true)
      // Pick up a game already in progress on this phone (refresh, Exit, phone
      // died). A running clock kept running while they were away.
      const saved = loadGameState(params.gameId)
      if (saved && !(g.score1 != null && g.score2 != null)) {
        const away = saved.running ? Math.max(0, Date.now() - saved.savedAt) : 0
        const left = Math.max(0, saved.clockMs - away)
        const penSecs = Math.floor(Math.min(away, saved.clockMs) / 1000)
        setPeriodSecs(saved.periodSecs); setClockMs(left); setCurrentPeriod(saved.period)
        setPenalties(saved.penalties.map(p => p.active && !p.paused ? { ...p, remaining: Math.max(0, p.remaining - penSecs), active: p.remaining - penSecs > 0 } : p))
        setScorers1(saved.scorers1); setScorers2(saved.scorers2)
        if (saved.running && left > 0) { setClockRunning(true); toast('⏱ Clock kept running — picked up where you left off') }
      }
      // The running score lives on the server (live-scores), not on this phone: a
      // refresh used to drop it back to the last Save. Take it from there.
      if (!(g.score1 != null && g.score2 != null)) {
        fetch(`/api/tournaments/${tid}/live-scores?fresh=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()).then(d => {
          const ls = d?.scores?.[params.gameId]
          if (!ls || !ls.live) return
          startedRef.current = true
          setScore1(Number(ls.score1) || 0); setScore2(Number(ls.score2) || 0)
          savedScores.current = { s1: Number(ls.score1) || 0, s2: Number(ls.score2) || 0 }
          if (!saved && ls.period) setCurrentPeriod(Number(ls.period) || 1)
        }).catch(() => {})
      }
      setReqField(fieldNumberFrom(g.location))
      try {
        const r = JSON.parse(localStorage.getItem('lw:req:' + params.gameId) || '[]')
        if (Array.isArray(r)) setMyReqs(r.filter((x: { at?: string }) => x && x.at && Date.now() - Date.parse(x.at) < 3 * 3600_000))
      } catch { /* none */ }
      restoredRef.current = true
      setLoading(false)
    })
    return () => { if (clockRef.current) clearInterval(clockRef.current) }
  }, [params.gameId])

  // shared scoring config (rules text, no-ties, period format, official-time), tournament-wide
  useEffect(() => {
    fetch(`/api/tournaments/${tid}/rules`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) {
        setRulesText(d.rules || ''); setNoTies(!!d.noTies)
        setEventRules(d.eventRules || ''); setEventRulesSource(d.eventRulesSource || '')
        if (d.periodFormat) setPeriodFormat(d.periodFormat)
        if (d.periodBreakMin != null) setPeriodBreakMin(d.periodBreakMin)
        setOfficialTimeOnField(d.officialTimeOnField !== false)
      }
    }).catch(() => {})
  }, [tid])

  // team crests (teamName -> logoUrl) for this tournament
  useEffect(() => {
    fetch(`/api/tournaments/${tid}/team-logos`).then(r => r.ok ? r.json() : {}).then(m => setTeamLogos(m || {})).catch(() => {})
  }, [tid])

  // period label for the current format ("Half 1", "Qtr 2", "Period 3")
  const PERIOD_NOUN: Record<string, string> = { halves: 'Half', quarters: 'Qtr', periods: 'Period', running: 'Running' }
  function periodLabelFor(n: number) {
    if (periodFormat === 'running') return 'Running clock'
    return `${PERIOD_NOUN[periodFormat] || 'Period'} ${n}`
  }

  // push the live state so parents can follow on the public page. The clock goes
  // with it (Bo, Oct 12 2026: Post scores and the ticker showed the half but never
  // the time): time left and whether it's running, so viewers can count it down.
  const startedRef = useRef(false)   // this game has been pushed live from this phone
  function pushLive(opts: { score1?: number; score2?: number; period?: number; live: boolean; event?: 'halftime'; running?: boolean; ms?: number } = { live: true }) {
    const s1 = opts.score1 ?? score1, s2 = opts.score2 ?? score2, per = opts.period ?? currentPeriod
    if (opts.live) startedRef.current = true
    return fetch(`/api/tournaments/${tid}/live-scores`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: params.gameId, score1: s1, score2: s2, period: per, periodLabel: periodLabelFor(per), live: opts.live,
        clockMs: opts.ms ?? clockMsRef.current, clockRunning: opts.live && (opts.running ?? clockRunning),
        penalties: penalties.filter(p => p.active && p.remaining > 0).map(p => ({ team: p.team, num: p.playerNum, secs: p.remaining, paused: p.paused })),
        ...(opts.event ? { event: opts.event } : {}) }),
    }).then(r => r.ok).catch(() => false)
  }
  // While the clock runs, resend every 30s: keeps viewers' countdown in step with
  // this phone and tells the server the game is still going.
  const pushRef = useRef(pushLive); pushRef.current = pushLive
  // A penalty added, changed, paused or cleared goes out right away (Bo, Oct 12
  // 2026: penalty time on the ticker and game page). Flagged by the handlers, sent
  // after the render so the push carries the new list.
  const penPushRef = useRef(false)
  useEffect(() => {
    if (!penPushRef.current) return
    penPushRef.current = false
    if (startedRef.current && !gameEnded) pushLive({ live: true })
  }, [penalties]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!clockRunning || gameEnded) return
    const t = setInterval(() => pushRef.current({ live: true }), 30000)
    return () => clearInterval(t)
  }, [clockRunning, gameEnded])
  function changePeriod(delta: number) {
    const next = Math.max(1, Math.min(9, currentPeriod + delta))
    setCurrentPeriod(next)
    pushLive({ period: next, live: true })
  }

  clockMsRef.current = clockMs

  // tick: clock + penalties count down (skip paused). Driven by the real time
  // that has passed, not by counting timer ticks: phones throttle or freeze
  // timers when the screen locks or the app is in the background, and the old
  // count-the-ticks clock silently lost that time. Now it catches up the moment
  // the scorer looks at the phone again.
  useEffect(() => {
    if (!clockRunning) { if (clockRef.current) clearInterval(clockRef.current); return }
    lastTickRef.current = Date.now()
    const step = () => {
      const secs = Math.floor((Date.now() - lastTickRef.current) / 1000)
      if (secs <= 0) return
      lastTickRef.current += secs * 1000
      const penSecs = Math.min(secs, Math.ceil(clockMsRef.current / 1000))
      setClockMs(prev => Math.max(0, prev - secs * 1000))
      if (penSecs > 0) setPenalties(prev => prev.map(p =>
        p.active && !p.paused ? { ...p, remaining: Math.max(0, p.remaining - penSecs), active: p.remaining - penSecs > 0 } : p
      ))
    }
    clockRef.current = setInterval(step, 250)
    const onVis = () => { if (document.visibilityState === 'visible') step() }
    document.addEventListener('visibilitychange', onVis)
    return () => { if (clockRef.current) clearInterval(clockRef.current); document.removeEventListener('visibilitychange', onVis) }
  }, [clockRunning])

  // Keep the screen on while the clock runs (Screen Wake Lock; recent Chrome and
  // Safari). The browser drops the lock whenever the page is hidden, so ask again
  // when it comes back.
  useEffect(() => {
    if (!clockRunning || !defaults.keepAwake) return
    type Lock = { release: () => Promise<void> }
    let lock: Lock | null = null
    let cancelled = false
    const request = async () => {
      try {
        const wl = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Lock> } }).wakeLock
        if (!wl || document.visibilityState !== 'visible') return
        const l = await wl.request('screen')
        if (cancelled) void l.release(); else lock = l
      } catch { /* denied or unsupported (low battery mode, old browser) */ }
    }
    void request()
    const onVis = () => { if (document.visibilityState === 'visible') void request() }
    document.addEventListener('visibilitychange', onVis)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); if (lock) void lock.release().catch(() => {}) }
  }, [clockRunning, defaults.keepAwake])

  // Remember the clock, period and penalties on this phone so a refresh, Exit
  // or a dead battery doesn't lose them.
  useEffect(() => {
    if (!restoredRef.current) return
    if (gameEnded) { clearGameState(params.gameId); return }
    saveGameState(params.gameId, { savedAt: Date.now(), clockMs, running: clockRunning, periodSecs, period: currentPeriod, penalties, scorers1, scorers2 })
  }, [clockMs, clockRunning, periodSecs, currentPeriod, penalties, scorers1, scorers2, gameEnded]) // eslint-disable-line react-hooks/exhaustive-deps

  // Penalty over: buzz + beep (where the phone allows) and a banner that stays
  // until dismissed, so the scorer can wave the player back on even if the
  // phone is on silent. Fires when a timer runs out, not when one is removed.
  useEffect(() => {
    const prev = prevActivePens.current
    const ended = penalties.filter(p => !p.active && p.remaining <= 0 && prev.has(p.id))
    prevActivePens.current = new Set(penalties.filter(p => p.active).map(p => p.id))
    if (!ended.length || !game) return
    if (defaults.penaltyAlert) penaltyOverAlert()
    setPenOver(list => [...list, ...ended.map(p => `${p.team === 1 ? game.team1 : game.team2}${p.playerNum ? ' #' + p.playerNum : ''} can return`)])
  }, [penalties]) // eslint-disable-line react-hooks/exhaustive-deps

  // auto-stop at 0:00
  useEffect(() => {
    if (clockRunning && clockMs <= 0) {
      setClockRunning(false); toast('⏱ Period over')
      // End of the first half (or Q2): tell followers the halftime score.
      if ((periodFormat === 'halves' && currentPeriod === 1) || (periodFormat === 'quarters' && currentPeriod === 2)) pushLive({ live: true, event: 'halftime', running: false, ms: 0 })
      else pushLive({ live: true, running: false, ms: 0 })
    }
  }, [clockMs, clockRunning])

  function toggleClock() {
    const starting = !clockRunning
    if (starting) primeAlerts()   // unlock sound with this tap so the penalty alert can play later
    if (starting && clockMs <= 0) setClockMs(periodSecs * 1000)
    setClockRunning(r => !r)
    // Pause is sent too, so the ticker stops counting down when the scorer does.
    if (starting || startedRef.current) pushLive({ live: true, running: starting, ms: starting && clockMs <= 0 ? periodSecs * 1000 : clockMs })
  }
  function resetClock() {
    if (!window.confirm('Reset the clock back to the full period? This clears the current running time.')) return
    setClockRunning(false); setClockMs(periodSecs * 1000)
    if (startedRef.current) pushLive({ live: true, running: false, ms: periodSecs * 1000 })
  }

  function applyClockSetup() {
    if (!game) return
    const secs = Math.max(1, Number(setupMin) * 60 + Number(setupSec))
    setPeriodSecs(secs); setClockRunning(false); setClockMs(secs * 1000)
    if (startedRef.current) pushLive({ live: true, running: false, ms: secs * 1000 })
    if (saveClockDefault) {
      setDefaults(saveDefaults(game.tournamentId ?? tid, { periodSecs: secs }))
      toast.success(`Saved ${fmt(secs)} as tournament default`)
    } else { toast.success(`Period set to ${fmt(secs)} (this game)`) }
    setShowClockSetup(false)
  }

  // The top-bar Save (and Exit) keep the running score on the server so a dropped
  // phone or a refresh loses nothing; only "End Game & Post Score" is the final.
  // Mid-game saves go to the live score, not the game's score: writing 1-3 into
  // the game made it a final everywhere -- off the live ticker, "Final" on Post
  // scores and the public page -- and unchecking Final then wiped the live entry
  // (Bo, Oct 12 2026: "it keeps disappearing").
  async function saveScore(opts: { final?: boolean } = {}) {
    setSaving(true)
    const ok = opts.final
      ? await fetch(`/api/games/${params.gameId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ score1, score2 }),
        }).then(r => r.ok).catch(() => false)
      : await pushLive({ live: true })
    setSaving(false)
    if (!ok) { toast.error('Could not save — check your signal and try again'); return false }
    savedScores.current = { s1: score1, s2: score2 }
    setSaved(true); toast.success(opts.final ? 'Final posted!' : 'Score saved!')
    setTimeout(() => setSaved(false), 2000)
    return true
  }

  // Leave the game. There was no way out before (scorers had to use the browser's
  // back button). Unsaved score changes are saved as a running (not final) score
  // first so nothing is lost. The clock and penalty timers keep running while
  // they're away (saved on this phone) and pick up when they reopen the game.
  async function exitGame() {
    setExiting(true)
    const dirty = score1 !== savedScores.current.s1 || score2 !== savedScores.current.s2
    if (dirty && !gameEnded) {
      const ok = await saveScore()
      if (!ok && !window.confirm('The score did not save. Leave anyway? Your changes will be lost.')) { setExiting(false); return }
    }
    // Back to wherever they came from inside the app; otherwise this event's game list.
    const sameSite = typeof document !== 'undefined' && document.referrer.startsWith(window.location.origin)
    if (sameSite && window.history.length > 1) router.back()
    else router.push(`/tournaments/${tid}/scoring`)
  }

  // Watch this game's requests for "on my way" responses (every 15s while any
  // are open) and say who's coming.
  useEffect(() => {
    try { localStorage.setItem('lw:req:' + params.gameId, JSON.stringify(myReqs)) } catch { /* ignore */ }
    if (!myReqs.length) return
    const poll = () => {
      fetch(`/api/tournaments/${tid}/ops-messages`).then(r => r.ok ? r.json() : null).then(d => {
        if (!d || !Array.isArray(d.messages)) return
        const byId = new Map<string, { acks?: { by: string }[] }>(d.messages.map((m: { id: string }) => [m.id, m]))
        setMyReqs(list => {
          let changed = false
          const next = list.filter(r => byId.has(r.id)).map(r => {
            const acks = (byId.get(r.id)?.acks || []).map(a => a.by)
            const fresh = acks.filter(a => !r.acks.includes(a))
            if (fresh.length) { changed = true; fresh.forEach(by => toast.success(`${by} is on the way · ${r.text}`, { duration: 6000 })) }
            if (acks.length !== r.acks.length) changed = true
            return { ...r, acks }
          })
          return changed || next.length !== list.length ? next : list
        })
      }).catch(() => {})
    }
    poll()
    const t = setInterval(poll, 15000)
    return () => clearInterval(t)
  }, [myReqs.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function openRequest() {
    setReqText(''); setReqDetail(''); setReqGroup('all'); setReqUrg('Medium')
    if (game && !reqField) setReqField(fieldNumberFrom(game.location))
    setShowReq(true)
  }
  function pickRequest(t: { make: (f: string) => string; group: string }) {
    setReqText(t.make(reqField)); setReqGroup(t.group)
  }
  async function sendRequest() {
    const base = reqText.trim()
    if (!base) return
    const medical = reqGroup === 'medical'
    const text = reqDetail.trim() ? `${base} — ${reqDetail.trim()}` : base
    setReqSending(true)
    try {
      const res = await fetch(`/api/tournaments/${tid}/ops-messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, group: reqGroup, urgency: medical ? reqUrg : undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'Request did not send — try again'); return }
      if (d.message?.id) setMyReqs(l => [{ id: d.message.id, text: base, at: new Date().toISOString(), acks: [] }, ...l].slice(0, 8))
      toast.success('Request sent')
      setShowReq(false)
    } catch { toast.error('Request did not send — check your signal') } finally { setReqSending(false) }
  }

  function openSettings() { setShowSettings(true) }
  function openRules() { setShowRules(true) }
  async function saveConfig(patch: { rules?: string; noTies?: boolean; officialTimeOnField?: boolean; periodFormat?: string }) {
    setSavingCfg(true)
    try {
      const res = await fetch(`/api/tournaments/${tid}/rules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      if (res.ok) toast.success('Saved for tournament')
      else toast.error('Failed to save')
    } catch { toast.error('Failed to save') } finally { setSavingCfg(false) }
  }

  function setKeepAwake(val: boolean) {
    if (!game) return
    setDefaults(saveDefaults(game.tournamentId ?? tid, { keepAwake: val }))
  }
  function setPenaltyAlert(val: boolean) {
    if (!game) return
    setDefaults(saveDefaults(game.tournamentId ?? tid, { penaltyAlert: val }))
  }
  function setAskScorer(val: boolean) {
    if (!game) return
    setDefaults(saveDefaults(game.tournamentId ?? tid, { askScorer: val }))
  }
  function addGoal(team: 1 | 2) {
    if (defaults.askScorer) { setGoalTeam(team); setGoalPlayer(''); return }
    if (team === 1) { const ns = score1 + 1; setScore1(ns); pushLive({ score1: ns, live: true }) }
    else { const ns = score2 + 1; setScore2(ns); pushLive({ score2: ns, live: true }) }
  }
  function confirmGoal() {
    const num = goalPlayer.trim()
    if (goalTeam === 1) { const ns = score1 + 1; setScore1(ns); setScorers1(a => [...a, num]); pushLive({ score1: ns, live: true }) }
    else if (goalTeam === 2) { const ns = score2 + 1; setScore2(ns); setScorers2(a => [...a, num]); pushLive({ score2: ns, live: true }) }
    toast.success(num ? `Goal · #${num}` : 'Goal recorded')
    setGoalTeam(null); setGoalPlayer('')
  }
  function removeGoal(team: 1 | 2) {
    if (team === 1) { const ns = Math.max(0, score1 - 1); setScore1(ns); setScorers1(a => a.slice(0, -1)); pushLive({ score1: ns, live: true }) }
    else { const ns = Math.max(0, score2 - 1); setScore2(ns); setScorers2(a => a.slice(0, -1)); pushLive({ score2: ns, live: true }) }
  }

  function chosenSecs() { return useCustom ? Number(customMin) * 60 + Number(customSec) : penSecs }

  function addPenalty() {
    if (!showPenaltyForm || !game) return
    primeAlerts()
    const total = Math.max(1, chosenSecs())
    penPushRef.current = true
    setPenalties(p => [...p, {
      id: Math.random().toString(36).slice(2), team: showPenaltyForm, playerNum: penPlayer,
      remaining: total, total, active: true, paused: false,
    }])
    if (savePenDefault) {
      setDefaults(saveDefaults(game.tournamentId ?? tid, { penaltySecs: total }))
      toast.success(`${fmt(total)} added · saved as tournament default`)
    } else { toast.success(`${fmt(total)} penalty added${penPlayer ? ' · #' + penPlayer : ''}`) }
    if (keepOpen) { setPenPlayer('') } else { setShowPenaltyForm(null); setPenPlayer('') }
  }

  function adjustPenalty(id: string, delta: number) {
    penPushRef.current = true
    setPenalties(p => p.map(x => {
      if (x.id !== id) return x
      const remaining = Math.max(0, Math.min(x.remaining + delta, 3600))
      return { ...x, remaining, total: Math.max(x.total, remaining), active: remaining > 0 }
    }))
  }
  function togglePausePenalty(id: string) { penPushRef.current = true; setPenalties(p => p.map(x => x.id === id ? { ...x, paused: !x.paused } : x)) }
  function removePenalty(id: string) { penPushRef.current = true; setPenalties(p => p.filter(x => x.id !== id)) }
  function openEdit(p: Penalty) { setEditingId(p.id); setEditMin(Math.floor(p.remaining / 60)); setEditSec(p.remaining % 60) }
  function saveEdit() {
    const remaining = Math.max(0, Number(editMin) * 60 + Number(editSec))
    penPushRef.current = true
    setPenalties(p => p.map(x => x.id === editingId ? { ...x, remaining, total: Math.max(x.total, remaining), active: remaining > 0 } : x))
    setEditingId(null); toast.success(`Penalty set to ${fmt(remaining)}`)
  }

  const remainSec = Math.ceil(clockMs / 1000)
  const clockStr = `${String(Math.floor(remainSec / 60)).padStart(2, '0')}:${String(remainSec % 60).padStart(2, '0')}`
  const low = clockMs <= 60000 && clockMs > 0
  const team1Pens = penalties.filter(p => p.team === 1 && p.active)
  const team2Pens = penalties.filter(p => p.team === 2 && p.active)

  function PenaltyRow({ p }: { p: Penalty }) {
    return (
      <div className={`rounded-xl px-3 py-2.5 border ${p.paused ? 'bg-amber-950/40 border-amber-800/40' : 'bg-red-950/60 border-red-900/40'}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className={`text-sm font-semibold ${p.paused ? 'text-amber-400' : 'text-red-400'}`}>#{p.playerNum || '—'}</span>
            <span className="text-xs text-gray-500 ml-2">{fmt(p.total)}</span>
            {p.paused && <span className="text-[10px] text-amber-400 ml-2 font-bold tracking-wide uppercase">Paused</span>}
          </div>
          <span className={`text-lg font-mono font-bold ${p.paused ? 'text-amber-400' : 'text-red-400'}`}>{fmt(p.remaining)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-2.5">
          <button onClick={() => togglePausePenalty(p.id)}
            className={`px-2.5 py-1.5 rounded-lg text-sm font-bold ${p.paused ? 'bg-emerald-700 hover:bg-emerald-600 text-white' : 'bg-amber-700 hover:bg-amber-600 text-white'}`}>{p.paused ? '▶' : '⏸'}</button>
          <button onClick={() => adjustPenalty(p.id, -15)} className="flex-1 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold">−15s</button>
          <button onClick={() => adjustPenalty(p.id, 15)} className="flex-1 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold">+15s</button>
          <button onClick={() => openEdit(p)} className="flex-1 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-bold">✎</button>
          <button onClick={() => removePenalty(p.id)} className="px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-red-900/60 text-gray-500 hover:text-red-400 text-sm">✕</button>
        </div>
      </div>
    )
  }

  function TeamCrest({ name }: { name: string }) {
    const url = teamLogos[name]
    return url
      ? <img src={url} alt="" className="w-14 h-14 rounded-full object-contain bg-white/5 border border-gray-700 mb-2" />
      : <div className="w-14 h-14 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 text-xl font-bold mb-2">{name?.[0]?.toUpperCase() || '?'}</div>
  }

  function Stepper({ label, value, set, max }: { label: string; value: number; set: (n: number) => void; max: number }) {
    return (
      <div className="flex-1">
        <label className="block text-xs text-gray-400 mb-1 text-center">{label}</label>
        <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-2 py-2">
          <button onClick={() => set(Math.max(0, Number(value) - 1))} className="w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 text-lg font-bold text-white shrink-0">−</button>
          <input type="text" inputMode="numeric" pattern="[0-9]*"
            value={String(value).padStart(2, '0')}
            onFocus={e => e.target.select()}
            onChange={e => {
              const digits = e.target.value.replace(/[^0-9]/g, '').slice(-2)
              set(digits === '' ? 0 : Math.min(max, parseInt(digits, 10)))
            }}
            className="w-12 text-center text-xl font-mono font-bold text-white tabular-nums bg-transparent focus:outline-none" />
          <button onClick={() => set(Math.min(max, Number(value) + 1))} className="w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 text-lg font-bold text-white shrink-0">+</button>
        </div>
      </div>
    )
  }

  if (loading || !game) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">Loading…</div>
  )

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col select-none">
      <Toaster position="top-center" toastOptions={{ style: { background: '#1f2937', color: '#fff', border: '1px solid #374151' } }} />

      {/* Penalty over banners — stay until dismissed */}
      {penOver.length > 0 && (
        <div className="fixed top-0 inset-x-0 z-[70] p-3 space-y-2">
          {penOver.map((msg, i) => (
            <div key={i} role="alert" className="flex items-center gap-3 rounded-2xl bg-red-600 text-white px-4 py-3 shadow-2xl">
              <span className="flex-1 font-bold">⏱ Penalty over — {msg}</span>
              <button onClick={() => setPenOver(l => l.filter((_, j) => j !== i))} className="px-4 py-2 rounded-xl bg-white text-red-700 font-bold text-sm">OK</button>
            </div>
          ))}
        </div>
      )}

      {/* Top info bar */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <button onClick={exitGame} disabled={exiting} aria-label="Exit game"
              className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-semibold disabled:opacity-50">
              {exiting ? 'Saving…' : '← Exit'}
            </button>
            <span className="hidden sm:inline-flex items-center gap-1 bg-emerald-900/50 text-emerald-400 border border-emerald-800/40 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide">📋 Scorekeeper View</span>
          </div>
          {game.isChampionship && <span className="text-xs bg-amber-900/50 text-amber-400 px-2 py-1 rounded-full">🏆 Championship</span>}
          <div className="flex items-center gap-2">
            <button onClick={openRequest} aria-label="Field request"
              className="relative h-8 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 text-sm font-bold">
              📣 Request
              {myReqs.some(r => r.acks.length === 0) && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-gray-900" aria-label="Waiting for a response" />}
            </button>
            <button onClick={openSettings} aria-label="Settings"
              className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-base">⚙</button>
            <button onClick={() => saveScore()} disabled={saving}
              className={`text-sm font-semibold px-4 py-1.5 rounded-xl transition-colors ${saved ? 'bg-emerald-700 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'} disabled:opacity-50`}>
              {saving ? '…' : saved ? '✓ Saved' : 'Save'}
            </button>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-400 font-medium">{game.division} · Game #{game.gameNumber}</p>
          <p className="text-xs text-gray-500">{game.location}</p>
        </div>
      </div>

      {/* Clock (counts down from period length) */}
      <div className="flex flex-col items-center py-5 border-b border-gray-800">
        {periodFormat !== 'running' && (
          <div className="flex items-center gap-3 mb-2">
            <button onClick={() => changePeriod(-1)} className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-lg font-bold">−</button>
            <span className="text-sm font-bold text-emerald-400 uppercase tracking-wide min-w-[90px] text-center">{periodLabelFor(currentPeriod)}</span>
            <button onClick={() => changePeriod(1)} className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-lg font-bold">+</button>
          </div>
        )}
        {periodFormat !== 'running' && periodBreakMin > 0 && (
          <p className="text-[11px] text-gray-500 mb-2">{periodFormat === 'quarters' ? 'Between quarters' : 'Halftime'}: {periodBreakMin} min</p>
        )}
        <div className={`text-6xl font-mono font-bold tracking-wider mb-1 ${low ? 'text-red-400' : 'text-white'}`}>{clockStr}</div>
        <button onClick={() => { setSetupMin(Math.floor(periodSecs / 60)); setSetupSec(periodSecs % 60); setSaveClockDefault(true); setShowClockSetup(true) }}
          className="text-xs text-gray-400 hover:text-gray-200 mb-4">Period {fmt(periodSecs)} · ✎ Set time</button>
        <div className="flex gap-3">
          <button onClick={toggleClock}
            className={`px-8 py-3 rounded-2xl text-base font-bold transition-colors ${clockRunning ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
            {clockRunning ? '⏸ Pause' : '▶ Start'}
          </button>
          <button onClick={resetClock} className="px-5 py-3 rounded-2xl text-base font-bold bg-gray-800 hover:bg-gray-700 text-gray-300">Reset</button>
        </div>
        {officialTimeOnField && (
          <p className="text-[11px] text-gray-500 mt-3 text-center max-w-[280px]">Official game time is kept on the field by the referees — this clock is for reference.</p>
        )}
      </div>

      {/* Scoreboard */}
      <div className="flex flex-1 divide-x divide-gray-800">
        {/* Team 1 */}
        <div className="flex-1 flex flex-col items-center px-3 py-5">
          <TeamCrest name={game.team1} />
          <p className="text-base font-semibold text-gray-300 text-center mb-3 leading-tight">{game.team1}</p>
          <div className="text-8xl font-bold text-white mb-5 tabular-nums">{score1}</div>
          <div className="flex gap-3 mb-3">
            <button onClick={() => removeGoal(1)} className="w-16 h-16 rounded-2xl bg-gray-800 hover:bg-gray-700 text-3xl font-bold text-gray-300 active:scale-95 transition-transform">–</button>
            <button onClick={() => addGoal(1)} className="w-16 h-16 rounded-2xl bg-blue-600 hover:bg-blue-500 text-3xl font-bold active:scale-95 transition-transform">+</button>
          </div>
          {scorers1.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1 mb-4 max-w-[170px]">
              {scorers1.map((n, i) => (<span key={i} className="text-[11px] bg-blue-950/60 text-blue-300 border border-blue-900/40 rounded-full px-2 py-0.5">{n ? '#' + n : '—'}</span>))}
            </div>
          )}
          <div className="w-full space-y-2 mb-3">{team1Pens.map(p => <PenaltyRow key={p.id} p={p} />)}</div>
          <button onClick={() => { setShowPenaltyForm(1); setUseCustom(false); setPenSecs(defaults.penaltySecs); setSavePenDefault(false) }}
            className="text-xs text-red-400 border border-red-900/40 hover:bg-red-950/40 px-4 py-2 rounded-xl transition-colors">+ Penalty</button>
        </div>

        {/* Team 2 */}
        <div className="flex-1 flex flex-col items-center px-3 py-5">
          <TeamCrest name={game.team2} />
          <p className="text-base font-semibold text-gray-300 text-center mb-3 leading-tight">{game.team2}</p>
          <div className="text-8xl font-bold text-white mb-5 tabular-nums">{score2}</div>
          <div className="flex gap-3 mb-3">
            <button onClick={() => removeGoal(2)} className="w-16 h-16 rounded-2xl bg-gray-800 hover:bg-gray-700 text-3xl font-bold text-gray-300 active:scale-95 transition-transform">–</button>
            <button onClick={() => addGoal(2)} className="w-16 h-16 rounded-2xl bg-blue-600 hover:bg-blue-500 text-3xl font-bold active:scale-95 transition-transform">+</button>
          </div>
          {scorers2.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1 mb-4 max-w-[170px]">
              {scorers2.map((n, i) => (<span key={i} className="text-[11px] bg-blue-950/60 text-blue-300 border border-blue-900/40 rounded-full px-2 py-0.5">{n ? '#' + n : '—'}</span>))}
            </div>
          )}
          <div className="w-full space-y-2 mb-3">{team2Pens.map(p => <PenaltyRow key={p.id} p={p} />)}</div>
          <button onClick={() => { setShowPenaltyForm(2); setUseCustom(false); setPenSecs(defaults.penaltySecs); setSavePenDefault(false) }}
            className="text-xs text-red-400 border border-red-900/40 hover:bg-red-950/40 px-4 py-2 rounded-xl transition-colors">+ Penalty</button>
        </div>
      </div>

      {/* End game */}
      <div className="px-4 pb-6 pt-3 border-t border-gray-800">
        <button onClick={() => {
            if (noTies && score1 === score2) { if (!window.confirm('The score is tied and this tournament doesn’t allow ties. Post it as a tie anyway?')) return }
            if (!window.confirm(`Post the final score?\n\n${game.team1} ${score1} – ${score2} ${game.team2}`)) return
            setClockRunning(false); saveScore({ final: true }).then(ok => { if (ok) { setGameEnded(true); pushLive({ live: false }) } })
          }}
          className="w-full py-4 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-base active:scale-[.98] transition-all">End Game &amp; Post Score</button>
        {gameEnded && (<p className="text-center text-xs text-emerald-400 mt-2">Final: {game.team1} {score1} – {score2} {game.team2}</p>)}
        {noTies && score1 === score2 && (<p className="text-center text-xs text-amber-400 mt-2">⚠️ This tournament doesn’t allow ties — enter a winner.</p>)}
        <button onClick={openRules} className="w-full mt-3 text-xs text-gray-400 hover:text-gray-200 flex items-center justify-center gap-1.5">
          📖 Rules
        </button>
      </div>

      {/* Rules reference slide-over — in-app tournament rules, ✕ returns to scoring */}
      {showRules && (
        <div className="fixed inset-0 z-[65] flex flex-col" style={{ background: 'rgba(0,0,0,0.92)' }}>
          <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
            <h3 className="font-bold text-white">📖 Tournament rules</h3>
            <button onClick={() => setShowRules(false)} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded-lg font-semibold">✕ Back to scoring</button>
          </div>
          <div className="flex-1 overflow-auto p-5">
            {rulesText.trim() && (
              <div className="max-w-2xl mx-auto mb-5 rounded-xl border border-amber-800/40 bg-amber-950/30 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-amber-400 mb-1.5">Scorer notes</p>
                <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{rulesText}</div>
              </div>
            )}
            {eventRules.trim() ? (
              <div className="max-w-2xl mx-auto">
                {eventRulesSource && <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500 mb-2">{eventRulesSource}</p>}
                <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{eventRules}</div>
              </div>
            ) : !rulesText.trim() && (
              <div className="p-6 text-center text-sm text-gray-400">This tournament has no rules on its event page yet.<br />Add them in the event page&apos;s Rules section and they show up here.</div>
            )}
          </div>
        </div>
      )}

      {/* Field request sheet */}
      {showReq && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-3" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowReq(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 w-full max-w-sm max-h-[calc(100dvh-1.5rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white text-lg">📣 Field request</h3>
              <label className="flex items-center gap-2 text-xs text-gray-400">Field
                <input value={reqField} onChange={e => setReqField(e.target.value)} inputMode="numeric"
                  className="w-14 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-center text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {FIELD_REQUEST_TEMPLATES.map(t => {
                const on = reqText === t.make(reqField)
                const med = t.group === 'medical'
                return (
                  <button key={t.label} type="button" onClick={() => pickRequest(t)}
                    className={`min-h-[52px] px-3 rounded-xl text-sm font-bold text-left border transition-colors ${on ? (med ? 'bg-rose-600 border-rose-500 text-white' : 'bg-amber-500 border-amber-400 text-gray-950') : (med ? 'bg-rose-950/50 border-rose-900/60 text-rose-200 hover:bg-rose-900/50' : 'bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700')}`}>
                    {t.label}
                  </button>
                )
              })}
            </div>
            <input value={reqText} onChange={e => setReqText(e.target.value)} placeholder="…or type your own request"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-3 text-white text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500" />
            {reqGroup === 'medical' && (
              <div className="bg-rose-950/40 border border-rose-900/50 rounded-xl p-3 mb-3">
                <p className="text-[11px] font-semibold text-rose-300 mb-2">Medical — for emergencies, call 911 first.</p>
                <div className="flex gap-1.5 mb-2">
                  {FIELD_REQUEST_URGENCIES.map(u => (
                    <button key={u} type="button" onClick={() => setReqUrg(u)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold ${reqUrg === u ? (u === 'High' ? 'bg-red-500 text-white' : u === 'Medium' ? 'bg-amber-500 text-gray-950' : 'bg-gray-500 text-white') : 'bg-gray-800 text-gray-300'}`}>{u}</button>
                  ))}
                </div>
                <input value={reqDetail} onChange={e => setReqDetail(e.target.value)} placeholder="What happened? e.g. #12 ankle, can't walk"
                  className="w-full bg-gray-900 border border-rose-900/60 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500" />
              </div>
            )}
            <label className="block text-[11px] font-semibold text-gray-400 mb-1.5">Send to</label>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {FIELD_REQUEST_GROUPS.map(g => (
                <button key={g.key} type="button" onClick={() => setReqGroup(g.key)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${reqGroup === g.key ? 'bg-teal-600 border-teal-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>{g.label}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowReq(false)} className="px-4 py-3 rounded-xl bg-gray-800 text-gray-300 font-semibold">Cancel</button>
              <button type="button" onClick={sendRequest} disabled={!reqText.trim() || reqSending}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-gray-950 font-bold disabled:opacity-40">{reqSending ? 'Sending…' : 'Send request'}</button>
            </div>
            {myReqs.length > 0 && (
              <div className="mt-4 border-t border-gray-800 pt-3">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Sent from this game</p>
                <div className="space-y-1.5">
                  {myReqs.map(r => (
                    <div key={r.id} className="flex items-start justify-between gap-2 text-sm">
                      <span className="text-gray-200 min-w-0">{r.text}<span className="text-gray-500"> · {new Date(r.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></span>
                      <span className={`shrink-0 text-[11px] font-bold ${r.acks.length ? 'text-emerald-400' : 'text-amber-400'}`}>{r.acks.length ? `✓ ${r.acks.join(', ')} coming` : 'Waiting…'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <h3 className="font-bold text-white mb-1">⚙ Settings</h3>
            <p className="text-xs text-gray-500 mb-4">Saved for the whole tournament.</p>
            <label className="flex items-center justify-between gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 cursor-pointer">
              <span className="text-sm text-gray-200">Ask for player&nbsp;# when a goal is scored</span>
              <input type="checkbox" checked={defaults.askScorer} onChange={e => setAskScorer(e.target.checked)} className="accent-emerald-600 w-5 h-5" />
            </label>
            <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 mt-3">
              <label className="flex-1 flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm text-gray-200">Sound + vibrate when a penalty ends</span>
                <input type="checkbox" checked={defaults.penaltyAlert} onChange={e => setPenaltyAlert(e.target.checked)} className="accent-emerald-600 w-5 h-5" />
              </label>
              <button onClick={() => penaltyOverAlert()} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200">Test</button>
            </div>
            <p className="text-[11px] text-gray-500 mt-1 px-1">Saved on this phone. iPhones can&apos;t vibrate from a web page; they beep and show a banner.</p>
            <label className="flex items-center justify-between gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 cursor-pointer mt-3">
              <span className="text-sm text-gray-200">Keep screen on while the clock runs</span>
              <input type="checkbox" checked={defaults.keepAwake} onChange={e => setKeepAwake(e.target.checked)} className="accent-emerald-600 w-5 h-5" />
            </label>
            <p className="text-[11px] text-gray-500 mt-1 px-1">Saved on this phone. Turn off to save battery. If the phone locks, the clock still keeps time and catches up when it&apos;s unlocked, but penalty alerts wait until then.</p>
            <label className="flex items-center justify-between gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 cursor-pointer mt-3">
              <span className="text-sm text-gray-200">No ties — warn at final if the score is tied</span>
              <input type="checkbox" checked={noTies} onChange={e => { setNoTies(e.target.checked); saveConfig({ noTies: e.target.checked }) }} className="accent-emerald-600 w-5 h-5" />
            </label>
            <label className="flex items-center justify-between gap-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 cursor-pointer mt-3">
              <span className="text-sm text-gray-200">Official game time kept on field by refs</span>
              <input type="checkbox" checked={officialTimeOnField} onChange={e => { setOfficialTimeOnField(e.target.checked); saveConfig({ officialTimeOnField: e.target.checked }) }} className="accent-emerald-600 w-5 h-5" />
            </label>
            <div className="mt-3 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
              <label className="block text-sm text-gray-200 mb-1.5">Game format</label>
              <select value={periodFormat} onChange={e => { setPeriodFormat(e.target.value); saveConfig({ periodFormat: e.target.value }) }}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="halves">Halves</option>
                <option value="quarters">Quarters</option>
                <option value="periods">Periods</option>
                <option value="running">Running clock (no periods)</option>
              </select>
              <p className="text-[11px] text-gray-500 mt-1">Sets how the period is labeled in the scorer (Half / Qtr / Period).</p>
            </div>
            <div className="mt-4">
              <p className="text-[11px] text-gray-400 mb-2">{eventRules.trim() ? `📖 Rules load automatically from the event page${eventRulesSource ? ` (${eventRulesSource})` : ''}.` : '📖 No rules on the event page yet — add them in the event page’s Rules section.'}</p>
              <label className="block text-xs text-gray-400 mb-1">Extra notes for scorers (optional, shown above the rules)</label>
              <textarea value={rulesText} onChange={e => setRulesText(e.target.value)} rows={4} placeholder="e.g. Running clock in the last 2 min if up by 6+…"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={() => saveConfig({ rules: rulesText })} disabled={savingCfg}
                className="mt-2 w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-sm disabled:opacity-50">Save notes</button>
              <p className="text-[11px] text-gray-500 mt-1">Saved for the whole tournament. Scorers open them from 📖 Rules without leaving the game.</p>
            </div>
            <button onClick={() => setShowSettings(false)} className="w-full mt-4 py-3 rounded-xl bg-gray-800 text-gray-300 hover:bg-gray-700 font-semibold">Done</button>
          </div>
        </div>
      )}

      {/* Goal scorer modal */}
      {goalTeam && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">Goal — {goalTeam === 1 ? game.team1 : game.team2}</h3>
            <label className="block text-xs text-gray-400 mb-1">Who scored? (player #, optional)</label>
            <input autoFocus value={goalPlayer} onChange={e => setGoalPlayer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmGoal() }} placeholder="e.g. 23"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4" />
            <div className="flex gap-3">
              <button onClick={confirmGoal} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-white">Add goal</button>
              <button onClick={() => { setGoalTeam(null); setGoalPlayer('') }} className="px-5 py-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Clock-setup modal */}
      {showClockSetup && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-1">Set period length</h3>
            <p className="text-xs text-gray-500 mb-4">The clock counts down from this time.</p>
            <div className="flex gap-3 mb-4">
              <Stepper label="Min" value={setupMin} set={setSetupMin} max={59} />
              <Stepper label="Sec" value={setupSec} set={setSetupSec} max={59} />
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-300 select-none mb-4">
              <input type="checkbox" checked={saveClockDefault} onChange={e => setSaveClockDefault(e.target.checked)} className="accent-emerald-600 w-4 h-4" />
              Save as tournament default (applies to every game)
            </label>
            <div className="flex gap-3">
              <button onClick={applyClockSetup} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-bold text-white">Set time</button>
              <button onClick={() => setShowClockSetup(false)} className="px-5 py-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add-penalty modal */}
      {showPenaltyForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">Penalty — {showPenaltyForm === 1 ? game.team1 : game.team2}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Player # (optional)</label>
                <input className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={penPlayer} onChange={e => setPenPlayer(e.target.value)} placeholder="e.g. 23" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Duration</label>
                  <span className="text-[10px] text-emerald-400">★ default {fmt(defaults.penaltySecs)}</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {PRESETS.map(n => (
                    <button key={n} onClick={() => { setUseCustom(false); setPenSecs(n) }}
                      className={`py-3 rounded-xl text-xs font-bold transition-colors ${!useCustom && penSecs === n ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>{fmt(n)}</button>
                  ))}
                </div>
                <button onClick={() => setUseCustom(c => !c)}
                  className={`mt-2 w-full py-2 rounded-xl text-xs font-bold transition-colors ${useCustom ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                  {useCustom ? '✓ Custom time' : 'Custom time…'}
                </button>
                {useCustom && (
                  <div className="flex gap-3 mt-3">
                    <Stepper label="Min" value={customMin} set={setCustomMin} max={59} />
                    <Stepper label="Sec" value={customSec} set={setCustomSec} max={59} />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-300 select-none">
                <input type="checkbox" checked={savePenDefault} onChange={e => setSavePenDefault(e.target.checked)} className="accent-emerald-600 w-4 h-4" />
                Save this time as tournament default
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-400 select-none">
                <input type="checkbox" checked={keepOpen} onChange={e => setKeepOpen(e.target.checked)} className="accent-red-600 w-4 h-4" />
                Keep open to stack another penalty
              </label>
              <div className="flex gap-3">
                <button onClick={addPenalty} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 font-bold text-white">Start Penalty</button>
                <button onClick={() => { setShowPenaltyForm(null); setPenPlayer(''); setKeepOpen(false) }} className="px-5 py-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit-penalty modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold text-white mb-4">Edit penalty time</h3>
            <div className="flex gap-3 mb-4">
              <Stepper label="Min" value={editMin} set={setEditMin} max={59} />
              <Stepper label="Sec" value={editSec} set={setEditSec} max={59} />
            </div>
            <div className="flex gap-3">
              <button onClick={saveEdit} className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-white">Save</button>
              <button onClick={() => setEditingId(null)} className="px-5 py-3 rounded-xl bg-gray-800 text-gray-400 hover:bg-gray-700">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
