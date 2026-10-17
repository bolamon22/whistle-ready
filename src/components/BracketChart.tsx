'use client'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Trophy, ArrowRight, Network, List } from 'lucide-react'
import { teamInitials } from '@/lib/names'
import { BracketView, LogosContext, isPlaceholderTeam, type BkBracket, type BkBracketGame, type BkSchedGame } from '@/components/BracketDiagram'
import ChampionHero, { SAMPLE_CHAMP_PICTURE, type ChampMedia } from '@/components/ChampionHero'

// The public event page's bracket (Bo, Oct 12 2026: "not blown away by the
// bracket ... I like the mobile approach but would like to see the chart on desktop
// and let mobile switch to it"). Approved mockup: "Bracket v2" on the Public Event
// Pages Redesign canvas.
//   Chart  - a two-sided tree on a dark stage: each half of the bracket comes in
//            from the outside edge to the championship in the middle. Lines turn
//            teal once a team has advanced, stay dashed until then; tapping a team
//            lights its path in gold and dims the rest.
//   Rounds - one round at a time as a list (the phone default), each game saying
//            where its winner goes next.
// Once the final is scored, the champions' photo or video from the Awards page sits on
// top (components/ChampionHero, Oct 17 2026) when staff have put it on the public
// bracket; otherwise the plain champion banner. Their path is gold, and so is the final.
// Formats that are not one knockout tree (double elimination's losers side, the
// mirrored consolation tournament) keep the older drawing in BracketDiagram.

type Side = { name: string | null; label: string; seed: string }
type GameV = {
  key: string; num: string; bg: BkBracketGame; round: string; isChamp: boolean
  a: Side; b: Side; s1: number | null; s2: number | null; final: boolean
  winner: string | null; when: string; time: string; field: string; ifNeeded: boolean; date: string
}

// Sized so an 8-team chart (5 columns) fits the event page's max-w-6xl column
// without scrolling on a laptop; the chart cards drop the team crest to make room.
const CW = 192, CH = 142, CG = 28, ROW = 160, HEAD = 26

function t12(t: string) { if (!t) return ''; const [h, m] = t.split(':').map(Number); if (isNaN(h)) return t; return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
function dayShort(d: string) { if (!d) return ''; return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) }
// Named by distance from the final, so an 8-team bracket's first round reads
// Quarterfinals (BracketDiagram's rule called it Round 1).
function roundLabel(r: number, max: number) { const d = max - r; if (d === 0) return 'Championship'; if (d === 1) return 'Semifinals'; if (d === 2) return 'Quarterfinals'; if (d === 3) return 'Round of 16'; return `Round ${r}` }

function Avatar({ name }: { name: string | null }) {
  const logos = useContext(LogosContext)
  if (!name) return <span className="w-6 h-6 rounded-full bg-slate-100 border border-dashed border-slate-300 text-slate-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">?</span>
  if (logos[name]) return <span className="w-6 h-6 rounded-full overflow-hidden bg-white border border-slate-200 flex-shrink-0"><img src={logos[name]} alt="" className="w-full h-full object-contain" /></span>
  const initials = teamInitials(name)
  const colors = ['#0B1F3A', '#0E7490', '#0F766E', '#334155', '#475569', '#0D9488']
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length
  return <span className="w-6 h-6 rounded-full text-white text-[9px] font-extrabold flex items-center justify-center flex-shrink-0" style={{ backgroundColor: colors[idx] }}>{initials}</span>
}

