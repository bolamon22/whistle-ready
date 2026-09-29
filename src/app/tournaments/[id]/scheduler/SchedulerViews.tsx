'use client'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, Clock, Zap, ChevronDown, ChevronUp, ChevronsLeft, ChevronsRight, Maximize2, Minimize2, Search, X } from 'lucide-react'
import { isRealTeam, teamKey } from '@/lib/autoSchedule'

// Two alternative views of the day's schedule, switchable with the legacy grid:
//   Timeline  - fields down, time across. Every field fits without sideways scroll;
//               unscheduled games in a left rail, issues + day health in a right rail.
//   Teams     - one division at a time, one row per team grouped by pool, so rest,
//               back-to-backs and double-books read as a shape rather than a badge.
// Both place games by click (works on an iPad) or by dragging from the rail.
// Placement writes through the same patchGame the grid uses; nothing here talks to
// the API directly.

export interface SGame {
  id: string
  gameNumber: string
  date: string
  startTime: string
  location: string
  division: string
  pool: string | null
  team1: string
  team2: string
  isCanceled: boolean
  score1?: number | null
  score2?: number | null
}
export interface SField { venueName: string; fieldName: string; fullName: string }

export interface ViewsProps {
  games: SGame[]              // every game in the tournament
  dayGames: SGame[]           // games placed on the active date
  unscheduled: SGame[]        // games with no date/time/field (scratch excluded)
  activeDate: string
  slots: string[]             // "HH:MM" rows of the active day
  fields: SField[]            // visible fields
  divisions: string[]
  increment: number
  divColor: (div: string) => string
  fmtTime: (t: string) => string
  divAbbr: (div: string) => string
  issues: {
    conflict: Map<string, string>
    b2b: Map<string, string>
    gap: Map<string, string>
    bracket: Map<string, string>
  }
  filterDiv: string           // '__all__' or a division
  setFilterDiv: (d: string) => void
  onPlace: (gameId: string, time: string, field: string) => Promise<void> | void
  onUnschedule: (gameId: string) => Promise<void> | void
  saving: boolean
  /** Timeline only: 'fields-down' (time across, the default) or 'fields-across' (time down, like the grid). */
  orientation?: 'fields-down' | 'fields-across'
}

type IssueKind = 'conflict' | 'b2b' | 'bracket' | 'gap'
const KINDS: { kind: IssueKind; key: keyof ViewsProps['issues']; label: string; dot: string; bg: string; border: string }[] = [
  { kind: 'conflict', key: 'conflict', label: 'Double-booked', dot: '#ef4444', bg: '#fee2e2', border: '#ef4444' },
  { kind: 'b2b',      key: 'b2b',      label: 'Back-to-back',  dot: '#f59e0b', bg: '#fef3c7', border: '#f59e0b' },
  { kind: 'bracket',  key: 'bracket',  label: 'Bracket order', dot: '#ea580c', bg: '#ffedd5', border: '#ea580c' },
  { kind: 'gap',      key: 'gap',      label: 'Long gap',      dot: '#14b8a6', bg: '',        border: '' },
]

// Scroll a container while something is dragged near (or past) its edges. Browsers
// barely auto-scroll during a native drag and the mouse wheel does nothing then, so a
// game could not reach a slot below or right of the visible part of the board.
export function useDragAutoScroll(ref: { current: HTMLElement | null }, active: boolean, opts: { bottomInset?: number } = {}) {
  const bottomInset = opts.bottomInset ?? 0
  useEffect(() => {
    if (!active) return
    let vx = 0, vy = 0, raf = 0
    const ZONE = 80, MAX = 26
    const speed = (d: number) => (d >= ZONE ? 0 : Math.ceil(MAX * (1 - Math.max(0, d) / ZONE)))
    const onOver = (e: DragEvent) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const inX = e.clientX >= r.left && e.clientX <= r.right
      const inY = e.clientY >= r.top && e.clientY <= r.bottom + 40
      const bottom = r.bottom - bottomInset
      vy = inX ? (e.clientY < r.top + ZONE ? -speed(e.clientY - r.top) : e.clientY > bottom - ZONE ? speed(bottom - e.clientY) : 0) : 0
      vx = inY ? (e.clientX < r.left + ZONE && e.clientX >= r.left ? -speed(e.clientX - r.left) : e.clientX > r.right - ZONE ? speed(r.right - e.clientX) : 0) : 0
    }
    const stop = () => { vx = 0; vy = 0 }
    const tick = () => { const el = ref.current; if (el && (vx || vy)) el.scrollBy(vx, vy); raf = requestAnimationFrame(tick) }
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', stop)
    window.addEventListener('dragend', stop)
    raf = requestAnimationFrame(tick)
    return () => { window.removeEventListener('dragover', onOver); window.removeEventListener('drop', stop); window.removeEventListener('dragend', stop); cancelAnimationFrame(raf) }
  }, [active, ref, bottomInset])
}

type TypeFilter = 'all' | 'pool' | 'bracket'
const isBracket = (g: { gameNumber: string }) => g.gameNumber.startsWith('B')
const matchesType = (g: { gameNumber: string }, t: TypeFilter) => t === 'all' || (t === 'bracket') === isBracket(g)
function useTypeFilter(): [TypeFilter, (t: TypeFilter) => void] {
  const [t, setT] = useState<TypeFilter>('all')
  useEffect(() => { try { const v = localStorage.getItem('wr-sched-type'); if (v === 'pool' || v === 'bracket') setT(v) } catch {} }, [])
  return [t, (v: TypeFilter) => { setT(v); try { localStorage.setItem('wr-sched-type', v) } catch {} }]
}
function TypeToggle({ value, onChange, counts }: { value: TypeFilter; onChange: (t: TypeFilter) => void; counts?: { pool: number; bracket: number } }) {
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-slate-100 border border-slate-200">
      {([['all', 'All'], ['pool', 'Pool'], ['bracket', 'Bracket']] as const).map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full transition-colors ${value === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>
          {label}{counts && v !== 'all' ? <span className="font-medium opacity-70 ml-1">{counts[v]}</span> : null}
        </button>
      ))}
    </div>
  )
}

function humanTeam(t: string) {
  const m = (t || '').match(/^([WL])-(B\d+)$/i)
  if (m) return (m[1].toUpperCase() === 'W' ? 'Winner of ' : 'Loser of ') + m[2].toUpperCase()
  return t
}
function gameLabel(g: SGame, divAbbr: (d: string) => string) {
  return g.gameNumber.startsWith('B') ? `${divAbbr(g.division)}-${g.gameNumber}` : g.gameNumber
}
// Placement status of a game at a slot, from the teams' other games that day.
function placementStatus(g: SGame, slotIdx: number, dayGames: SGame[], slots: string[], increment: number): 'valid' | 'risk' | 'blocked' {
  const t = slots[slotIdx]
  const tMin = hm(t)
  let worst: 'valid' | 'risk' | 'blocked' = 'valid'
  for (const team of [g.team1, g.team2]) {
    if (!isRealTeam(team)) continue
    for (const o of dayGames) {
      if (o.id === g.id || o.division !== g.division) continue
      if (o.team1 !== team && o.team2 !== team) continue
      const d = Math.abs(hm(o.startTime) - tMin)
      if (d === 0) return 'blocked'
      if (d === increment) worst = 'risk'
    }
  }
  return worst
}
function hm(s: string) { const p = String(s || '').split(':'); return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1] || '0') || 0) }

function useIssueList(p: ViewsProps) {
  return useMemo(() => {
    const byGame = new Map<string, { kind: IssueKind; label: string; dot: string; text: string }[]>()
    const list: { kind: IssueKind; label: string; dot: string; text: string; gameId: string; division: string }[] = []
    const seen = new Set<string>()
    const gameById = new Map(p.games.map(g => [g.id, g]))
    for (const k of KINDS) {
      p.issues[k.key].forEach((msgs, id) => {
        const g = gameById.get(id); if (!g) return
        const items = msgs.split('\n').filter(Boolean)
        byGame.set(id, [...(byGame.get(id) ?? []), ...items.map(text => ({ kind: k.kind, label: k.label, dot: k.dot, text }))])
        items.forEach(text => {
          // the same message sits on both games of a pair; list it once
          const key = k.kind + '|' + text
          if (seen.has(key)) return
          seen.add(key)
          list.push({ kind: k.kind, label: k.label, dot: k.dot, text, gameId: id, division: g.division })
        })
      })
    }
    const order: Record<IssueKind, number> = { conflict: 0, b2b: 1, bracket: 2, gap: 3 }
    list.sort((a, b) => order[a.kind] - order[b.kind])
    return { byGame, list }
  }, [p.games, p.issues])
}

function worstOf(items: { kind: IssueKind }[] | undefined) {
  if (!items || items.length === 0) return null
  const order: IssueKind[] = ['conflict', 'b2b', 'bracket', 'gap']
  return order.find(k => items.some(i => i.kind === k)) ?? null
}
const KIND = (k: IssueKind | null) => KINDS.find(x => x.kind === k)

// ───────────────────────────────────────────────────────────────────────────────
// Shared bits
// ───────────────────────────────────────────────────────────────────────────────