function GameCard({ v, focus, onPick, dim = false, fixed = false }: { v: GameV; focus: string | null; onPick: (t: string) => void; dim?: boolean; fixed?: boolean }) {
  const onPath = !!focus && (v.a.name === focus || v.b.name === focus)
  // A decided final turns gold, with the champions' line lit.
  const crowned = v.isChamp && v.final && !!v.winner
  const ring = onPath ? 'ring-[3px] ring-amber-200 shadow-lg' : crowned ? 'ring-2 ring-amber-300 shadow-[0_0_28px_rgba(253,230,138,0.55)]' : v.isChamp ? 'ring-2 ring-teal-300 shadow-[0_0_28px_rgba(45,212,191,0.45)]' : 'shadow-sm'
  const status = v.final ? { t: 'Final', c: 'bg-slate-100 text-slate-600' } : v.ifNeeded ? { t: 'If needed', c: 'bg-violet-50 text-violet-700' } : v.time ? { t: v.time, c: 'bg-teal-50 text-teal-700' } : { t: 'TBD', c: 'bg-slate-100 text-slate-500' }
  const row = (s: Side, score: number | null, win: boolean, lose: boolean) => {
    const me = !!s.name && s.name === focus
    return (
      <button type="button" disabled={!s.name} onClick={() => s.name && onPick(s.name)}
        className={`flex items-center gap-2 w-[calc(100%+12px)] -mx-1.5 px-1.5 min-h-[34px] rounded-lg text-left transition-colors ${me ? 'bg-amber-100' : crowned && s.name === v.winner ? 'bg-amber-50' : s.name ? 'hover:bg-slate-50' : ''}`}>
        <span className={`min-w-[20px] h-5 px-1 rounded-full text-[11px] font-extrabold flex items-center justify-center flex-shrink-0 ${s.seed ? 'bg-teal-50 text-teal-700' : 'text-transparent'}`}>{s.seed || '0'}</span>
        {!fixed && <Avatar name={s.name} />}
        <span className={`flex-1 min-w-0 truncate text-[13.5px] ${!s.name ? 'italic text-slate-400' : lose ? 'text-slate-400 line-through decoration-slate-300' : win ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{s.label}</span>
        {score != null && <span className={`text-[15px] font-extrabold min-w-[20px] text-right ${lose ? 'text-slate-400' : 'text-slate-900'}`}>{score}</span>}
      </button>
    )
  }
  const aw = v.final && (v.s1 ?? 0) > (v.s2 ?? 0), bw = v.final && (v.s2 ?? 0) > (v.s1 ?? 0)
  return (
    <div className={`bg-white border border-slate-200 rounded-2xl px-3.5 py-2.5 flex flex-col gap-1 transition-opacity ${ring} ${dim ? 'opacity-50' : ''}`} style={fixed ? { height: CH, boxSizing: 'border-box' } : undefined}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide truncate ${v.isChamp ? 'text-teal-700' : 'text-slate-400'}`}>{v.isChamp && <Trophy size={12} />}{fixed ? (v.isChamp ? `Final · ${v.num}` : v.num) : `${v.round} · ${v.num}`}</span>
        <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${status.c}`}>{status.t}</span>
      </div>
      {row(v.a, v.final ? v.s1 : null, aw, bw)}
      <div className="h-px bg-slate-100" />
      {row(v.b, v.final ? v.s2 : null, bw, aw)}
      <span className="text-[11.5px] text-slate-500 truncate">{v.when ? `${v.when} · ${v.field}` : 'Not scheduled yet'}</span>
    </div>
  )
}

function buildGames(bracket: BkBracket, sched: BkSchedGame[]) {
  const offset = bracket.numberOffset ?? 0
  const byNum: Record<number, BkBracketGame> = {}
  bracket.games.forEach(g => { byNum[g.gameNumber] = g })
  const sByNum = new Map(sched.map(g => [g.gameNumber, g]))
  const main = bracket.games.filter(g => g.section === 'winners' || g.section === 'championship')
  const maxRound = Math.max(0, ...main.map(g => g.round))
  const seedOf: Record<string, string> = {}
  Object.entries(bracket.seeds || {}).forEach(([n, t]) => { if (t) seedOf[t] = n })
  const memo: Record<number, GameV> = {}
  const side = (src: string, schedName: string | undefined): Side => {
    if (schedName && !isPlaceholderTeam(schedName)) return { name: schedName, label: schedName, seed: seedOf[schedName] || '' }
    if (src.startsWith('seed:')) { const n = src.slice(5), t = bracket.seeds?.[n]; return t ? { name: t, label: t, seed: n } : { name: null, label: `Seed ${n}`, seed: n } }
    const m = src.match(/^(winner|loser):(\d+)$/)
    if (m) {
      const f = game(parseInt(m[2]))
      const num = `B${parseInt(m[2]) + offset}`
      if (f && f.final && f.winner) {
        const w = f.a.name === f.winner ? f.a : f.b, l = f.a.name === f.winner ? f.b : f.a
        const pickd = m[1] === 'winner' ? w : l
        if (pickd.name) return pickd
      }
      return { name: null, label: `${m[1] === 'winner' ? 'Winner' : 'Loser'} ${num}`, seed: '' }
    }
    return { name: null, label: schedName || 'TBD', seed: '' }
  }
  function game(n: number): GameV | null {
    if (memo[n]) return memo[n]
    const bg = byNum[n]; if (!bg) return null
    const num = `B${n + offset}`, sg = sByNum.get(num)
    const a = side(bg.team1Source, sg?.team1), b = side(bg.team2Source, sg?.team2)
    const s1 = sg?.score1 ?? null, s2 = sg?.score2 ?? null
    const final = s1 != null && s2 != null
    const winner = final ? ((s1! > s2!) ? a.name : (s2! > s1!) ? b.name : null) : null
    const isMain = bg.section === 'winners' || bg.section === 'championship'
    const isChamp = bg.section === 'championship' || (bg.label || '').toLowerCase().includes('championship') && isMain
    const round = isMain ? roundLabel(bg.round, maxRound) : (bg.label || 'Placement')
    const v: GameV = {
      key: bg.gameNumber + '', num, bg, round, isChamp, a, b, s1, s2, final, winner,
      when: sg && sg.date ? `${dayShort(sg.date)} ${t12(sg.startTime)}` : (sg && sg.startTime ? t12(sg.startTime) : ''),
      time: sg && sg.startTime ? t12(sg.startTime) : '',
      field: sg ? ((sg.location || '').split(' - ').pop() || sg.location || '') : '', ifNeeded: !!sg?.ifNeeded,
      date: sg?.date || '',
    }
    memo[n] = v
    return v
  }
  bracket.games.forEach(g => game(g.gameNumber))
  return { memo, main, offset, byNum, maxRound }
}

type Placed = { v: GameV; x: number; y: number; side: 'L' | 'R' | 'C' }

function layout(main: BkBracketGame[], memo: Record<number, GameV>) {
  const nums = new Set(main.map(g => g.gameNumber))
  const feeders = (g: BkBracketGame) => [g.team1Source, g.team2Source].map(s => { const m = (s || '').match(/^winner:(\d+)$/); return m && nums.has(parseInt(m[1])) ? parseInt(m[1]) : null }).filter((x): x is number => x != null)
  const referenced = new Set<number>(); main.forEach(g => feeders(g).forEach(f => referenced.add(f)))
  const roots = main.filter(g => !referenced.has(g.gameNumber))
  if (roots.length !== 1) return null
  const root = roots[0]
  const byN: Record<number, BkBracketGame> = {}; main.forEach(g => { byN[g.gameNumber] = g })
  const depth: Record<number, number> = {}
  const walk = (n: number, d: number) => { depth[n] = d; feeders(byN[n]).forEach(f => walk(f, d + 1)) }
  walk(root.gameNumber, 0)
  const rf = feeders(root)
  const two = rf.length === 2
  const maxDepth = Math.max(0, ...Object.values(depth))
  const sideOf: Record<number, 'L' | 'R'> = {}
  const mark = (n: number, s: 'L' | 'R') => { sideOf[n] = s; feeders(byN[n]).forEach(f => mark(f, s)) }
  if (two) { mark(rf[0], 'L'); mark(rf[1], 'R') } else rf.forEach(f => mark(f, 'L'))
  const ys: Record<number, number> = {}
  const place = (n: number, ctr: { i: number }): number => {
    const fs = feeders(byN[n])
    let y: number
    if (fs.length === 0) y = ctr.i++
    else { const c = fs.map(f => place(f, ctr)); y = c.reduce((p, q) => p + q, 0) / c.length }
    ys[n] = y; return y
  }
  const cL = { i: 0 }, cR = { i: 0 }
  if (two) { place(rf[0], cL); place(rf[1], cR) } else rf.forEach(f => place(f, cL))
  const rows = Math.max(1, cL.i, cR.i)
  const shiftL = (rows - Math.max(1, cL.i)) / 2, shiftR = (rows - Math.max(1, cR.i)) / 2
  const cols = two ? 2 * maxDepth + 1 : maxDepth + 1
  const center = two ? maxDepth : maxDepth
  const placed: Record<number, Placed> = {}
  main.forEach(g => {
    const n = g.gameNumber
    if (n === root.gameNumber) return
    const s = sideOf[n] || 'L', d = depth[n] ?? 1
    const col = s === 'L' ? center - d : center + d
    const yy = (ys[n] ?? 0) + (s === 'L' ? shiftL : shiftR)
    placed[n] = { v: memo[n], x: col * (CW + CG), y: HEAD + yy * ROW + (ROW - CH) / 2, side: s }
  })
  let rootY: number
  if (two) rootY = ((placed[rf[0]].y) + (placed[rf[1]].y)) / 2
  else if (rf.length === 1) rootY = placed[rf[0]].y
  else rootY = HEAD
  placed[root.gameNumber] = { v: memo[root.gameNumber], x: center * (CW + CG), y: rootY, side: 'C' }
  const width = cols * (CW + CG) - CG
  const height = HEAD + rows * ROW
  return { placed, root: root.gameNumber, feeders, byN, width, height, two, center, cols, depth, maxDepth }
}

// champMedia: the champions' photo or video by the final's game number (B5), from
// /api/tournaments/[id]/champion-media. sampleChamps: a staff preview, where a decided
// final with nothing added yet shows the sample picture.
export default function BracketChart({ bracketList, scheduledGames, poolOnly = false, champMedia, sampleChamps = false, division = '', eventName = '' }: { bracketList: BkBracket[]; scheduledGames: BkSchedGame[]; poolOnly?: boolean; champMedia?: Record<string, ChampMedia>; sampleChamps?: boolean; division?: string; eventName?: string }) {
  const [view, setView] = useState<'chart' | 'rounds'>('chart')
  const [focus, setFocus] = useState<string | null>(null)
  const [roundIdx, setRoundIdx] = useState<Record<string, number>>({})
  useEffect(() => { try { if (window.innerWidth < 768) setView('rounds') } catch { /* server */ } }, [])
  const pick = (t: string) => setFocus(f => f === t ? null : t)
  const focusOn = (t: string) => setFocus(t)

  if (bracketList.length === 0) return <BracketView bracketList={[]} scheduledGames={[]} poolOnly={poolOnly} />

  const seg = (on: boolean) => `flex items-center gap-1.5 min-h-[40px] px-4 rounded-full text-sm font-bold transition-colors ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500">{focus ? <>Showing the path for <b className="text-slate-700">{focus}</b>.</> : 'Tap a team to light up its path through the bracket.'}</p>
        <div className="flex items-center gap-2">
          {focus && <button onClick={() => setFocus(null)} className="min-h-[36px] px-3.5 rounded-full border border-slate-200 bg-white text-[13px] font-semibold text-teal-700">Clear path</button>}
          <div className="flex p-1 gap-1 bg-slate-200 rounded-full">
            <button onClick={() => setView('chart')} className={seg(view === 'chart')} aria-pressed={view === 'chart'}><Network size={15} />Chart</button>
            <button onClick={() => setView('rounds')} className={seg(view === 'rounds')} aria-pressed={view === 'rounds'}><List size={15} />Rounds</button>
          </div>
        </div>
      </div>
      {bracketList.map(bracket => {
        const legacy = bracket.games.some(g => g.section === 'losers') || (bracket.format === '2gg' && bracket.games.some(g => (g.label || '').toLowerCase().includes('consolation championship')))
        const flightTitle = bracketList.length > 1 ? `Flight ${bracket.flight || 'A'}` : ''
        if (legacy) return <div key={bracket.id}>{flightTitle && <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-2">{flightTitle}</h3>}<BracketView bracketList={[bracket]} scheduledGames={scheduledGames} /></div>
        return <OneBracket key={bracket.id} bracket={bracket} sched={scheduledGames} title={flightTitle} view={view} focus={focus} pick={pick} focusOn={focusOn}
          champMedia={champMedia} sampleChamps={sampleChamps} division={division} eventName={eventName}
          roundIdx={roundIdx[bracket.id]} setRoundIdx={(i: number) => setRoundIdx(r => ({ ...r, [bracket.id]: i }))} />
      })}
    </div>
  )
}

function OneBracket({ bracket, sched, title, view, focus, pick, focusOn, champMedia, sampleChamps, division, eventName, roundIdx, setRoundIdx }: { bracket: BkBracket; sched: BkSchedGame[]; title: string; view: 'chart' | 'rounds'; focus: string | null; pick: (t: string) => void; focusOn: (t: string) => void; champMedia?: Record<string, ChampMedia>; sampleChamps: boolean; division: string; eventName: string; roundIdx?: number; setRoundIdx: (i: number) => void }) {
  const { memo, main, maxRound } = useMemo(() => buildGames(bracket, sched), [bracket, sched])
  const lay = useMemo(() => layout(main, memo), [main, memo])
  const logos = useContext(LogosContext)
  const boardRef = useRef<HTMLDivElement>(null)
  const placement = bracket.games.filter(g => g.section === 'consolation' || g.section === 'losers').map(g => memo[g.gameNumber]).filter(Boolean)
  if (!lay) return <BracketView bracketList={[bracket]} scheduledGames={sched} />
  const root = memo[lay.root]
  const inG = (v: GameV, t: string | null) => !!t && (v.a.name === t || v.b.name === t)

  // champion / status banner
  const champ = root.final ? root.winner : null
  const runnerUp = champ ? (root.a.name === champ ? root.b.name : root.a.name) : null
  // The champions' photo or video, else the sample picture in a staff preview.
  const media: ChampMedia | null = champ ? (champMedia?.[root.num] || (sampleChamps ? { url: SAMPLE_CHAMP_PICTURE, sample: true } : null)) : null
  const champSide = champ ? (root.a.name === champ ? root.a : root.b) : null
  const hi = Math.max(root.s1 ?? 0, root.s2 ?? 0), lo = Math.min(root.s1 ?? 0, root.s2 ?? 0)
  // Their seed and the bracket games they won on the way; the final is in the line above.
  const champChips = champ ? [
    champSide?.seed ? `No. ${champSide.seed} seed` : '',
    ...main.map(g => memo[g.gameNumber]).filter(v => v && v.key !== root.key && v.final && v.winner === champ)
      .sort((x, y) => x.bg.round - y.bg.round)
      .map(v => `${v.round.replace(/finals$/, 'final')}: ${Math.max(v.s1 ?? 0, v.s2 ?? 0)}\u2013${Math.min(v.s1 ?? 0, v.s2 ?? 0)} over ${v.a.name === champ ? v.b.label : v.a.label}`),
  ].filter(Boolean) : []
  const lightPath = () => {
    if (!champ) return
    focusOn(champ)
    setTimeout(() => { try { boardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch { /* old browser */ } }, 60)
  }
  const rounds = Array.from(new Set(main.map(g => g.round))).sort((a, b) => a - b)
  const roundGames = (r: number) => main.filter(g => g.round === r).sort((a, b) => a.gameNumber - b.gameNumber).map(g => memo[g.gameNumber])
  const progress = rounds.map(r => { const gs = roundGames(r), done = gs.filter(v => v.final).length; return { label: roundLabel(r, maxRound), done, total: gs.length } })

  const edgeStyle = (child: GameV, parent: GameV) => {
    if (focus && inG(child, focus) && inG(parent, focus)) return { stroke: '#FDE68A', width: 3, dash: '' }
    if (!focus && champ && child.winner === champ && inG(parent, champ)) return { stroke: '#FDE68A', width: 3, dash: '' }
    if (child.final) return { stroke: 'rgba(94,234,212,0.8)', width: 2, dash: '' }
    return { stroke: 'rgba(255,255,255,0.38)', width: 2, dash: '5 5' }
  }
  const paths: JSX.Element[] = []
  main.forEach(g => {
    const P = lay.placed[g.gameNumber]; if (!P) return
    lay.feeders(g).forEach(f => {
      const C = lay.placed[f]; if (!C) return
      const cy = C.y + CH / 2, py = P.y + CH / 2
      const fromRight = C.side === 'R'
      const x1 = fromRight ? C.x : C.x + CW
      const x2 = P.side === 'C' ? (fromRight ? P.x + CW : P.x) : (fromRight ? P.x + CW : P.x)
      const mx = (x1 + x2) / 2
      const st = edgeStyle(C.v, P.v)
      paths.push(<path key={`${f}-${g.gameNumber}`} d={`M${x1},${cy} H${mx} V${py} H${x2}`} fill="none" stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash || undefined} strokeLinejoin="round" />)
    })
  })
  const colLabels: { x: number; label: string; align: string }[] = []
  Object.values(lay.placed).forEach(p => { if (!colLabels.some(c => c.x === p.x)) colLabels.push({ x: p.x, label: p.v.round, align: p.side === 'C' ? 'center' : p.side === 'R' ? 'right' : 'left' }) })

  const tabs = rounds.map(r => roundLabel(r, maxRound)).concat(placement.length ? ['Placement'] : [])
  const ri = Math.min(roundIdx ?? Math.max(0, rounds.findIndex(r => roundGames(r).some(v => !v.final))), tabs.length - 1)
  const parentOf = (v: GameV) => {
    const n = v.bg.gameNumber
    const p = bracket.games.find(g => g.team1Source === `winner:${n}` || g.team2Source === `winner:${n}`)
    return p ? memo[p.gameNumber] : null
  }
  const listGames = ri < rounds.length ? roundGames(rounds[ri]) : placement

  return (
    <div className="space-y-4">
      {title && <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h3>}
      {/* banner */}
      {champ && media ? (
        <ChampionHero media={media} team={champ} logo={logos[champ]} division={division} flight={title} eventName={eventName} year={(root.date || '').slice(0, 4)}
          result={`Beat ${runnerUp} ${hi}\u2013${lo} in the final`} detail={root.when ? `${root.when}${root.field ? ` \u00b7 ${root.field}` : ''}` : ''}
          chips={champChips} onPath={lightPath} />
      ) : champ ? (
        <div className="flex items-center gap-4 flex-wrap rounded-2xl px-5 py-4 text-white shadow-lg" style={{ background: 'linear-gradient(135deg,#0B1F3A 0%,#0E7490 55%,#0B1F3A 100%)' }}>
          <span className="w-12 h-12 rounded-full bg-amber-200 text-slate-900 flex items-center justify-center flex-shrink-0"><Trophy size={24} /></span>
          <div className="flex-1 min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-teal-200">Champion</p><p className="text-xl font-extrabold truncate">{champ}</p><p className="text-[13px] text-teal-100">Beat {runnerUp} {Math.max(root.s1!, root.s2!)}–{Math.min(root.s1!, root.s2!)} in the final</p></div>
        </div>
      ) : (
        <div className="flex items-center gap-4 flex-wrap rounded-2xl px-4 py-3.5 bg-white border border-slate-200 shadow-sm">
          <span className="w-11 h-11 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center flex-shrink-0"><Trophy size={22} /></span>
          <div className="flex-1 min-w-0"><p className="text-[10px] font-bold uppercase tracking-widest text-teal-700">Championship</p><p className="text-[17px] font-extrabold">{root.when ? `${root.when} · ${root.field}` : 'Time to be announced'}</p></div>
          <div className="flex gap-1.5 flex-wrap">{progress.map(p => <span key={p.label} className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${p.done === p.total ? 'bg-teal-600 text-white' : p.done > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{p.label}{p.done === p.total ? ' ✓' : p.done > 0 ? ` · ${p.done}/${p.total}` : ''}</span>)}</div>
        </div>
      )}

      {view === 'chart' ? (
        <div ref={boardRef} className="rounded-2xl p-3" style={{ background: 'linear-gradient(160deg,#0B1F3A 0%,#0E7490 60%,#0B1F3A 100%)' }}>
          {lay.width > 700 && <p className="md:hidden flex items-center gap-1.5 text-xs font-semibold text-teal-200 mb-2"><ArrowRight size={14} />Swipe to see the whole bracket</p>}
          <div className="overflow-x-auto pb-1">
            <div className="relative mx-auto" style={{ width: lay.width, height: lay.height }}>
              {colLabels.map(c => <span key={c.x} className="absolute top-0 text-[10px] font-bold uppercase tracking-widest" style={{ left: c.x, width: CW, textAlign: c.align as any, color: c.align === 'center' ? '#5EEAD4' : '#99F6E4' }}>{c.label}</span>)}
              <svg className="absolute inset-0 pointer-events-none" width={lay.width} height={lay.height} viewBox={`0 0 ${lay.width} ${lay.height}`} aria-hidden>{paths}</svg>
              {Object.entries(lay.placed).map(([n, p]) => (
                <div key={n} className="absolute" style={{ left: p.x, top: p.y, width: CW }}>
                  {p.side === 'C' && <div className="absolute -inset-1.5 rounded-[20px]" style={{ background: champ ? 'rgba(253,230,138,0.25)' : 'rgba(94,234,212,0.18)' }} />}
                  <div className="relative"><GameCard v={p.v} focus={focus} onPick={pick} fixed dim={!!focus && !inG(p.v, focus)} /></div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap mt-3 text-xs text-teal-100">
            <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-teal-300/80" />Team advanced</span>
            <span className="flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-white/40" />Not played yet</span>
            <span className="flex items-center gap-1.5"><span className="w-5 border-t-[3px] border-amber-200" />{champ && !focus ? "The champions' path" : "Selected team's path"}</span>
          </div>
        </div>
      ) : (
        <div ref={boardRef} className="space-y-3">
          <div className="flex p-1 gap-1 bg-slate-200 rounded-full">
            {tabs.map((t, i) => <button key={t} onClick={() => setRoundIdx(i)} className={`flex-1 min-h-[40px] rounded-full text-[13px] font-bold transition-colors ${i === ri ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{t.replace('Quarterfinals', 'Quarters').replace('Semifinals', 'Semis').replace('Championship', 'Final')}</button>)}
          </div>
          {listGames.map(v => {
            const p = parentOf(v)
            const next = p ? `${v.winner || 'Winner'} plays in the ${p.round.toLowerCase()} (${p.num})${p.when ? ` · ${p.when} · ${p.field}` : ''}` : ''
            return (
              <div key={v.key} className="space-y-1.5">
                <GameCard v={v} focus={focus} onPick={pick} />
                {next && <p className="flex items-center gap-1.5 px-1.5 text-xs text-slate-500"><ArrowRight size={13} className="text-teal-600 flex-shrink-0" />{next}</p>}
              </div>
            )
          })}
        </div>
      )}

      {view === 'chart' && placement.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap"><h3 className="text-base font-extrabold text-slate-900">Placement games</h3><span className="text-xs text-slate-500">{placement.length} game{placement.length === 1 ? '' : 's'}</span></div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
            {placement.map(v => <GameCard key={v.key} v={v} focus={focus} onPick={pick} />)}
          </div>
        </div>
      )}
    </div>
  )
}