function IssueBadge({ kind, count }: { kind: IssueKind; count: number }) {
  const k = KIND(kind)!
  const Icon = kind === 'conflict' ? AlertTriangle : kind === 'b2b' ? ArrowLeftRight : kind === 'bracket' ? Zap : Clock
  return (
    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center shadow ring-2 ring-white" style={{ background: k.dot, color: kind === 'b2b' ? '#0f172a' : '#fff' }}>
      <Icon size={11} />
      {count > 1 && <span className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white text-[8px] font-bold rounded-full min-w-[14px] h-[14px] px-0.5 flex items-center justify-center">{count}</span>}
    </span>
  )
}

// The division chips fold to one line while you work one division: just that chip
// (with an x to clear) and a "Divisions" button to reopen the full row. Picking a
// chip folds the row; clearing it opens it again.
function DivisionChips({ p, counts, open, setOpen }: { p: ViewsProps; counts: Record<string, { total: number; done: number }>; open: boolean; setOpen: (o: boolean) => void }) {
  const active = p.filterDiv !== '__all__' ? p.filterDiv : null
  if (!open) {
    return (
      <div className="flex items-center gap-1.5">
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full border bg-white text-slate-700 border-slate-200 hover:border-slate-300" title="Show every division">
          Divisions <span className="font-medium text-slate-400">{p.divisions.length}</span> <ChevronDown size={12} className="text-slate-400" />
        </button>
        {active ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold pl-2 pr-1 py-1 rounded-full border" style={{ background: p.divColor(active), borderColor: p.divColor(active), color: '#fff' }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,.85)' }} />
            {active}<span className="font-medium opacity-70">{counts[active]?.done ?? 0}/{counts[active]?.total ?? 0}</span>
            <button onClick={() => { p.setFilterDiv('__all__'); setOpen(true) }} aria-label="Show all divisions" className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/20"><X size={11} /></button>
          </span>
        ) : (
          <span className="text-xs text-slate-500">All divisions</span>
        )}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button onClick={() => setOpen(false)} aria-label="Collapse the division row" title="Collapse" className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ChevronUp size={14} /></button>
      <button onClick={() => p.setFilterDiv('__all__')}
        className={`text-xs font-bold px-3 py-1 rounded-full border transition-colors ${p.filterDiv === '__all__' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}>All</button>
      {p.divisions.map(d => {
        const on = p.filterDiv === d, c = p.divColor(d)
        return (
          <button key={d} onClick={() => { p.setFilterDiv(on ? '__all__' : d); if (!on) setOpen(false) }}
            className="inline-flex items-center gap-1.5 text-xs font-bold pl-2 pr-3 py-1 rounded-full border transition-colors"
            style={on ? { background: c, borderColor: c, color: '#fff' } : { background: '#fff', borderColor: '#e2e8f0', color: '#334155' }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? 'rgba(255,255,255,.85)' : c }} />
            {d}<span className="font-medium opacity-70">{counts[d]?.done ?? 0}/{counts[d]?.total ?? 0}</span>
          </button>
        )
      })}
    </div>
  )
}

function useCounts(games: SGame[], divisions: string[]) {
  return useMemo(() => {
    const c: Record<string, { total: number; done: number }> = {}
    divisions.forEach(d => { c[d] = { total: 0, done: 0 } })
    games.forEach(g => { if (!c[g.division]) c[g.division] = { total: 0, done: 0 }; c[g.division].total++; if (g.date && g.startTime && g.location) c[g.division].done++ })
    return c
  }, [games, divisions])
}

function SelectionBar({ p, sel, onCancel }: { p: ViewsProps; sel: SGame; onCancel: () => void }) {
  const placed = !!(sel.date && sel.startTime && sel.location)
  // Two lines of text and the buttons stacked beside them, so the bar stays short
  // (one row of chips tall) and never clips a long team name.
  return (
    <div className="flex items-stretch gap-2 pl-3 pr-1.5 py-1 rounded-xl text-white shadow-xl min-w-0 w-[460px] max-w-[92vw]" style={{ background: '#065f46' }}
      title={`${humanTeam(sel.team1)} vs ${humanTeam(sel.team2)} — click a green slot. Amber = back-to-back, striped = team busy.`}>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <div className="text-xs leading-tight truncate"><span className="text-emerald-200">{placed ? 'Moving' : 'Placing'}</span> <b>{gameLabel(sel, p.divAbbr)} · {humanTeam(sel.team1)} vs {humanTeam(sel.team2)}</b></div>
        <div className="text-[11px] leading-tight text-emerald-100 truncate">Click a green slot · amber = back-to-back · striped = busy</div>
      </div>
      <div className="flex flex-col gap-1 flex-shrink-0 justify-center">
        {placed && <button onClick={() => { p.onUnschedule(sel.id); onCancel() }} className="text-[11px] font-bold leading-none px-2.5 py-1 rounded-full bg-emerald-200 text-emerald-950 hover:bg-emerald-100">Unschedule</button>}
        <button onClick={onCancel} className="text-[11px] font-bold leading-none px-2.5 py-1 rounded-full border border-emerald-300/60 text-emerald-100 hover:bg-emerald-800">Cancel</button>
      </div>
    </div>
  )
}

const HINT = {
  // valid is quiet on purpose: most of the day is valid, and it should read as background
  valid:   { border: '#a7f3d0', bg: '#f0fdf4', text: '#34d399', label: 'Place here' },
  risk:    { border: '#f59e0b', bg: '#fffbeb', text: '#b45309', label: 'Back-to-back' },
  blocked: { border: '#ef4444', bg: 'repeating-linear-gradient(135deg,#fef2f2 0 6px,#fecaca 6px 8px)', text: '#b91c1c', label: 'Team busy' },
}

// ───────────────────────────────────────────────────────────────────────────────
// Timeline view
// ───────────────────────────────────────────────────────────────────────────────

export function TimelineView(p: ViewsProps) {
  const across = p.orientation === 'fields-across'
  const [selId, setSelId] = useState<string | null>(null)
  const [hover, setHover] = useState<{ id: string; x: number; y: number; below: boolean } | null>(null)
  // The details popover waits for a still pointer. Showing it on entry covered the
  // neighbouring tiles the moment you reached for a game to drag it.
  const hoverTimer = useRef<number | null>(null)
  const armHover = (h: { id: string; x: number; y: number; below: boolean }) => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(() => setHover(h), 550)
  }
  const disarmHover = (id?: string) => {
    if (hoverTimer.current) { window.clearTimeout(hoverTimer.current); hoverTimer.current = null }
    setHover(h => (h && (!id || h.id === id)) ? null : h)
  }
  useEffect(() => () => { if (hoverTimer.current) window.clearTimeout(hoverTimer.current) }, [])
  // Each rail collapses on its own (a scheduler working the board wants the
  // unscheduled list open and the issues panel out of the way, or the reverse).
  // "Fit day" is the shortcut for both at once. Remembered across visits.
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  useEffect(() => {
    try { const v = localStorage.getItem('wr-sched-rails'); if (v) { const o = JSON.parse(v); if (typeof o.left === 'boolean') setLeftOpen(o.left); if (typeof o.right === 'boolean') setRightOpen(o.right) } } catch {}
  }, [])
  const setRails = (left: boolean, right: boolean) => {
    setLeftOpen(left); setRightOpen(right)
    try { localStorage.setItem('wr-sched-rails', JSON.stringify({ left, right })) } catch {}
  }
  const fit = !leftOpen && !rightOpen
  const [tab, setTab] = useState<'issues' | 'day'>('issues')
  const [openDivs, setOpenDivs] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useTypeFilter()
  const [dragId, setDragId] = useState<string | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)
  // The floating "Moving…" bar covers the bottom of the board, so the scroll zone
  // starts above it.
  useDragAutoScroll(boardRef, !!dragId, { bottomInset: selId ? 64 : 0 })
  const [chipsOpen, setChipsOpenRaw] = useState(true)
  useEffect(() => { try { if (localStorage.getItem('wr-sched-chips') === 'closed') setChipsOpenRaw(false) } catch {} }, [])
  const setChipsOpen = (o: boolean) => { setChipsOpenRaw(o); try { localStorage.setItem('wr-sched-chips', o ? 'open' : 'closed') } catch {} }

  const { byGame, list: issueList } = useIssueList(p)
  const counts = useCounts(p.games, p.divisions)
  const sel = useMemo(() => p.games.find(g => g.id === selId) ?? null, [p.games, selId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelId(null); setHover(null) } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])
  // a placed game that got moved/unscheduled elsewhere: drop the stale selection
  useEffect(() => { if (selId && !p.games.some(g => g.id === selId)) setSelId(null) }, [p.games, selId])

  // A division chip and the Pool/Bracket toggle narrow the unscheduled list to just
  // that; on the board the same games stay put but fade, so nothing moves under you.
  const dim = (g: SGame) => (p.filterDiv !== '__all__' && g.division !== p.filterDiv) || !matchesType(g, typeFilter)
  const tint = (div: string) => p.divColor(div) + '1f'

  // games per team in its division (the "(n)" counts on cards)
  const teamCount = useMemo(() => {
    const m: Record<string, number> = {}
    p.games.filter(g => g.date && g.startTime).forEach(g => [g.team1, g.team2].forEach(t => { if (isRealTeam(t)) { const k = teamKey(g.division, t); m[k] = (m[k] ?? 0) + 1 } }))
    return m
  }, [p.games])

  const cellMap = useMemo(() => { const m: Record<string, SGame> = {}; p.dayGames.forEach(g => { m[g.startTime + '|' + g.location] = g }); return m }, [p.dayGames])
  const perSlot = p.slots.map(s => p.dayGames.filter(g => g.startTime === s).length)

  // unscheduled, grouped by division, filtered by search
  const lot = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const divs = p.filterDiv === '__all__' ? p.divisions : p.divisions.filter(d => d === p.filterDiv)
    return divs.map(d => ({
      div: d,
      items: p.unscheduled.filter(g => g.division === d && matchesType(g, typeFilter) && (!ql || [g.gameNumber, g.team1, g.team2, g.pool ?? ''].some(x => x.toLowerCase().includes(ql)))),
    })).filter(x => x.items.length > 0)
  }, [p.unscheduled, p.divisions, p.filterDiv, typeFilter, q])
  const lotCounts = useMemo(() => {
    const inDiv = p.unscheduled.filter(g => p.filterDiv === '__all__' || g.division === p.filterDiv)
    return { pool: inDiv.filter(g => !isBracket(g)).length, bracket: inDiv.filter(isBracket).length }
  }, [p.unscheduled, p.filterDiv])

  const dropTarget = (e: React.DragEvent) => e.dataTransfer.getData('gameId') || dragId
  // Dragging a placed game onto the unscheduled list (open or collapsed) takes it off
  // the board; it lands under its division there. Only a placed game lights it up.
  const [lotOver, setLotOver] = useState(false)
  const draggingPlaced = !!dragId && p.dayGames.some(g => g.id === dragId)
  const lotDrop = {
    onDragOver: (e: React.DragEvent) => { if (draggingPlaced) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!lotOver) setLotOver(true) } },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setLotOver(false) },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setLotOver(false); const id = dropTarget(e); setDragId(null); if (id && p.dayGames.some(g => g.id === id)) { setSelId(null); p.onUnschedule(id) } },
  }
  const place = async (g: SGame, time: string, field: string) => {
    if (placementStatus(g, p.slots.indexOf(time), p.dayGames, p.slots, p.increment) === 'blocked') return
    setSelId(null); setHover(null)
    await p.onPlace(g.id, time, field)
  }

  const slotCol = fit ? 'minmax(0, 1fr)' : '128px'
  const fieldCol = fit ? 'minmax(0, 1fr)' : '168px'
  const hovered = hover ? p.games.find(g => g.id === hover.id) : null
  const hoverIssues = hovered ? (byGame.get(hovered.id) ?? []) : []

  // "Day health" numbers
  const dayStart = p.slots[0], dayEnd = p.slots[p.slots.length - 1]
  const lastGameSlot = p.dayGames.length ? p.slots.slice().reverse().find(s => p.dayGames.some(g => g.startTime === s)) ?? null : null
  const usedCells = p.dayGames.length, totalCells = p.slots.length * p.fields.length
  const b2bCount = useMemo(() => new Set(Array.from(p.issues.b2b.values()).flatMap(v => v.split('\n'))).size, [p.issues.b2b])
  const conflictCount = useMemo(() => new Set(Array.from(p.issues.conflict.values()).flatMap(v => v.split('\n'))).size, [p.issues.conflict])

  return (
    <div className="flex-1 flex min-h-0 relative">
      {/* Left rail: unscheduled */}
      {leftOpen ? (
        <div {...lotDrop} className={`relative w-[232px] flex-shrink-0 flex flex-col border-r border-slate-200 min-h-0 transition-colors ${lotOver ? 'bg-orange-50' : 'bg-white'}`}>
          {draggingPlaced && (
            <div className={`absolute inset-1.5 z-10 rounded-xl border-2 border-dashed flex items-center justify-center text-xs font-bold pointer-events-none ${lotOver ? 'border-orange-500 bg-orange-100/80 text-orange-800' : 'border-orange-300 bg-white/70 text-orange-600'}`}>
              Drop here to unschedule
            </div>
          )}
          <div className="pl-3.5 pr-2 pt-2.5 pb-1.5 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Unscheduled</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">{p.unscheduled.length}</span>
            <button onClick={() => setRails(false, rightOpen)} aria-label="Collapse the unscheduled list" title="Collapse" className="ml-auto w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ChevronsLeft size={14} /></button>
          </div>
          <div className="px-3 pb-2 relative">
            <Search size={12} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 -mt-1" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Team or game #" aria-label="Search unscheduled games"
              className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </div>
          <div className="px-3 pb-2 flex items-center gap-2">
            <TypeToggle value={typeFilter} onChange={setTypeFilter} counts={lotCounts} />
          </div>
          {p.filterDiv !== '__all__' && (
            <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2 text-[11px] text-slate-600">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.divColor(p.filterDiv) }} />
              <span className="truncate flex-1">Only <b className="text-slate-800">{p.filterDiv}</b></span>
              <button onClick={() => p.setFilterDiv('__all__')} className="font-semibold text-teal-700 hover:underline flex-shrink-0">Show all</button>
            </div>
          )}
          <div className="flex-1 overflow-auto px-2 pb-3 space-y-2">
            {lot.length === 0 && <p className="text-xs text-slate-400 text-center py-8">{p.unscheduled.length === 0 ? 'Everything is on the grid.' : typeFilter !== 'all' || p.filterDiv !== '__all__' ? 'Nothing left to place with these filters.' : 'No games match.'}</p>}
            {lot.map(grp => {
              const open = openDivs[grp.div] ?? true
              const c = p.divColor(grp.div)
              return (
                <div key={grp.div}>
                  <button onClick={() => setOpenDivs(o => ({ ...o, [grp.div]: !open }))} className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-slate-50 text-left">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
                    <span className="text-xs font-bold text-slate-800 flex-1 truncate">{grp.div}</span>
                    <span className="text-[11px] text-slate-500">{grp.items.length}</span>
                    <ChevronDown size={12} className="text-slate-400 transition-transform" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} />
                  </button>
                  {open && (
                    <div className="space-y-1 mt-0.5">
                      {grp.items.map(g => {
                        const on = selId === g.id
                        return (
                          <button key={g.id} draggable
                            onDragStart={e => { e.dataTransfer.setData('gameId', g.id); e.dataTransfer.effectAllowed = 'move'; setDragId(g.id); setSelId(g.id) }}
                            onDragEnd={() => setDragId(null)}
                            onClick={() => setSelId(on ? null : g.id)}
                            className={`w-full text-left rounded-lg border px-2 py-1.5 transition-all cursor-grab active:cursor-grabbing ${on ? 'bg-slate-900 border-slate-900 ring-[3px] ring-teal-500/40' : dim(g) ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
                            style={{ borderLeft: `4px solid ${c}` }}>
                            <div className={`flex items-center gap-1.5 text-[10px] ${on ? 'text-slate-300' : 'text-slate-500'}`}><b className={on ? 'text-white' : 'text-slate-800'}>{gameLabel(g, p.divAbbr)}</b>{g.pool && <span>{g.pool}</span>}</div>
                            <div className={`text-xs font-bold leading-tight truncate ${on ? 'text-white' : 'text-slate-900'}`}>{humanTeam(g.team1)}</div>
                            <div className={`text-[11px] leading-tight truncate ${on ? 'text-slate-300' : 'text-slate-600'}`}>vs {humanTeam(g.team2)}</div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <button {...lotDrop} onClick={() => setRails(true, rightOpen)} aria-label="Show the unscheduled list" title={draggingPlaced ? 'Drop here to unschedule' : undefined} className={`w-10 flex-shrink-0 border-r flex flex-col items-center pt-3 gap-2 hover:bg-slate-50 ${lotOver ? 'bg-orange-50 border-orange-300' : draggingPlaced ? 'bg-orange-50/50 border-orange-200' : 'bg-white border-slate-200'}`}>
          <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">{p.unscheduled.length}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400" style={{ writingMode: 'vertical-rl' }}>Unscheduled</span>
        </button>
      )}

      {/* Center */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <div className="px-3 py-1.5 flex items-start gap-2 bg-white border-b border-slate-200 flex-shrink-0">
          <div className="flex-1 min-w-0 pt-0.5"><DivisionChips p={p} counts={counts} open={chipsOpen} setOpen={setChipsOpen} /></div>
          {!sel && <span className="text-xs text-slate-400 hidden 2xl:inline pt-1.5 flex-shrink-0">Click an unscheduled game, then a slot.</span>}
          <button onClick={() => (fit ? setRails(true, true) : setRails(false, false))} className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border flex-shrink-0 mt-0.5 ${fit ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`} title={fit ? 'Reopen both side panels' : (across ? 'Collapse both side panels so every field fits' : 'Collapse both side panels so the whole day fits')}>
            {fit ? <Minimize2 size={13} /> : <Maximize2 size={13} />} {across ? 'Fit fields' : 'Fit day'}
          </button>
        </div>
        <div className="flex-1 min-h-0 relative">
        {/* While a game is picked up, its bar floats over the bottom of the board so the
            chips row keeps its width and the bar is always in view. */}
        {/* While dragging, the bar is see-through to the pointer so the slots under it still take the drop. */}
        {sel && <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-40 transition-opacity ${dragId ? 'pointer-events-none opacity-30' : ''}`}><SelectionBar p={p} sel={sel} onCancel={() => setSelId(null)} /></div>}
        <div ref={boardRef} className="h-full overflow-auto relative" onClick={() => { if (hover) setHover(null) }}>
          {across ? (
            <div className="grid" style={{ gridTemplateColumns: `100px repeat(${p.fields.length}, ${fieldCol})`, gridAutoRows: '64px', minWidth: fit ? undefined : 'max-content' }}>
              {/* header: fields */}
              <div className="sticky top-0 left-0 z-30 h-11 bg-slate-50 border-b border-r border-slate-200" />
              {p.fields.map(f => {
                const n = p.dayGames.filter(g => g.location === f.fullName).length
                return (
                  <div key={f.fullName} className="sticky top-0 z-20 h-11 bg-slate-50 border-b border-slate-200 border-r border-slate-100 px-2.5 flex flex-col justify-center gap-0.5 min-w-0">
                    <span className="text-xs font-extrabold text-slate-900 truncate">{f.fieldName}</span>
                    <span className="text-[10px] text-slate-400 truncate">{f.venueName} · {n}</span>
                  </div>
                )
              })}
              {/* rows: time slots */}
              {p.slots.map((s, si) => renderSlotRow(s, si))}
            </div>
          ) : (
          <div className="grid" style={{ gridTemplateColumns: `96px repeat(${p.slots.length}, ${slotCol})`, gridAutoRows: '64px', minWidth: fit ? undefined : 'max-content' }}>
            {/* header */}
            <div className="sticky top-0 left-0 z-30 h-9 bg-slate-50 border-b border-r border-slate-200" />
            {p.slots.map((s, i) => (
              <div key={s} className="sticky top-0 z-20 h-9 bg-slate-50 border-b border-slate-200 border-r border-slate-100 px-2 pt-1.5 flex flex-col gap-1 min-w-0">
                <span className="text-[11px] font-bold text-slate-700 truncate">{p.fmtTime(s)}</span>
                <span className="h-1 rounded-full" style={{ width: `${Math.round(100 * perSlot[i] / Math.max(1, p.fields.length))}%`, background: perSlot[i] >= p.fields.length ? '#ef4444' : perSlot[i] ? '#14b8a6' : '#e2e8f0' }} />
              </div>
            ))}
            {/* rows */}
            {p.fields.map(f => renderFieldRow(f))}
          </div>
          )}

          {/* hover popover */}
          {hovered && hover && !dragId && !sel && (
            <div className="fixed z-[60] w-[268px] rounded-xl bg-slate-900 text-white px-3 py-2.5 shadow-xl pointer-events-none"
              style={{ left: Math.max(8, Math.min(hover.x - 134, (typeof window !== 'undefined' ? window.innerWidth : 1400) - 276)), top: hover.below ? hover.y + 6 : hover.y - 6, transform: hover.below ? undefined : 'translateY(-100%)' }}>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400"><span className="w-2 h-2 rounded-full" style={{ background: p.divColor(hovered.division) }} />{hovered.division}{hovered.pool ? ` · ${hovered.pool}` : ''} · <b className="text-white">{gameLabel(hovered, p.divAbbr)}</b></div>
              <div className="text-[13px] font-extrabold mt-0.5">{humanTeam(hovered.team1)} <span className="font-normal text-slate-400">vs</span> {humanTeam(hovered.team2)}</div>
              <div className="text-[11px] text-slate-300">{p.fmtTime(hovered.startTime)} · {hovered.location}</div>
              {hoverIssues.length === 0 ? (
                <div className="text-[11px] text-emerald-300 mt-1">No issues</div>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {hoverIssues.map((it, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-200"><span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: it.dot }} /><span><b>{it.label}:</b> {it.text}</span></li>
                  ))}
                </ul>
              )}
              <div className="text-[10px] text-slate-500 mt-1.5">Click to move · drag to another slot</div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Right rail: issues / day health */}
      {rightOpen ? (
        <div className="w-[264px] flex-shrink-0 flex flex-col bg-white border-l border-slate-200 min-h-0">
          <div className="flex items-center pl-3 pr-2 pt-2 gap-1 border-b border-slate-200">
            {(['issues', 'day'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-2 text-xs font-bold border-b-2 -mb-px ${tab === t ? 'text-slate-900 border-teal-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>
                {t === 'issues' ? <>Issues <span className={`ml-1 text-[10px] px-1.5 py-px rounded-full ${issueList.length ? 'bg-red-100 text-red-700' : 'bg-teal-50 text-teal-700'}`}>{issueList.length}</span></> : 'Day health'}
              </button>
            ))}
            <button onClick={() => setRails(leftOpen, false)} aria-label="Collapse the issues panel" title="Collapse" className="ml-auto mb-1 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ChevronsRight size={14} /></button>
          </div>
          {tab === 'issues' ? (
            <div className="flex-1 overflow-auto p-3 space-y-1.5">
              {issueList.length === 0 && <div className="rounded-xl bg-teal-50 border border-teal-100 text-teal-800 text-xs font-semibold text-center px-3 py-4">No issues on the schedule.</div>}
              {issueList.map((is, i) => (
                <button key={i} onClick={() => { const g = p.games.find(x => x.id === is.gameId); if (!g) return; p.setFilterDiv(g.division); setSelId(null); setHover(null); document.querySelector<HTMLElement>(`[data-tl-game="${g.id}"]`)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' }) }}
                  className="w-full text-left flex gap-2 items-start rounded-xl border border-slate-200 bg-white px-2.5 py-2 hover:border-slate-300 hover:shadow-sm">
                  <span className="mt-1 w-2 h-2 rounded-full flex-shrink-0" style={{ background: is.dot }} />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-extrabold text-slate-900">{is.label} <span className="font-medium text-slate-500">· {is.division}</span></span>
                    <span className="block text-[11px] text-slate-600 leading-snug">{is.text}</span>
                  </span>
                </button>
              ))}
              <div className="pt-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Still to place</div>
              {p.divisions.map(d => (
                <div key={d} className="flex items-center gap-2 text-[11px] text-slate-700"><span className="w-2 h-2 rounded-full" style={{ background: p.divColor(d) }} /><span className="flex-1 truncate">{d}</span><b>{(counts[d]?.total ?? 0) - (counts[d]?.done ?? 0)}</b><span className="text-slate-400">of {counts[d]?.total ?? 0}</span></div>
              ))}
            </div>
          ) : (
            <div className="flex-1 overflow-auto p-3 space-y-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">Games per slot · {p.fields.length} fields</div>
                <div className="flex items-end gap-[3px] h-16">
                  {p.slots.map((s, i) => { const mx = Math.max(1, ...perSlot); return <div key={s} title={`${p.fmtTime(s)}: ${perSlot[i]} games`} className="flex-1 rounded-t" style={{ height: `${Math.max(6, Math.round(100 * perSlot[i] / mx))}%`, background: perSlot[i] ? '#14b8a6' : '#e2e8f0' }} /> })}
                </div>
                <div className="flex justify-between text-[9px] text-slate-400 mt-1"><span>{p.fmtTime(dayStart)}</span><span>{p.fmtTime(dayEnd)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  [String(p.dayGames.length), 'scheduled today'],
                  [lastGameSlot ? p.fmtTime(lastGameSlot) : '—', 'last game starts'],
                  [`${totalCells ? Math.round(100 * usedCells / totalCells) : 0}%`, 'field slots used'],
                  [String(b2bCount), 'back-to-backs'],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-xl bg-slate-50 border border-slate-200 px-2.5 py-2"><div className={`text-xl font-extrabold ${l === 'back-to-backs' && b2bCount ? 'text-amber-700' : 'text-slate-900'}`}>{v}</div><div className="text-[10px] text-slate-500">{l}</div></div>
                ))}
              </div>
              {conflictCount > 0 && <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-[11px] px-3 py-2"><b>{conflictCount} double-booking{conflictCount === 1 ? '' : 's'}</b> — fix before publishing.</div>}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">By division · all days</div>
                {p.divisions.map(d => { const c = counts[d] ?? { total: 0, done: 0 }; return (
                  <div key={d} className="mb-2">
                    <div className="flex items-center gap-2 text-[11px] text-slate-700"><span className="w-2 h-2 rounded-full" style={{ background: p.divColor(d) }} /><span className="flex-1 font-semibold truncate">{d}</span><span className="text-slate-500">{c.done} / {c.total}</span></div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1"><div className="h-full" style={{ width: `${c.total ? Math.round(100 * c.done / c.total) : 0}%`, background: p.divColor(d) }} /></div>
                  </div>
                ) })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => setRails(leftOpen, true)} aria-label="Show the issues panel" className="w-10 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col items-center pt-3 gap-2 hover:bg-slate-50">
          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${issueList.length ? 'bg-red-100 text-red-700' : 'bg-teal-50 text-teal-700'}`}>{issueList.length}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400" style={{ writingMode: 'vertical-rl' }}>Issues</span>
        </button>
      )}
    </div>
  )

  // Plain render functions, not nested components: a nested component is a new type
  // every render, which remounts its DOM and cancels an in-progress drag.
  // One cell of the day: a placed game, or a drop target while a game is picked up.
  function renderCell(f: SField, s: string, si: number) {
    const g = cellMap[s + '|' + f.fullName]
    const status = sel && !g ? placementStatus(sel, si, p.dayGames, p.slots, p.increment) : null
    const h = status ? HINT[status] : null
    return (
      <div key={f.fullName + '|' + s} className="relative border-b border-slate-200 border-r border-slate-100 min-w-0"
        onDragOver={e => { if (!g) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
        onDrop={e => { e.preventDefault(); const id = dropTarget(e); const src = id ? p.games.find(x => x.id === id) : null; if (src && !g) place(src, s, f.fullName); setDragId(null) }}
        onClick={() => { if (!g && sel && status !== 'blocked') place(sel, s, f.fullName) }}
        style={{ cursor: !g && status && status !== 'blocked' ? 'copy' : undefined }}>
        {g ? renderGameCard(g) : h ? (
          <div className="absolute inset-1 rounded-lg flex items-center justify-center text-[10px] font-bold" style={{ border: `1.5px dashed ${h.border}`, background: h.bg, color: h.text }}>{h.label}</div>
        ) : null}
      </div>
    )
  }

  // fields-down: one row per field, a cell per time slot
  function renderFieldRow(f: SField) {
    const n = p.dayGames.filter(g => g.location === f.fullName).length
    return (
      <Fragment key={f.fullName}>
        <div className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-2.5 flex flex-col justify-center gap-0.5 min-w-0">
          <span className="text-xs font-extrabold text-slate-900 truncate">{f.fieldName}</span>
          <span className="text-[10px] text-slate-400 truncate">{f.venueName} · {n}</span>
        </div>
        {p.slots.map((s, si) => renderCell(f, s, si))}
      </Fragment>
    )
  }

  // fields-across: one row per time slot, a cell per field
  function renderSlotRow(s: string, si: number) {
    const n = perSlot[si]
    return (
      <Fragment key={s}>
        <div className="sticky left-0 z-10 bg-white border-b border-r border-slate-200 px-2.5 flex flex-col justify-center gap-1 min-w-0">
          <span className="text-xs font-extrabold text-slate-900 truncate">{p.fmtTime(s)}</span>
          <span className="h-1 rounded-full" style={{ width: `${Math.round(100 * n / Math.max(1, p.fields.length))}%`, background: n >= p.fields.length ? '#ef4444' : n ? '#14b8a6' : '#e2e8f0' }} />
        </div>
        {p.fields.map(f => renderCell(f, s, si))}
      </Fragment>
    )
  }

  function renderGameCard(g: SGame) {
    const c = p.divColor(g.division)
    const items = byGame.get(g.id)
    const worst = worstOf(items)
    const k = KIND(worst)
    const on = selId === g.id, d = dim(g)
    const done = g.isCanceled || (g.score1 != null && g.score2 != null)
    const bg = on ? '#0f172a' : d ? '#f8fafc' : worst === 'conflict' || worst === 'b2b' || worst === 'bracket' ? k!.bg : tint(g.division)
    return (
      <div key={g.id} draggable data-tl-game={g.id}
        onDragStart={e => { e.dataTransfer.setData('gameId', g.id); e.dataTransfer.effectAllowed = 'move'; setDragId(g.id); setSelId(g.id); disarmHover() }}
        onMouseDown={() => disarmHover()}
        onDragEnd={() => setDragId(null)}
        onClick={e => { e.stopPropagation(); setSelId(on ? null : g.id); disarmHover() }}
        onMouseEnter={e => { if (dragId || sel) return; const r = e.currentTarget.getBoundingClientRect(); armHover({ id: g.id, x: r.left + r.width / 2, y: r.bottom, below: window.innerHeight - r.bottom > 170 }) }}
        onMouseLeave={() => disarmHover(g.id)}
        className={`absolute inset-1 rounded-lg px-1.5 py-1 flex flex-col gap-px overflow-hidden cursor-grab active:cursor-grabbing transition-shadow ${on ? '' : 'hover:shadow-md'} ${done ? 'opacity-70' : ''}`}
        // Selected: dark card, but the division still shows: its stripe stays and the
        // selection ring takes the division color instead of a generic teal.
        style={{ background: bg, border: `1px solid ${on ? '#0f172a' : k && worst !== 'gap' ? k.border : d ? '#f1f5f9' : '#e2e8f0'}`, borderLeft: `${on ? 5 : 4}px solid ${d && !on ? '#cbd5e1' : c}`, boxShadow: on ? `0 0 0 3px ${c}66` : undefined }}>
        <div className={`flex items-center gap-1 text-[9px] leading-none whitespace-nowrap ${on ? 'text-slate-300' : 'text-slate-500'}`}>
          <b style={{ color: on ? '#fff' : d ? '#94a3b8' : c }}>{g.gameNumber}</b>
          <span className="font-semibold truncate" style={{ color: on ? '#cbd5e1' : d ? '#94a3b8' : c }} title={g.division}>{p.divAbbr(g.division)}</span>
          {g.pool && <span className="truncate">{g.pool}</span>}
          {g.isCanceled && <span className="ml-auto text-red-600 font-bold">CANC</span>}
        </div>
        <div className={`text-[11px] font-bold leading-tight truncate ${on ? 'text-white' : 'text-slate-900'}`}>{humanTeam(g.team1)}{teamCount[teamKey(g.division, g.team1)] ? <span className={`font-normal ${on ? 'text-slate-400' : 'text-slate-500'}`}> ({teamCount[teamKey(g.division, g.team1)]})</span> : null}</div>
        <div className={`text-[10px] leading-tight truncate ${on ? 'text-slate-300' : 'text-slate-600'}`}>{humanTeam(g.team2)}{teamCount[teamKey(g.division, g.team2)] ? <span className="text-slate-400"> ({teamCount[teamKey(g.division, g.team2)]})</span> : null}</div>
        {worst && <IssueBadge kind={worst} count={items?.length ?? 0} />}
      </div>
    )
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Team lanes view
// ───────────────────────────────────────────────────────────────────────────────

export function TeamLanesView(p: ViewsProps) {
  const firstDiv = p.divisions.find(d => p.games.some(g => g.division === d)) ?? p.divisions[0] ?? ''
  const div = p.filterDiv !== '__all__' ? p.filterDiv : firstDiv
  const [selId, setSelId] = useState<string | null>(null)
  const [slot, setSlot] = useState<string | null>(null)
  const counts = useCounts(p.games, p.divisions)
  const { byGame } = useIssueList(p)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelId(null); setSlot(null) } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { setSelId(null); setSlot(null) }, [div])

  const mine = useMemo(() => p.games.filter(g => g.division === div), [p.games, div])
  const dayMine = useMemo(() => p.dayGames.filter(g => g.division === div), [p.dayGames, div])
  const [typeFilter, setTypeFilter] = useTypeFilter()
  const todoAll = mine.filter(g => !g.date || !g.startTime || !g.location)
  const todo = todoAll.filter(g => matchesType(g, typeFilter))
  const sel = mine.find(g => g.id === selId) ?? null
  const c = p.divColor(div)
  const tint = c + '1f'

  // team -> slot -> games (this day, this division)
  const at = useMemo(() => {
    const m: Record<string, Record<string, SGame[]>> = {}
    dayMine.forEach(g => [g.team1, g.team2].forEach(t => { if (!isRealTeam(t)) return; (m[t] = m[t] ?? {}); (m[t][g.startTime] = m[t][g.startTime] ?? []).push(g) }))
    return m
  }, [dayMine])
  // pools -> teams (from every game of the division, any day)
  const pools = useMemo(() => {
    const ps: Record<string, { teams: Set<string>; games: number }> = {}
    mine.forEach(g => { const k = g.pool ?? (g.gameNumber.startsWith('B') ? 'Bracket' : 'No pool'); ps[k] = ps[k] ?? { teams: new Set(), games: 0 }; ps[k].games++; [g.team1, g.team2].forEach(t => { if (isRealTeam(t)) ps[k].teams.add(t) }) })
    // Pools are often named just "1", "2"; say "Pool 1". Groups with no real teams (a
    // bracket made only of seeds) have nothing to show as lanes.
    const label = (k: string) => (/pool|bracket/i.test(k) ? k : `Pool ${k}`)
    return Object.keys(ps).sort().map(k => ({ name: label(k), games: ps[k].games, teams: Array.from(ps[k].teams).sort() })).filter(x => x.teams.length > 0)
  }, [mine])

  const busyAt = (s: string) => new Set(p.dayGames.filter(g => g.startTime === s).map(g => g.location))
  const statusFor = (s: string): 'valid' | 'risk' | 'blocked' | 'full' | null => {
    if (!sel) return null
    if (busyAt(s).size >= p.fields.length) return 'full'
    return placementStatus(sel, p.slots.indexOf(s), p.dayGames, p.slots, p.increment)
  }
  const head = { valid: ['#ecfdf5', '#047857'], risk: ['#fffbeb', '#b45309'], blocked: ['#fef2f2', '#b91c1c'], full: ['#f1f5f9', '#94a3b8'] } as const

  const nextSlot = (s: string) => p.slots[p.slots.indexOf(s) + 1]
  const prevSlot = (s: string) => p.slots[p.slots.indexOf(s) - 1]

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50">
      <div className="px-3 py-2 bg-white border-b border-slate-200 flex-shrink-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {p.divisions.map(d => { const on = d === div, cc = p.divColor(d); return (
              <button key={d} onClick={() => p.setFilterDiv(d)} className="inline-flex items-center gap-1.5 text-xs font-bold pl-2 pr-3 py-1 rounded-full border"
                style={on ? { background: cc, borderColor: cc, color: '#fff' } : { background: '#fff', borderColor: '#e2e8f0', color: '#334155' }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? 'rgba(255,255,255,.85)' : cc }} />{d}<span className="font-medium opacity-70">{counts[d]?.done ?? 0}/{counts[d]?.total ?? 0}</span>
              </button>
            ) })}
          </div>
          <div className="flex-1" />
          <span className="text-xs text-slate-500 hidden lg:inline">Rest target <b className="text-slate-800">1 slot</b> · amber = back-to-back · red = double-booked</span>
        </div>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 pt-0.5 flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2"><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Unscheduled</span><span className="text-lg font-extrabold text-orange-700 leading-tight">{todo.length}</span></div>
            <TypeToggle value={typeFilter} onChange={setTypeFilter} counts={{ pool: todoAll.filter(g => !isBracket(g)).length, bracket: todoAll.filter(isBracket).length }} />
          </div>
          <div className="flex-1 flex flex-wrap gap-1.5 min-h-[36px] max-h-24 overflow-auto">
            {todo.length === 0 && <span className="text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-100 rounded-full px-3 py-1.5">{todoAll.length === 0 ? `Every game in ${div} is on the grid.` : `No ${typeFilter} games left to place in ${div}.`}</span>}
            {todo.map(g => { const on = selId === g.id; return (
              <button key={g.id} onClick={() => { setSelId(on ? null : g.id); setSlot(null) }}
                className={`text-left rounded-lg border px-2 py-1 leading-tight ${on ? 'bg-slate-900 border-slate-900 ring-[3px] ring-teal-500/40 text-white' : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'}`} style={{ borderLeft: `4px solid ${c}` }}>
                <div className={`text-[9px] ${on ? 'text-slate-300' : 'text-slate-500'}`}><b style={{ color: on ? '#6ee7b7' : c }}>{gameLabel(g, p.divAbbr)}</b>{g.pool ? ` · ${g.pool}` : ''}{g.date && g.date !== p.activeDate ? ` · ${g.date}` : ''}</div>
                <div className="text-[11px] font-bold whitespace-nowrap">{humanTeam(g.team1)} <span className="font-normal opacity-60">vs</span> {humanTeam(g.team2)}</div>
              </button>
            ) })}
          </div>
          {sel && (
            <div className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-full bg-slate-900 text-white text-xs flex-shrink-0 self-start">
              <span>Pick a time in the header for <b>{gameLabel(sel, p.divAbbr)}</b></span>
              {sel.date && sel.startTime && <button onClick={() => { p.onUnschedule(sel.id); setSelId(null); setSlot(null) }} className="px-2.5 py-1 rounded-full border border-slate-600 text-red-200 font-bold">Unschedule</button>}
              <button onClick={() => { setSelId(null); setSlot(null) }} className="px-2.5 py-1 rounded-full bg-slate-700 font-bold">Cancel</button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto relative min-h-0">
        <div className="grid min-w-max relative" style={{ gridTemplateColumns: `236px repeat(${p.slots.length}, 92px)` }}>
          {/* header */}
          <div className="sticky top-0 left-0 z-30 h-11 bg-slate-50 border-b border-r border-slate-200 px-3 flex flex-col justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 truncate">{div || 'No division'}</span>
            <span className="text-[11px] text-slate-500">{pools.reduce((n, x) => n + x.teams.length, 0)} teams · {pools.length} pool{pools.length === 1 ? '' : 's'}</span>
          </div>
          {p.slots.map(s => {
            const st = statusFor(s)
            const free = p.fields.length - busyAt(s).size
            const active = slot === s
            const pal = st ? head[st] : null
            const clickable = !!st && st !== 'blocked' && st !== 'full'
            return (
              <button key={s} onClick={() => { if (clickable) setSlot(active ? null : s) }} disabled={!!sel && !clickable}
                className="sticky top-0 z-20 h-11 border-b border-slate-200 border-r border-slate-100 px-1.5 py-1 flex flex-col items-start gap-0.5 text-left disabled:cursor-default"
                style={{ background: active ? '#0f172a' : pal ? pal[0] : '#f8fafc', cursor: clickable ? 'pointer' : 'default' }}>
                <span className="text-[11px] font-bold" style={{ color: active ? '#fff' : pal ? pal[1] : '#334155' }}>{p.fmtTime(s)}</span>
                <span className="text-[9px] whitespace-nowrap" style={{ color: active ? '#cbd5e1' : pal ? pal[1] : '#94a3b8' }}>
                  {st === 'blocked' ? 'team busy' : st === 'risk' ? 'back-to-back' : st === 'full' ? 'no fields' : `${free} free`}
                </span>
              </button>
            )
          })}
          {/* pools */}
          {pools.map(pool => renderPool(pool))}
          {/* footer: fields free */}
          <div className="sticky left-0 bottom-0 z-30 h-9 bg-slate-900 text-white px-3 flex items-center text-[10px] font-semibold uppercase tracking-widest">Fields free · of {p.fields.length}</div>
          {p.slots.map(s => { const n = p.fields.length - busyAt(s).size; return (
            <div key={s} className="sticky bottom-0 z-20 h-9 bg-slate-900 border-r border-slate-800 flex items-center justify-center text-sm font-extrabold" style={{ color: n === 0 ? '#f87171' : n <= 2 ? '#fbbf24' : '#6ee7b7' }}>{n}</div>
          ) })}

          {/* field chooser */}
          {sel && slot && (
            <div className="absolute z-40 w-56 rounded-xl bg-white border border-slate-200 shadow-xl p-2.5 space-y-1.5" style={{ left: Math.min(236 + p.slots.indexOf(slot) * 92, 236 + p.slots.length * 92 - 230), top: 48 }}>
              <div className="text-[11px] font-extrabold">{p.fmtTime(slot)} · pick a field</div>
              <div className="text-[10px] text-slate-500 truncate">{humanTeam(sel.team1)} vs {humanTeam(sel.team2)}</div>
              <div className="grid grid-cols-3 gap-1">
                {p.fields.map(f => { const busy = busyAt(slot).has(f.fullName); return (
                  <button key={f.fullName} disabled={busy || p.saving} onClick={async () => { const s = slot; setSelId(null); setSlot(null); await p.onPlace(sel.id, s, f.fullName) }}
                    className={`text-[11px] font-bold rounded-lg border px-1 py-1.5 truncate ${busy ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'}`} title={f.fullName}>{f.fieldName}</button>
                ) })}
              </div>
              <button onClick={() => setSlot(null)} className="w-full text-[11px] font-semibold text-slate-600 border border-slate-200 rounded-full py-1 hover:bg-slate-50">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  function renderPool(pool: { name: string; games: number; teams: string[] }) {
    return (
      <Fragment key={pool.name}>
        <div className="sticky left-0 z-10 h-6 bg-slate-100 border-b border-slate-200 px-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-600" style={{ gridColumn: '1 / -1' }}>
          <span className="w-2 h-2 rounded-full" style={{ background: c }} />{pool.name}<span className="font-medium normal-case tracking-normal text-slate-400">· {pool.games} games</span>
        </div>
        {pool.teams.map(team => renderLane(team))}
      </Fragment>
    )
  }

  function renderLane(team: string) {
    const m = at[team] ?? {}
    const teamGames = mine.filter(g => g.team1 === team || g.team2 === team)
    const placed = teamGames.filter(g => g.date && g.startTime && g.location).length
    const played = Object.keys(m).sort((a, b) => hm(a) - hm(b))
    const w = { v: 'ok' as 'ok' | 'adj' | 'dbl' }
    const inSel = !!sel && (sel.team1 === team || sel.team2 === team)
    const cells = p.slots.map(s => {
      const gs = m[s] ?? []
      const between = played.length > 1 && hm(s) > hm(played[0]) && hm(s) < hm(played[played.length - 1]) && gs.length === 0
      if (gs.length === 0) return { s, g: null as SGame | null, between, dbl: false, adj: false }
      const dbl = gs.length > 1, adj = !!(m[prevSlot(s)] || m[nextSlot(s)])
      if (dbl) w.v = 'dbl'; else if (adj && w.v !== 'dbl') w.v = 'adj'
      return { s, g: gs[0], between: false, dbl, adj }
    })
    const worst = w.v
    const dot = worst === 'dbl' ? '#ef4444' : worst === 'adj' ? '#f59e0b' : placed < teamGames.length ? '#cbd5e1' : '#10b981'
    return (
      <Fragment key={team}>
        <div className="sticky left-0 z-10 h-11 border-b border-r border-slate-200 px-2.5 flex items-center gap-2 min-w-0" style={{ background: inSel ? '#f0fdfa' : '#fff', borderLeft: `4px solid ${c}` }}>
          <span className="text-xs font-bold text-slate-900 truncate flex-1" title={team}>{team}</span>
          <span className={`text-[10px] font-semibold whitespace-nowrap ${placed < teamGames.length ? 'text-orange-700' : 'text-slate-500'}`}>{placed} of {teamGames.length}</span>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} title={worst === 'dbl' ? 'Double-booked' : worst === 'adj' ? 'Has a back-to-back' : placed < teamGames.length ? 'Games still to place' : 'All placed, rested'} />
        </div>
        {cells.map(cell => (
          <div key={cell.s} className="relative h-11 border-b border-slate-200 border-r border-slate-100">
            {cell.g ? (
              <button onClick={() => { setSelId(selId === cell.g!.id ? null : cell.g!.id); setSlot(null) }}
                className={`absolute inset-y-1 inset-x-[3px] rounded-md px-1.5 flex flex-col justify-center gap-px overflow-hidden text-left ${selId === cell.g.id ? 'ring-[3px] ring-teal-500/40' : 'hover:shadow'}`}
                style={{ background: cell.dbl ? '#fee2e2' : cell.adj ? '#fef3c7' : tint, border: `1px solid ${cell.dbl ? '#ef4444' : cell.adj ? '#f59e0b' : c}` }}
                title={(byGame.get(cell.g.id) ?? []).map(i => `${i.label}: ${i.text}`).join('\n') || `${cell.g.team1} vs ${cell.g.team2}`}>
                <div className="text-[10px] font-bold text-slate-900 truncate">vs {humanTeam(cell.g.team1 === team ? cell.g.team2 : cell.g.team1)}</div>
                <div className="text-[9px] text-slate-500 truncate">{p.fields.find(f => f.fullName === cell.g!.location)?.fieldName ?? cell.g.location} · {gameLabel(cell.g, p.divAbbr)}</div>
              </button>
            ) : cell.between ? (
              <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-slate-200" />
            ) : null}
          </div>
        ))}
      </Fragment>
    )
  }
}
