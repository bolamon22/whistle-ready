'use client'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, Check, Clock, Zap, ChevronDown, ChevronUp, Ban, ChevronsLeft, ChevronsRight, FoldHorizontal, FoldVertical, GripVertical, UnfoldHorizontal, UnfoldVertical, Maximize2, Minimize2, Search, X, PanelLeft, PanelTop, Ruler } from 'lucide-react'
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
  /** Only played on a certain result (lib/ifNeeded); dropped otherwise. */
  ifNeeded?: boolean
  /** true when the bracket itself names it "If needed" (so the toggle can't clear it) */
  ifNeededFromBracket?: boolean
  /** From the Bracket builder: the game's name and section (winners / consolation / ...) */
  bracketLabel?: string
  bracketSection?: string
}
export interface SField { venueName: string; fieldName: string; fullName: string; divRestrictions?: string[] }

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
  /** false = not placed (e.g. declined a warning), so the view keeps the game selected */
  onPlace: (gameId: string, time: string, field: string) => Promise<void | boolean> | void | boolean
  onUnschedule: (gameId: string) => Promise<void> | void
  saving: boolean
  /** Timeline only: 'fields-down' (time across, the default) or 'fields-across' (time down, like the grid). */
  orientation?: 'fields-down' | 'fields-across'
  /** Timeline/Board: per-tournament key for the remembered minimized fields and times. */
  prefsKey?: string
  /** Timeline/Board: a field header dropped on another takes its place. The page saves the order. */
  onReorderFields?: (fromFullName: string, toFullName: string) => void
  /** Parking lot docked across the top of the board instead of the left rail (the Grid has had this; Bo flips between the two). */
  lotOnTop?: boolean
  onLotOnTop?: (top: boolean) => void
  /** Two placed games trade date, time and field (the Grid's swap, on the Board). */
  onSwap?: (aId: string, bId: string) => Promise<void> | void
  /** Field closed at this start time on the active day (all day or a window): nothing can be placed there. */
  isFieldClosed?: (fullName: string, time: string) => boolean
  /** Header text when any part of the day is closed ("Closed today", "Closed from 1:00 PM"); null when open. */
  closedLabel?: (fullName: string) => string | null
  /** Opens the close/reopen dialog for a field. */
  onToggleClosed?: (fullName: string) => void
  /** Mark or unmark a game as "If needed" (only played on a certain result). */
  onToggleIfNeeded?: (gameId: string) => void
  /** Setup > Venues division limits: false when this field is set for other divisions only (e.g. too small). */
  fieldAllows?: (fullName: string, division: string) => boolean
}

type IssueKind = 'conflict' | 'closed' | 'field' | 'b2b' | 'bracket' | 'gap'
const KINDS: { kind: IssueKind; key: keyof ViewsProps['issues'] | null; label: string; dot: string; bg: string; border: string }[] = [
  { kind: 'conflict', key: 'conflict', label: 'Double-booked', dot: '#ef4444', bg: '#fee2e2', border: '#ef4444' },
  // not in p.issues: computed from isFieldClosed + dayGames in useIssueList
  { kind: 'closed',   key: null,       label: 'Field closed',  dot: '#dc2626', bg: '#fee2e2', border: '#dc2626' },
  // not in p.issues either: computed from fieldAllows (Setup's division limits per field)
  { kind: 'field',    key: null,       label: 'Wrong field',   dot: '#c026d3', bg: '#fae8ff', border: '#c026d3' },
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
// White or dark text on a division's color, whichever stands out more (WCAG
// contrast), so both a pale division and a mid teal read on their chip.
function inkOn(hex: string): string {
  const c = String(hex || '').replace('#', '')
  if (!/^[0-9a-f]{6}/i.test(c)) return '#ffffff'
  const lin = (i: number) => { const v = parseInt(c.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4)
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0718 ? '#ffffff' : '#1e293b'   // 0.0718 = slate-800's luminance + 0.05
}
// "If needed" marker: violet, dashed, never mistaken for an issue color.
const IF_BORDER = '#7c3aed'
function IfTag({ on, mini = false }: { on?: boolean; mini?: boolean }) {
  return <span title="If needed: only played on a certain result" className={`flex-shrink-0 rounded font-extrabold uppercase tracking-wide leading-none ${mini ? 'text-[7px] px-[3px] py-[2px]' : 'text-[8px] px-1 py-[2px]'} ${on ? 'bg-violet-300 text-violet-950' : 'bg-violet-100 text-violet-700'}`}>{mini ? 'If' : 'If needed'}</span>
}
// Consolation games (the bracket's consolation section): no title at stake, so
// they can go wherever there's room once their feeders are set.
function ConsTag({ g, on, mini = false }: { g: SGame; on?: boolean; mini?: boolean }) {
  return <span title={`${g.bracketLabel || 'Consolation'}: consolation game, flexible on time`} className={`flex-shrink-0 rounded font-extrabold uppercase tracking-wide leading-none ${mini ? 'text-[7px] px-[3px] py-[2px]' : 'text-[8px] px-1 py-[2px]'} ${on ? 'bg-slate-300 text-slate-900' : 'bg-slate-200 text-slate-600'}`}>{mini ? 'Con' : 'Consolation'}</span>
}
const isCons = (g: SGame) => !g.ifNeeded && g.bracketSection === 'consolation'
// Championship games (the bracket's championship section): the ones that matter
// most, usually the last thing a division plays.
function ChampTag({ g, on, mini = false }: { g: SGame; on?: boolean; mini?: boolean }) {
  return <span title={`${g.bracketLabel || 'Championship'}: the division's title game`} className={`flex-shrink-0 rounded font-extrabold uppercase tracking-wide leading-none ${mini ? 'text-[7px] px-[3px] py-[2px]' : 'text-[8px] px-1 py-[2px]'} ${on ? 'bg-yellow-300 text-yellow-950' : 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300'}`}>{mini ? 'Champ' : 'Championship'}</span>
}
// One marker per game: If needed, Championship, Consolation, or nothing.
function GameTag({ g, on, mini = false }: { g: SGame; on?: boolean; mini?: boolean }) {
  if (g.ifNeeded) return <IfTag on={on} mini={mini} />
  if (g.bracketSection === 'championship') return <ChampTag g={g} on={on} mini={mini} />
  if (isCons(g)) return <ConsTag g={g} on={on} mini={mini} />
  return null
}
const poolLabel = (pool: string) => (/pool|bracket/i.test(pool) ? pool : `Pool ${pool}`)

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
// A bracket game can't start until the games feeding it ("W-B3", "L-B4") have
// started earlier; right after one is a back-to-back for whoever advances. Only
// placed feeders count: an unplaced one says nothing about this slot yet.
// Same rule as the "Bracket order" issue (page.tsx), checked before placing.
function bracketTiming(g: SGame, time: string, date: string, games: SGame[], increment: number): { early: string | null; b2b: boolean } {
  let early: string | null = null, b2b = false
  const tMin = hm(time)
  for (const t of [g.team1, g.team2]) {
    const m = (t || '').match(/^[WL]-(B\d+)$/i)
    if (!m) continue
    const f = games.find(x => x.division === g.division && x.gameNumber.toUpperCase() === m[1].toUpperCase())
    if (!f || !f.date || !f.startTime) continue
    if (f.date > date || (f.date === date && hm(f.startTime) >= tMin)) { early = early ?? f.gameNumber; continue }
    if (f.date === date && tMin - hm(f.startTime) === increment) b2b = true
  }
  return { early, b2b }
}
function hm(s: string) { const p = String(s || '').split(':'); return (parseInt(p[0]) || 0) * 60 + (parseInt(p[1] || '0') || 0) }

function useIssueList(p: ViewsProps) {
  return useMemo(() => {
    const byGame = new Map<string, { kind: IssueKind; label: string; dot: string; text: string }[]>()
    const list: { kind: IssueKind; label: string; dot: string; text: string; gameId: string; division: string }[] = []
    const seen = new Set<string>()
    const gameById = new Map(p.games.map(g => [g.id, g]))
    for (const k of KINDS) {
      if (!k.key) continue
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
    // Games sitting on a field that is closed today: they have to move before publish.
    const closedKind = KINDS.find(k => k.kind === 'closed')!
    if (p.isFieldClosed) {
      for (const g of p.dayGames) {
        if (!g.location || !g.startTime || !p.isFieldClosed(g.location, g.startTime)) continue
        const field = p.fields.find(f => f.fullName === g.location)?.fieldName ?? g.location
        const text = `${g.gameNumber} is on ${field} at ${p.fmtTime(g.startTime)}, when it is closed. Move it.`
        byGame.set(g.id, [...(byGame.get(g.id) ?? []), { kind: 'closed', label: closedKind.label, dot: closedKind.dot, text }])
        list.push({ kind: 'closed', label: closedKind.label, dot: closedKind.dot, text, gameId: g.id, division: g.division })
      }
    }
    // Games on a field that Setup limits to other divisions (a small field, say).
    const fieldKind = KINDS.find(k => k.kind === 'field')!
    if (p.fieldAllows) {
      for (const g of p.dayGames) {
        if (!g.location || p.fieldAllows(g.location, g.division)) continue
        const field = p.fields.find(f => f.fullName === g.location)?.fieldName ?? g.location
        const text = `${g.gameNumber} (${g.division}) is on ${field}, which Setup limits to other divisions. Move it.`
        byGame.set(g.id, [...(byGame.get(g.id) ?? []), { kind: 'field', label: fieldKind.label, dot: fieldKind.dot, text }])
        list.push({ kind: 'field', label: fieldKind.label, dot: fieldKind.dot, text, gameId: g.id, division: g.division })
      }
    }
    const order: Record<IssueKind, number> = { conflict: 0, closed: 1, field: 2, b2b: 3, bracket: 4, gap: 5 }
    list.sort((a, b) => order[a.kind] - order[b.kind])
    return { byGame, list }
  }, [p.games, p.issues, p.isFieldClosed, p.fieldAllows, p.dayGames, p.fields, p.fmtTime])
}

function worstOf(items: { kind: IssueKind }[] | undefined) {
  if (!items || items.length === 0) return null
  const order: IssueKind[] = ['conflict', 'closed', 'field', 'b2b', 'bracket', 'gap']
  return order.find(k => items.some(i => i.kind === k)) ?? null
}
const KIND = (k: IssueKind | null) => KINDS.find(x => x.kind === k)

// ───────────────────────────────────────────────────────────────────────────────
// Shared bits
// ───────────────────────────────────────────────────────────────────────────────

function IssueBadge({ kind, count }: { kind: IssueKind; count: number }) {
  const k = KIND(kind)!
  const Icon = kind === 'conflict' ? AlertTriangle : kind === 'closed' ? Ban : kind === 'field' ? Ruler : kind === 'b2b' ? ArrowLeftRight : kind === 'bracket' ? Zap : Clock
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
interface Focus { divs: Set<string> | null; toggle: (d: string) => void; only: (d: string) => void; clear: () => void }
function DivisionChips({ p, counts, open, setOpen, focus }: { p: ViewsProps; counts: Record<string, DivCount>; open: boolean; setOpen: (o: boolean) => void; focus: Focus }) {
  // "+" opens the row in add mode: each chip click then adds or removes a division
  // instead of switching to it (Shift/Ctrl-click does the same any time).
  const [adding, setAdding] = useState(false)
  const active = focus.divs ? p.divisions.filter(d => focus.divs!.has(d)) : []
  if (!open) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={() => { setAdding(false); setOpen(true) }} className="inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full border bg-white text-slate-700 border-slate-200 hover:border-slate-300" title="Show every division">
          Divisions <span className="font-medium text-slate-400">{p.divisions.length}</span> <ChevronDown size={12} className="text-slate-400" />
        </button>
        {active.length ? active.map(d => (
          <span key={d} className="inline-flex items-center gap-1.5 text-xs font-bold pl-2 pr-1 py-1 rounded-full border" style={{ background: p.divColor(d), borderColor: p.divColor(d), color: inkOn(p.divColor(d)) }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,.85)' }} />
            {active.length > 2 ? p.divAbbr(d) : d}<span className="font-medium opacity-70">{counts[d]?.done ?? 0}/{counts[d]?.total ?? 0}</span>
            <button onClick={() => { focus.toggle(d); if (active.length === 1) setOpen(true) }} aria-label={`Remove ${d}`} title={active.length === 1 ? 'Show all divisions' : `Remove ${d}`} className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/20"><X size={11} /></button>
          </span>
        )) : (
          <span className="text-xs text-slate-500">All divisions</span>
        )}
        {active.length > 0 && (
          <button onClick={() => { setAdding(true); setOpen(true) }} title="Add another division to the view" aria-label="Add another division"
            className="w-6 h-6 rounded-full border border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-800 flex items-center justify-center text-sm leading-none">+</button>
        )}
      </div>
    )
  }
  // The open row is capped at two lines so the board keeps its height. A hidden copy
  // with full names is measured at the row's width; when it would need a third line
  // the chips switch to the division abbreviations (full name on hover).
  return <OpenChips p={p} counts={counts} setOpen={o => { if (!o) setAdding(false); setOpen(o) }} focus={focus} adding={adding} />
}

function OpenChips({ p, counts, setOpen, focus, adding }: { p: ViewsProps; counts: Record<string, DivCount>; setOpen: (o: boolean) => void; focus: Focus; adding: boolean }) {
  const probeRef = useRef<HTMLDivElement>(null)
  const [short, setShort] = useState(false)
  useLayoutEffect(() => {
    const el = probeRef.current
    if (!el) return
    const check = () => {
      const tops = new Set(Array.from(el.children).map(c => (c as HTMLElement).offsetTop))
      setShort(tops.size > 2)
    }
    check()
    const ro = new ResizeObserver(check); ro.observe(el)
    return () => ro.disconnect()
  }, [p.divisions, counts])
  const anyStage = p.divisions.some(d => divStage(counts[d]))
  const row = (abbr: boolean, live: boolean) => (<>
    <button tabIndex={live ? 0 : -1} onClick={() => setOpen(false)} aria-label="Collapse the division row" title="Collapse" className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"><ChevronUp size={14} /></button>
    <button tabIndex={live ? 0 : -1} onClick={focus.clear}
      className={`text-xs font-bold px-3 py-1 rounded-full border transition-colors ${p.filterDiv === '__all__' ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'}`}>All</button>
    {p.divisions.map(d => {
      const on = !!focus.divs?.has(d), c = p.divColor(d)
      const stage = divStage(counts[d]), st = stage ? STAGE[stage] : null
      const only = on && focus.divs!.size === 1
      return (
        <button key={d} tabIndex={live ? 0 : -1}
          onClick={e => {
            // add mode, or Shift/Ctrl/Cmd-click with something picked: add or remove this one
            if (focus.divs && (adding || e.shiftKey || e.ctrlKey || e.metaKey)) { focus.toggle(d); return }
            if (only) { focus.clear(); return }
            focus.only(d); setOpen(false)
          }}
          title={[abbr ? d : null, teamsNote(counts[d], true), st?.title, focus.divs && !adding ? 'Shift-click to add to the view' : null].filter(Boolean).join(' · ')}
          className={`inline-flex items-center gap-1.5 text-xs font-bold pl-2 ${abbr ? 'pr-2.5' : 'pr-3'} py-1 rounded-full border transition-colors whitespace-nowrap`}
          style={on ? { background: c, borderColor: c, color: inkOn(c) } : st ? { background: st.bg, borderColor: st.border, color: st.text } : { background: '#fff', borderColor: '#e2e8f0', color: '#334155' }}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: on ? 'rgba(255,255,255,.85)' : c }} />
          {abbr ? p.divAbbr(d) : d}
          {stage === 'complete'
            ? <span className="inline-flex items-center gap-0.5 font-semibold opacity-80"><Check size={12} strokeWidth={3} />{counts[d]?.total}</span>
            : <span className="font-medium opacity-70">{counts[d]?.done ?? 0}/{counts[d]?.total ?? 0}</span>}
        </button>
      )
    })}
    {adding && live && (
      <button onClick={() => setOpen(false)} className="text-xs font-bold px-3 py-1 rounded-full bg-slate-900 text-white hover:bg-slate-700">Done</button>
    )}
    {anyStage && !abbr && (
      <span className="inline-flex items-center gap-2.5 ml-1 text-[10px] text-slate-400 whitespace-nowrap">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full border" style={{ background: STAGE.pools.bg, borderColor: STAGE.pools.border }} />pools placed</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-full border" style={{ background: STAGE.complete.bg, borderColor: STAGE.complete.border }} />all placed</span>
      </span>
    )}
  </>)
  return (
    <div className="relative">
      <div ref={probeRef} aria-hidden className="absolute inset-x-0 top-0 flex items-center gap-1.5 flex-wrap invisible pointer-events-none">{row(false, false)}</div>
      {/* even abbreviated, a narrow screen can need a third line: it scrolls instead */}
      <div className="flex items-center gap-1.5 flex-wrap overflow-y-auto" style={{ maxHeight: 60 }}>{row(short, true)}</div>
    </div>
  )
}

interface DivCount { total: number; done: number; poolTotal: number; poolDone: number; teams: number }
// "8 teams · 3 games each": the per-team number is what tells Bo how many games a
// division should get per day. It counts pool games only (bracket teams are
// placeholders), which the long form says outright.
function teamsNote(c: DivCount | undefined, long = false): string | null {
  if (!c || !c.teams) return null
  const per = c.poolTotal ? Math.round((c.poolTotal * 2 / c.teams) * 10) / 10 : 0
  return `${c.teams} team${c.teams === 1 ? '' : 's'}${per ? ` · ${per} ${long ? 'pool ' : ''}game${per === 1 ? '' : 's'} each` : ''}`
}
// How far a division's placement has got, for the chip shading: every game placed,
// or every pool game placed with bracket games still to go.
function divStage(c: DivCount | undefined): 'complete' | 'pools' | null {
  if (!c || c.total === 0) return null
  if (c.done >= c.total) return 'complete'
  if (c.poolTotal > 0 && c.poolDone >= c.poolTotal) return 'pools'
  return null
}
const STAGE = {
  pools:    { bg: '#e9eef4', border: '#cbd5e1', text: '#334155', title: 'Pool play is fully placed; bracket games still to go' },
  complete: { bg: '#cbd5e1', border: '#94a3b8', text: '#334155', title: 'Every game in this division is placed' },
}

function useCounts(games: SGame[], divisions: string[]) {
  return useMemo(() => {
    const c: Record<string, DivCount> = {}
    const blank = (): DivCount => ({ total: 0, done: 0, poolTotal: 0, poolDone: 0, teams: 0 })
    const teams: Record<string, Set<string>> = {}
    divisions.forEach(d => { c[d] = blank() })
    games.forEach(g => {
      const x = c[g.division] ?? (c[g.division] = blank())
      const placed = !!(g.date && g.startTime && g.location)
      x.total++; if (placed) x.done++
      if (!isBracket(g)) { x.poolTotal++; if (placed) x.poolDone++ }
      const ts = teams[g.division] ?? (teams[g.division] = new Set())
      ;[g.team1, g.team2].forEach(t => { if (isRealTeam(t)) ts.add(t.trim().toLowerCase()) })
    })
    Object.entries(teams).forEach(([d, ts]) => { c[d].teams = ts.size })
    return c
  }, [games, divisions])
}

function SelectionBar({ p, sel, teamCount, onCancel, swapArmed, onSwapToggle, onBracket, bracketOpen }: { p: ViewsProps; sel: SGame; teamCount: Record<string, number>; onCancel: () => void; swapArmed: boolean; onSwapToggle: () => void; onBracket?: () => void; bracketOpen?: boolean }) {
  const placed = !!(sel.date && sel.startTime && sel.location)
  // Second line: each team's load, so a compact row never has to be opened to see it.
  // "3 games · 2 today" counts placed games over the whole event and on this day.
  const load = (team: string) => {
    if (!isRealTeam(team)) return null
    const all = teamCount[teamKey(sel.division, team)] ?? 0
    const today = p.dayGames.filter(g => g.division === sel.division && (g.team1 === team || g.team2 === team)).length
    return `${all} game${all === 1 ? '' : 's'}${today ? ` (${today} today)` : ''}`
  }
  const l1 = load(sel.team1), l2 = load(sel.team2)
  // Two lines of text and the buttons stacked beside them, so the bar stays short
  // (one row of chips tall) and never clips a long team name.
  return (
    <div className="flex items-stretch gap-2 pl-3 pr-1.5 py-1 rounded-xl text-white shadow-xl min-w-0 w-[520px] max-w-[92vw]" style={{ background: '#065f46' }}
      title={`${sel.division} · ${humanTeam(sel.team1)} vs ${humanTeam(sel.team2)} — click a green slot. Amber = back-to-back, striped = team busy.`}>
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <div className="text-xs leading-tight truncate">
          <span className="text-emerald-200">{placed ? 'Moving' : 'Placing'}</span>{' '}
          <span className="inline-block align-[1px] px-1.5 py-px mr-0.5 rounded-full ring-1 ring-white/60 text-[10px] font-bold leading-tight" style={{ background: p.divColor(sel.division), color: inkOn(p.divColor(sel.division)) }}>{sel.division}</span>{' '}
          <b>{gameLabel(sel, p.divAbbr)} · {humanTeam(sel.team1)} vs {humanTeam(sel.team2)}</b>{sel.pool && <span className="text-emerald-200"> · {poolLabel(sel.pool)}</span>}
        </div>
        {swapArmed ? (
          <div className="text-[11px] leading-tight text-amber-200 font-semibold">Now click the game to swap with</div>
        ) : l1 || l2 ? (
          <div className="text-[11px] leading-tight text-emerald-100">
            {l1 && <><b className="text-white font-semibold">{humanTeam(sel.team1)}</b> {l1}</>}
            {l1 && l2 && <span className="text-emerald-300"> · </span>}
            {l2 && <><b className="text-white font-semibold">{humanTeam(sel.team2)}</b> {l2}</>}
          </div>
        ) : (
          <div className="text-[11px] leading-tight text-emerald-100 truncate">Click a green slot · amber = back-to-back · striped = busy</div>
        )}
      </div>
      {/* two rows of buttons, as many columns as needed, so the bar stays short */}
      <div className="grid grid-rows-2 grid-flow-col gap-1 flex-shrink-0 content-center">
        {isBracket(sel) && onBracket && <button onClick={onBracket} aria-pressed={!!bracketOpen} title="See this game in its bracket" className={`text-[11px] font-bold leading-none px-2.5 py-1 rounded-full ${bracketOpen ? 'bg-white text-emerald-900' : 'border border-emerald-300/60 text-emerald-100 hover:bg-emerald-800'}`}>Bracket</button>}
        {isBracket(sel) && p.onToggleIfNeeded && <button onClick={() => p.onToggleIfNeeded!(sel.id)} aria-pressed={!!sel.ifNeeded} title={sel.ifNeededFromBracket ? `Named "${sel.bracketLabel}" in the bracket. Rename it there to change.` : sel.ifNeeded ? 'Marked If needed. Click to make it a regular game.' : 'Mark as If needed: only played on a certain result, e.g. if the 1 seed loses'} className={`text-[11px] font-bold leading-none px-2.5 py-1 rounded-full ${sel.ifNeeded ? 'bg-violet-300 text-violet-950 hover:bg-violet-200' : 'border border-violet-300/70 text-violet-100 hover:bg-emerald-800'}`}>{sel.ifNeeded ? 'If needed ✓' : 'If needed'}</button>}
        {placed && p.onSwap && <button onClick={onSwapToggle} aria-pressed={swapArmed} title="Swap this game's slot with another game: click Swap, then the other game. Or drag this game onto it." className={`text-[11px] font-bold leading-none px-2.5 py-1 rounded-full ${swapArmed ? 'bg-amber-300 text-amber-950 hover:bg-amber-200' : 'bg-emerald-200 text-emerald-950 hover:bg-emerald-100'}`}>{swapArmed ? 'Swapping…' : 'Swap'}</button>}
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
  // A bracket game whose feeder isn't over yet. Placeable with a confirm; label is set per cell.
  early:   { border: '#ea580c', bg: '#fff7ed', text: '#c2410c', label: 'Too early' },
  // Setup limits this field to other divisions. Still placeable (with a confirm), so not striped like blocked.
  field:   { border: '#c026d3', bg: '#fdf4ff', text: '#a21caf', label: 'Not for this division' },
}

// ───────────────────────────────────────────────────────────────────────────────
// Timeline view
// ───────────────────────────────────────────────────────────────────────────────

const ROW_H = '64px', MIN_W = '34px', MIN_H = '22px'
// Time label column on the Board: narrow once every time is minimized (Compact), since
// the labels drop to "8:00a·8" and the width was the next thing eating the screen.
const TIME_W = '100px', TIME_W_MIN = '64px'
const ampm = (t: string) => t.replace(/ AM\b/, 'a').replace(/ PM\b/, 'p')
const fieldShort = (n: string) => n.replace(/^field\s*/i, '') || n
const timeShort = (t: string) => t.replace(/\s*[AP]M$/i, '')

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
  const lotTop = !!p.lotOnTop
  const fit = (lotTop || !leftOpen) && !rightOpen
  // Docked lot, compact: one-line chips instead of three-line cards, so the strip is
  // about 60px instead of 115px. Remembered per tournament on this device.
  const lotMiniKey = 'wr-sched-lot-mini:' + (p.prefsKey ?? '')
  const [lotMini, setLotMiniRaw] = useState(false)
  useEffect(() => { try { setLotMiniRaw(localStorage.getItem(lotMiniKey) === '1') } catch {} }, [lotMiniKey])
  const setLotMini = (v: boolean) => { setLotMiniRaw(v); try { localStorage.setItem(lotMiniKey, v ? '1' : '0') } catch {} }
  const [tab, setTab] = useState<'issues' | 'day'>('issues')
  // Bracket pop-over (BracketPanel): opened from the placing bar or the zoom row.
  const [bracketOpen, setBracketOpen] = useState(false)
  const [openDivs, setOpenDivs] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useTypeFilter()
  const [dragId, setDragId] = useState<string | null>(null)
  // Minimized fields and times shrink to a thin strip. Their games still show (as a
  // one-line chip) and still take drops, so the part of the day being worked on can
  // stay wide. Remembered per tournament on this device.
  const minKey = 'wr-sched-min:' + (p.prefsKey ?? '')
  const [minFields, setMinFields] = useState<Set<string>>(new Set())
  const [minSlots, setMinSlots] = useState<Set<string>>(new Set())
  useEffect(() => {
    try { const v = JSON.parse(localStorage.getItem(minKey) || 'null'); setMinFields(new Set(v?.f ?? [])); setMinSlots(new Set(v?.s ?? [])) } catch {}
  }, [minKey])
  const saveMin = (f: Set<string>, sl: Set<string>) => {
    setMinFields(f); setMinSlots(sl)
    try { localStorage.setItem(minKey, JSON.stringify({ f: Array.from(f), s: Array.from(sl) })) } catch {}
  }
  const toggleMinField = (n: string) => { const f = new Set(minFields); if (f.has(n)) f.delete(n); else f.add(n); saveMin(f, minSlots) }
  const toggleMinSlot = (n: string) => { const sl = new Set(minSlots); if (sl.has(n)) sl.delete(n); else sl.add(n); saveMin(minFields, sl) }
  const minCount = p.fields.filter(f => minFields.has(f.fullName)).length + p.slots.filter(x => minSlots.has(x)).length
  // One click shrinks every time of the day (Compact), one more brings them back.
  const allTimesMin = p.slots.length > 0 && p.slots.every(x => minSlots.has(x))
  const toggleCompact = () => saveMin(minFields, allTimesMin ? new Set() : new Set([...Array.from(minSlots), ...p.slots]))
  // Field headers drag onto each other to reorder. Uses its own dataTransfer type, so
  // a field dropped on a cell (or a game dropped on a header) does nothing.
  const [dragField, setDragField] = useState<string | null>(null)
  const [fieldOver, setFieldOver] = useState<string | null>(null)
  const fieldDrag = (f: SField) => p.onReorderFields ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('wr-field', f.fullName); e.dataTransfer.effectAllowed = 'move'; setDragField(f.fullName) },
    onDragEnd: () => { setDragField(null); setFieldOver(null) },
    onDragOver: (e: React.DragEvent) => { if (dragField) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (fieldOver !== f.fullName) setFieldOver(f.fullName) } },
    onDrop: (e: React.DragEvent) => {
      if (!dragField) return
      e.preventDefault(); e.stopPropagation()
      const from = e.dataTransfer.getData('wr-field') || dragField
      setDragField(null); setFieldOver(null)
      if (from && from !== f.fullName) p.onReorderFields!(from, f.fullName)
    },
  } : {}
  // where the dragged field would land: a teal bar on the near side of the target
  const dropEdge = (f: SField) => {
    if (!dragField || fieldOver !== f.fullName || dragField === f.fullName) return undefined
    const before = p.fields.findIndex(x => x.fullName === dragField) > p.fields.findIndex(x => x.fullName === f.fullName)
    return { boxShadow: across ? `inset ${before ? '3px' : '-3px'} 0 0 #0d9488` : `inset 0 ${before ? '3px' : '-3px'} 0 #0d9488` }
  }
  const boardRef = useRef<HTMLDivElement>(null)
  // The floating "Moving…" bar covers the bottom of the board, so the scroll zone
  // starts above it.
  useDragAutoScroll(boardRef, !!dragId || !!dragField, { bottomInset: selId ? 64 : 0 })
  const [chipsOpen, setChipsOpenRaw] = useState(true)
  useEffect(() => { try { if (localStorage.getItem('wr-sched-chips') === 'closed') setChipsOpenRaw(false) } catch {} }, [])
  const setChipsOpen = (o: boolean) => { setChipsOpenRaw(o); try { localStorage.setItem('wr-sched-chips', o ? 'open' : 'closed') } catch {} }

  const { byGame, list: issueList } = useIssueList(p)
  const counts = useCounts(p.games, p.divisions)
  const sel = useMemo(() => p.games.find(g => g.id === selId) ?? null, [p.games, selId])
  // Swap: "Swap" on the moving bar arms it, the next game clicked trades places with the
  // selected one. Dragging a placed game onto another placed game does the same.
  const [swapArmed, setSwapArmed] = useState(false)
  useEffect(() => { setSwapArmed(false) }, [selId])
  const [swapOver, setSwapOver] = useState<string | null>(null)
  const isPlaced = (g: SGame | null | undefined) => !!(g && g.date && g.startTime && g.location)
  const doSwap = (aId: string, bId: string) => { if (!p.onSwap || aId === bId) return; setSelId(null); setSwapArmed(false); p.onSwap(aId, bId) }
  // Board zoom (the Grid's −/+), remembered per tournament on this device.
  const zoomKey = 'wr-sched-zoom:' + (p.prefsKey ?? '')
  const [zoom, setZoomRaw] = useState(1)
  useEffect(() => { try { const z = parseFloat(localStorage.getItem(zoomKey) || ''); if (z >= 0.5 && z <= 1.25) setZoomRaw(z) } catch {} }, [zoomKey])
  const setZoom = (z: number) => { const v = Math.min(1.25, Math.max(0.5, Math.round(z * 100) / 100)); setZoomRaw(v); try { localStorage.setItem(zoomKey, String(v)) } catch {} }

  const bracketOpenRef = useRef(false)
  bracketOpenRef.current = bracketOpen
  useEffect(() => {
    // Esc: close the bracket pop-over if it's open, otherwise drop the picked game
    const onKey = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (bracketOpenRef.current) { setBracketOpen(false); return } setSelId(null); setHover(null) }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])
  // a placed game that got moved/unscheduled elsewhere: drop the stale selection
  useEffect(() => { if (selId && !p.games.some(g => g.id === selId)) setSelId(null) }, [p.games, selId])

  // A division chip and the Pool/Bracket toggle narrow the unscheduled list to just
  // that; on the board the same games stay put but fade, so nothing moves under you.
  // More than one division in focus (Bo, Oct 5 2026): p.filterDiv is the first one
  // (it drives the page's Division select too); `moreDivs` are the ones added with
  // "+" or Shift/Ctrl-click on a chip. Changed from outside (the page's select),
  // the extras drop.
  const [moreDivs, setMoreDivs] = useState<string[]>([])
  const keepMore = useRef(false)
  useEffect(() => { if (keepMore.current) keepMore.current = false; else setMoreDivs([]) }, [p.filterDiv])
  const focusDivs = useMemo(() => p.filterDiv === '__all__' ? null : new Set([p.filterDiv, ...moreDivs]), [p.filterDiv, moreDivs])
  const focus: Focus = {
    divs: focusDivs,
    toggle: (d: string) => {
      if (!focusDivs) { p.setFilterDiv(d); return }
      if (!focusDivs.has(d)) { setMoreDivs(m => [...m, d]); return }
      if (d !== p.filterDiv) { setMoreDivs(m => m.filter(x => x !== d)); return }
      // removing the first one: the next becomes first, or back to all
      const [next, ...rest] = moreDivs
      if (next) { keepMore.current = true; setMoreDivs(rest); p.setFilterDiv(next) } else p.setFilterDiv('__all__')
    },
    only: (d: string) => { setMoreDivs([]); p.setFilterDiv(d) },
    clear: () => { setMoreDivs([]); p.setFilterDiv('__all__') },
  }
  // Another division: grayed right down, so the ones in focus stand alone. Same
  // division, other game type (the Pool/Bracket toggle): only faded, colors kept.
  const divOut = (g: SGame) => !!focusDivs && !focusDivs.has(g.division)
  const typeOut = (g: SGame) => !matchesType(g, typeFilter)
  const dim = (g: SGame) => divOut(g) || typeOut(g)
  const tint = (div: string) => p.divColor(div) + '1f'

  // games per team in its division (the "(n)" counts on cards)
  const teamCount = useMemo(() => {
    const m: Record<string, number> = {}
    p.games.filter(g => g.date && g.startTime).forEach(g => [g.team1, g.team2].forEach(t => { if (isRealTeam(t)) { const k = teamKey(g.division, t); m[k] = (m[k] ?? 0) + 1 } }))
    return m
  }, [p.games])
  // Small count badge for one-line chips: "3" in a tinted pill ahead of the team name.
  const cnt = (division: string, team: string, on: boolean) => {
    const n = teamCount[teamKey(division, team)]
    if (!n) return null
    return <span className={`inline-block flex-shrink-0 min-w-[13px] px-[3px] mr-[3px] rounded text-center font-bold tabular-nums ${on ? 'bg-white/20 text-white' : 'bg-slate-900/10 text-slate-600'}`} title={`${humanTeam(team)}: ${n} game${n === 1 ? '' : 's'} placed`}>{n}</span>
  }

  const cellMap = useMemo(() => { const m: Record<string, SGame> = {}; p.dayGames.forEach(g => { m[g.startTime + '|' + g.location] = g }); return m }, [p.dayGames])
  const perSlot = p.slots.map(s => p.dayGames.filter(g => g.startTime === s).length)

  // Placing order (Bo, Oct 5 2026: bracket games came out "all over the place").
  // p.unscheduled arrives in whatever order the database returns games with no
  // time, roughly creation order, which interleaves bracket rounds. A bracket
  // game's round is how deep its "W-B2"/"L-B3" references go, so: pool games by
  // number, then bracket games round by round (first round, then the games fed
  // by it...), by number within a round. Placing in this order never puts a
  // game ahead of the games it waits on.
  const placeOrder = useMemo(() => {
    const byDiv = new Map<string, Map<string, SGame>>()
    for (const g of p.games) {
      if (!isBracket(g)) continue
      if (!byDiv.has(g.division)) byDiv.set(g.division, new Map())
      byDiv.get(g.division)!.set(g.gameNumber.toUpperCase(), g)
    }
    const depth = new Map<string, number>()
    const depthOf = (g: SGame, seen: Set<string>): number => {
      if (depth.has(g.id)) return depth.get(g.id)!
      if (seen.has(g.id)) return 0   // a reference loop: don't recurse forever
      seen.add(g.id)
      let d = 0
      for (const t of [g.team1, g.team2]) {
        const m = (t || '').match(/^[WL]-(B\d+)$/i)
        const src = m ? byDiv.get(g.division)?.get(m[1].toUpperCase()) : undefined
        if (src) d = Math.max(d, depthOf(src, seen) + 1)
      }
      depth.set(g.id, d)
      return d
    }
    p.games.forEach(g => { if (isBracket(g)) depthOf(g, new Set()) })
    const num = (g: SGame) => g.gameNumber || ''
    return (a: SGame, b: SGame) =>
      (Number(isBracket(a)) - Number(isBracket(b))) ||
      ((depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0)) ||
      num(a).localeCompare(num(b), undefined, { numeric: true })
  }, [p.games])

  // unscheduled, grouped by division, filtered by search, in placing order
  const lot = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const divs = focusDivs ? p.divisions.filter(d => focusDivs.has(d)) : p.divisions
    return divs.map(d => ({
      div: d,
      items: p.unscheduled.filter(g => g.division === d && matchesType(g, typeFilter) && (!ql || [g.gameNumber, g.team1, g.team2, g.pool ?? ''].some(x => x.toLowerCase().includes(ql)))).sort(placeOrder),
    })).filter(x => x.items.length > 0)
  }, [p.unscheduled, p.divisions, focusDivs, typeFilter, q, placeOrder])
  const lotCounts = useMemo(() => {
    const inDiv = p.unscheduled.filter(g => !focusDivs || focusDivs.has(g.division))
    return { pool: inDiv.filter(g => !isBracket(g)).length, bracket: inDiv.filter(isBracket).length }
  }, [p.unscheduled, focusDivs])

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
  // One unscheduled game, in the rail (full width) or the top strip (fixed width).
  const lotCard = (g: SGame, c: string, size: string, mini = false) => {
    const on = selId === g.id
    if (mini) return (
      <button key={g.id} draggable data-lot-id={g.id}
        onDragStart={e => { e.dataTransfer.setData('gameId', g.id); e.dataTransfer.effectAllowed = 'move'; setDragId(g.id); setSelId(g.id) }}
        onDragEnd={() => setDragId(null)}
        onClick={() => setSelId(on ? null : g.id)}
        title={`${gameLabel(g, p.divAbbr)}${g.pool ? ` · ${g.pool}` : ''} — ${humanTeam(g.team1)} vs ${humanTeam(g.team2)}`}
        className={`${size} h-6 max-w-[200px] text-left rounded-md border pl-1.5 pr-2 inline-flex items-center gap-1 text-[10px] leading-none whitespace-nowrap overflow-hidden cursor-grab active:cursor-grabbing ${on ? 'bg-slate-900 border-slate-900 ring-2 ring-teal-500/40' : dim(g) ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
        style={{ borderLeft: `3px solid ${c}` }}>
        <b className={on ? 'text-white' : 'text-slate-800'}>{g.gameNumber}</b>
        <GameTag g={g} on={on} mini />
        <span className={`truncate ${on ? 'text-slate-200' : 'text-slate-700'}`}>{humanTeam(g.team1)} v {humanTeam(g.team2)}</span>
      </button>
    )
    return (
      <button key={g.id} draggable data-lot-id={g.id}
        onDragStart={e => { e.dataTransfer.setData('gameId', g.id); e.dataTransfer.effectAllowed = 'move'; setDragId(g.id); setSelId(g.id) }}
        onDragEnd={() => setDragId(null)}
        onClick={() => setSelId(on ? null : g.id)}
        className={`${size} text-left rounded-lg border px-2 py-1.5 transition-all cursor-grab active:cursor-grabbing ${on ? 'bg-slate-900 border-slate-900 ring-[3px] ring-teal-500/40' : dim(g) ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'}`}
        style={{ borderLeft: `4px solid ${c}` }}>
        <div className={`flex items-center gap-1.5 text-[10px] whitespace-nowrap overflow-hidden ${on ? 'text-slate-300' : 'text-slate-500'}`}><b className={`truncate ${on ? 'text-white' : 'text-slate-800'}`}>{gameLabel(g, p.divAbbr)}</b>{g.pool && <span className="truncate">{g.pool}</span>}<GameTag g={g} on={on} /></div>
        <div className={`text-xs font-bold leading-tight truncate ${on ? 'text-white' : 'text-slate-900'}`}>{humanTeam(g.team1)}</div>
        <div className={`text-[11px] leading-tight truncate ${on ? 'text-slate-300' : 'text-slate-600'}`}>vs {humanTeam(g.team2)}</div>
      </button>
    )
  }
  // Parking lot across the top: one scrolling row of cards, each division led by a
  // narrow colored tab, so the whole board width stays for fields. Same drop target.
  function renderLotStrip() {
    return (
      <div {...lotDrop} className={`relative flex-shrink-0 border-b border-slate-200 transition-colors ${lotOver ? 'bg-orange-50' : 'bg-white'}`}>
        {draggingPlaced && (
          <div className={`absolute inset-1.5 z-10 rounded-xl border-2 border-dashed flex items-center justify-center text-xs font-bold pointer-events-none ${lotOver ? 'border-orange-500 bg-orange-100/80 text-orange-800' : 'border-orange-300 bg-white/70 text-orange-600'}`}>
            Drop here to unschedule
          </div>
        )}
        <div className="px-3 pt-1.5 pb-1 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Unscheduled</span>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">{p.unscheduled.length}</span>
          <label className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Team or game #" aria-label="Search unscheduled games"
              className="w-40 pl-6 pr-2 py-1 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-400" />
          </label>
          <TypeToggle value={typeFilter} onChange={setTypeFilter} counts={lotCounts} />
          {p.filterDiv !== '__all__' && (
            <span className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 inline-flex items-center gap-1.5 text-[11px] text-slate-600">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.divColor(p.filterDiv) }} />
              Only <b className="text-slate-800">{p.filterDiv}</b>{moreDivs.length > 0 && <span title={moreDivs.join(', ')}> + {moreDivs.length} more</span>}
              <button onClick={focus.clear} className="font-semibold text-teal-700 hover:underline">Show all</button>
            </span>
          )}
          <button onClick={() => setLotMini(!lotMini)} aria-pressed={lotMini} aria-label={lotMini ? 'Show full game cards' : 'Compact: one line per game'} title={lotMini ? 'Show full game cards' : 'Compact: one line per game'} className={`ml-auto w-6 h-6 rounded-md flex items-center justify-center ${lotMini ? 'bg-slate-900 text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>{lotMini ? <UnfoldVertical size={14} /> : <FoldVertical size={14} />}</button>
          {p.onLotOnTop && <button onClick={() => p.onLotOnTop!(false)} aria-label="Move the parking lot to the side" title="Parking lot as side panel" className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"><PanelLeft size={14} /></button>}
        </div>
        {/* width:0 + min-width:100%: the row's cards must not count toward the column's
            intrinsic width, or the whole board grows past the viewport instead of scrolling. */}
        <div className={`overflow-x-auto overflow-y-hidden px-3 flex items-stretch ${lotMini ? 'pb-1.5 gap-2' : 'pb-2 gap-2.5'}`} style={{ width: 0, minWidth: '100%' }}>
          {lot.length === 0 && <p className="text-xs text-slate-400 py-3">{p.unscheduled.length === 0 ? 'Everything is on the grid.' : typeFilter !== 'all' || p.filterDiv !== '__all__' ? 'Nothing left to place with these filters.' : 'No games match.'}</p>}
          {lot.map(grp => {
            const c = p.divColor(grp.div)
            return (
              <div key={grp.div} className={`flex items-stretch flex-shrink-0 ${lotMini ? 'gap-1 items-center' : 'gap-1.5'}`}>
                {lotMini ? (
                  <span className="h-6 px-1.5 rounded-md inline-flex items-center gap-1 text-[9px] font-bold text-slate-700 whitespace-nowrap flex-shrink-0" style={{ background: c + '1f' }} title={`${grp.div} · ${grp.items.length} to place${teamsNote(counts[grp.div]) ? ` · ${teamsNote(counts[grp.div])}` : ''}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: c }} />{p.divAbbr(grp.div)} · {grp.items.length}
                  </span>
                ) : (
                  <div className="w-5 rounded-md flex flex-col items-center justify-center gap-1 py-1 flex-shrink-0 overflow-hidden" style={{ background: c + '1f' }} title={`${grp.div} · ${grp.items.length} to place${teamsNote(counts[grp.div]) ? ` · ${teamsNote(counts[grp.div])}` : ''}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                    <span className="text-[9px] font-bold text-slate-700 whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>{p.divAbbr(grp.div)} · {grp.items.length}</span>
                  </div>
                )}
                {grp.items.map(g => lotCard(g, c, lotMini ? 'flex-shrink-0' : 'w-[172px] flex-shrink-0', lotMini))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  // Header state: any part of the day closed. Cell state: closed at that start time.
  const isClosed = (field: string) => !!p.closedLabel?.(field)
  const closedAt = (field: string, time: string) => !!p.isFieldClosed?.(field, time)
  // games on this field that sit inside its closed window (they need moving)
  const toMove = (field: string) => p.dayGames.filter(g => g.location === field && g.startTime && closedAt(field, g.startTime)).length
  // Header room is about 100px, so the window reads as arrows: "Closed 11:20a →", "Closed → 1:00p",
  // "Closed 11:20a–1:00p". The to-move count fits only beside "Closed today"; otherwise the flagged
  // games and the Issues rail carry it, and the button tooltip has the full sentence.
  const closedShort = (field: string) => {
    const full = p.closedLabel?.(field) ?? ''
    const n = toMove(field)
    if (full === 'Closed today') return n ? `Closed · ${n} to move` : full
    const t = full.replace(/ AM\b/g, 'a').replace(/ PM\b/g, 'p')
    return t.replace(/^Closed from (.+)$/, 'Closed $1 →').replace(/^Closed until (.+)$/, 'Closed → $1')
  }
  const closedTitle = (field: string) => { const n = toMove(field); return `${p.closedLabel?.(field)}${n ? ` · ${n} game${n === 1 ? '' : 's'} to move` : ''}. Click to change the hours or reopen.` }
  const place = async (g: SGame, time: string, field: string) => {
    if (closedAt(field, time)) return
    if (placementStatus(g, p.slots.indexOf(time), p.dayGames, p.slots, p.increment) === 'blocked') return
    const bt = isBracket(g) ? bracketTiming(g, time, p.activeDate, p.games, p.increment) : null
    if (bt?.early) {
      const f = p.games.find(x => x.division === g.division && x.gameNumber === bt.early)
      const when = f ? (f.date === p.activeDate ? `at ${p.fmtTime(f.startTime)}` : 'on a later day') : ''
      if (!window.confirm(`${g.gameNumber} waits on ${bt.early}, which plays ${when}. Put ${g.gameNumber} before it anyway?`)) return
    }
    // Placing from the parking lot hands the pick to the next game in it, in the
    // order shown (same filters), so a run of games is click slot, click slot...
    // (Bo, Oct 5 2026). Moving a game that was already placed does not.
    const order = lot.flatMap(x => x.items)
    const fromLot = order.findIndex(x => x.id === g.id)
    const next = fromLot === -1 ? null : (order[fromLot + 1] ?? order.find(x => x.id !== g.id) ?? null)
    setSelId(null); setHover(null)
    const ok = await p.onPlace(g.id, time, field)
    if (ok === false) { setSelId(g.id); return }
    if (next) {
      setSelId(next.id)
      // Bring it into view in the strip or rail. Only the lot's own scroller moves:
      // scrollIntoView also shifted the board sideways.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(`[data-lot-id="${next.id}"]`)
        let box = el?.parentElement ?? null
        while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowX + getComputedStyle(box).overflowY)) box = box.parentElement
        if (!el || !box) return
        const e = el.getBoundingClientRect(), c = box.getBoundingClientRect()
        const dx = e.left < c.left ? e.left - c.left - 8 : e.right > c.right ? e.right - c.right + 8 : 0
        const dy = e.top < c.top ? e.top - c.top - 8 : e.bottom > c.bottom ? e.bottom - c.bottom + 8 : 0
        if (dx || dy) box.scrollBy({ left: dx, top: dy, behavior: 'smooth' })
      })
    }
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
      {/* Left rail: unscheduled (or docked on top, see renderLotStrip) */}
      {lotTop ? null : leftOpen ? (
        <div {...lotDrop} className={`relative w-[232px] flex-shrink-0 flex flex-col border-r border-slate-200 min-h-0 transition-colors ${lotOver ? 'bg-orange-50' : 'bg-white'}`}>
          {draggingPlaced && (
            <div className={`absolute inset-1.5 z-10 rounded-xl border-2 border-dashed flex items-center justify-center text-xs font-bold pointer-events-none ${lotOver ? 'border-orange-500 bg-orange-100/80 text-orange-800' : 'border-orange-300 bg-white/70 text-orange-600'}`}>
              Drop here to unschedule
            </div>
          )}
          <div className="pl-3.5 pr-2 pt-2.5 pb-1.5 flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Unscheduled</span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">{p.unscheduled.length}</span>
            {p.onLotOnTop && <button onClick={() => p.onLotOnTop!(true)} aria-label="Put the parking lot on top" title="Parking lot on top" className="ml-auto w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"><PanelTop size={14} /></button>}
            <button onClick={() => setRails(false, rightOpen)} aria-label="Collapse the unscheduled list" title="Collapse" className={`${p.onLotOnTop ? '' : 'ml-auto '}w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700`}><ChevronsLeft size={14} /></button>
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
              <span className="truncate flex-1">Only <b className="text-slate-800">{p.filterDiv}</b>{moreDivs.length > 0 && <span title={moreDivs.join(', ')}> + {moreDivs.length} more</span>}</span>
              <button onClick={focus.clear} className="font-semibold text-teal-700 hover:underline flex-shrink-0">Show all</button>
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
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold text-slate-800 truncate">{grp.div}</span>
                      {/* quiet second line: how big the division is, so "how many games per day" has an answer right here */}
                      {teamsNote(counts[grp.div]) && <span className="block text-[10px] text-slate-400 truncate leading-tight">{teamsNote(counts[grp.div])}</span>}
                    </span>
                    <span className="text-[11px] text-slate-500">{grp.items.length}</span>
                    <ChevronDown size={12} className="text-slate-400 transition-transform" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} />
                  </button>
                  {open && (
                    <div className="space-y-1 mt-0.5">
                      {grp.items.map(g => {
                        return lotCard(g, c, 'w-full')
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
        {lotTop && renderLotStrip()}
        <div className="px-3 py-1.5 flex items-start gap-2 bg-white border-b border-slate-200 flex-shrink-0">
          <div className="flex-1 min-w-0 pt-0.5"><DivisionChips p={p} counts={counts} open={chipsOpen} setOpen={setChipsOpen} focus={focus} /></div>
          {p.games.some(isBracket) && (
            <button onClick={() => setBracketOpen(o => !o)} aria-pressed={bracketOpen} title="Show a division's bracket"
              className={`flex-shrink-0 mt-1 h-6 px-2.5 rounded-md border text-[11px] font-bold ${bracketOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'}`}>Bracket</button>
          )}
          <div className="flex-shrink-0 flex items-center gap-0.5 pt-1 text-slate-500" title="Zoom the board">
            <button onClick={() => setZoom(zoom - 0.1)} disabled={zoom <= 0.5} aria-label="Zoom out" className="w-6 h-6 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-sm leading-none">−</button>
            <button onClick={() => setZoom(1)} aria-label="Reset zoom" title="Back to 100%" className="w-10 text-[11px] font-semibold tabular-nums text-center hover:text-slate-900">{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom(zoom + 0.1)} disabled={zoom >= 1.25} aria-label="Zoom in" className="w-6 h-6 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-sm leading-none">+</button>
          </div>
        </div>
        <div className="flex-1 min-h-0 relative">
        {/* While a game is picked up, its bar floats over the bottom of the board so the
            chips row keeps its width and the bar is always in view. */}
        {/* While dragging, the bar is see-through to the pointer so the slots under it still take the drop. */}
        {sel && <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-40 transition-opacity ${dragId ? 'pointer-events-none opacity-30' : ''}`}><SelectionBar p={p} sel={sel} teamCount={teamCount} onCancel={() => setSelId(null)} swapArmed={swapArmed} onSwapToggle={() => setSwapArmed(v => !v)} onBracket={() => setBracketOpen(o => !o)} bracketOpen={bracketOpen} /></div>}
        {/* Bracket pop-over: floats above the placing bar (or the bottom of the board
            when nothing is picked), so the board keeps its full width. */}
        {bracketOpen && (
          <div className={`absolute left-1/2 -translate-x-1/2 z-50 w-[760px] max-w-[calc(100%-24px)] flex flex-col rounded-2xl bg-white border border-slate-200 shadow-2xl`} style={{ bottom: sel ? 84 : 12, maxHeight: `calc(100% - ${sel ? 96 : 24}px)` }}>
            <BracketPanel p={p} sel={sel} onClose={() => setBracketOpen(false)}
              onPick={id => { setSelId(id); setHover(null); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-tl-game="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })) }} />
          </div>
        )}
        {/* Room under the last row while the bar is up, so the late slots can scroll
            clear of it and take a click or a drop (Bo, Oct 5 2026: 8:30p and 9:20p sat
            under the bar with nowhere further to scroll). */}
        <div ref={boardRef} className="h-full overflow-auto relative" style={{ paddingBottom: sel ? 76 : undefined }} onClick={() => { if (hover) setHover(null) }}>
          {across ? (
            <div className="grid" style={{ gridTemplateColumns: `${allTimesMin ? TIME_W_MIN : TIME_W} ${p.fields.map(f => minFields.has(f.fullName) ? MIN_W : fieldCol).join(' ')}`, gridTemplateRows: `44px ${p.slots.map(x => minSlots.has(x) ? MIN_H : ROW_H).join(' ')}`, minWidth: fit ? undefined : 'max-content', zoom: zoom !== 1 ? zoom : undefined }}>
              {/* header: fields (drag to reorder, minimize to a strip) */}
              {renderCorner()}
              {p.fields.map(f => {
                const n = p.dayGames.filter(g => g.location === f.fullName).length
                const mf = minFields.has(f.fullName)
                return (
                  <div key={f.fullName} {...fieldDrag(f)} title={p.onReorderFields ? `${f.fieldName} · drag to move this field` : undefined}
                    className={`sticky top-0 z-20 bg-slate-50 border-b border-slate-200 border-r border-slate-100 min-w-0 ${p.onReorderFields ? 'cursor-grab active:cursor-grabbing' : ''} ${dragField === f.fullName ? 'opacity-40' : ''}`}
                    style={dropEdge(f)}>
                    {mf ? (
                      <button onClick={() => toggleMinField(f.fullName)} title={`Show ${f.fieldName}`} aria-label={`Show ${f.fieldName}`} className="w-full h-full flex items-center justify-center text-[10px] font-extrabold text-slate-600 hover:bg-slate-100 hover:text-slate-900 px-0.5 truncate">{fieldShort(f.fieldName)}</button>
                    ) : (
                      <div className={`h-full pl-1 pr-1 flex items-center gap-0.5 group/fh ${isClosed(f.fullName) ? 'bg-red-50' : ''}`}>
                        {p.onReorderFields && <GripVertical size={12} className="text-slate-300 flex-shrink-0" />}
                        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
                          <span className={`text-xs font-extrabold truncate ${isClosed(f.fullName) ? 'text-red-700 line-through decoration-red-300' : 'text-slate-900'}`}>{f.fieldName}</span>
                          <span className={`text-[10px] truncate ${isClosed(f.fullName) ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{isClosed(f.fullName) ? closedShort(f.fullName) : `${f.venueName} · ${n}`}</span>
                        </div>
                        {p.onToggleClosed && <button onClick={() => p.onToggleClosed!(f.fullName)} title={isClosed(f.fullName) ? closedTitle(f.fullName) : 'Close this field for all or part of this day: nothing can be placed there by hand or by Auto-fill'} aria-label={isClosed(f.fullName) ? `Change or reopen ${f.fieldName}` : `Close ${f.fieldName} for all or part of this day`} aria-pressed={isClosed(f.fullName)} className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center ${isClosed(f.fullName) ? 'text-red-600 bg-red-100' : 'text-slate-300 opacity-0 group-hover/fh:opacity-100 hover:bg-slate-200 hover:text-slate-700'}`}><Ban size={11} /></button>}
                        <button onClick={() => toggleMinField(f.fullName)} title="Minimize this field" aria-label={`Minimize ${f.fieldName}`} className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-slate-300 hover:bg-slate-200 hover:text-slate-700"><Minimize2 size={11} /></button>
                      </div>
                    )}
                  </div>
                )
              })}
              {/* rows: time slots */}
              {p.slots.map((s, si) => renderSlotRow(s, si))}
            </div>
          ) : (
          <div className="grid" style={{ gridTemplateColumns: `116px ${p.slots.map(x => minSlots.has(x) ? MIN_W : slotCol).join(' ')}`, gridTemplateRows: `36px ${p.fields.map(f => minFields.has(f.fullName) ? MIN_H : ROW_H).join(' ')}`, minWidth: fit ? undefined : 'max-content', zoom: zoom !== 1 ? zoom : undefined }}>
            {/* header: times (minimize to a strip) */}
            {renderCorner()}
            {p.slots.map((s, i) => minSlots.has(s) ? (
              <button key={s} onClick={() => toggleMinSlot(s)} title={`Show ${p.fmtTime(s)}`} aria-label={`Show ${p.fmtTime(s)}`} className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 border-r border-slate-100 text-[9px] font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900 truncate px-0.5">{timeShort(p.fmtTime(s))}</button>
            ) : (
              <div key={s} className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 border-r border-slate-100 pl-2 pr-0.5 flex items-center gap-0.5 min-w-0">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="text-[11px] font-bold text-slate-700 truncate">{p.fmtTime(s)}</span>
                  <span className="h-1 rounded-full" style={{ width: `${Math.round(100 * perSlot[i] / Math.max(1, p.fields.length))}%`, background: perSlot[i] >= p.fields.length ? '#ef4444' : perSlot[i] ? '#14b8a6' : '#e2e8f0' }} />
                </div>
                <button onClick={() => toggleMinSlot(s)} title="Minimize this time" aria-label={`Minimize ${p.fmtTime(s)}`} className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-slate-300 hover:bg-slate-200 hover:text-slate-700"><Minimize2 size={11} /></button>
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
              <div className="text-[10px] text-slate-500 mt-1.5">Click to move · drag to another slot · drop on a game to swap</div>
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

  // The board's top-left corner (otherwise empty) holds Fit and Expand, so the
  // division row above can use the full width.
  function renderCorner() {
    // In Compact on the Board the corner is 64px wide, so the buttons shrink and
    // wrap onto two lines inside the 44px header instead of overflowing.
    const tight = across && allTimesMin
    const btn = tight ? 'h-5 px-1 text-[10px]' : 'h-7 px-1.5 text-[11px]'
    return (
      <div className={`sticky top-0 left-0 z-30 bg-slate-50 border-b border-r border-slate-200 flex items-center justify-center gap-0.5 px-0.5 ${tight ? 'flex-wrap content-center gap-y-px' : ''}`}>
        <button onClick={() => (fit ? setRails(true, true) : setRails(false, false))} aria-label={across ? 'Fit fields' : 'Fit day'}
          title={fit ? 'Reopen both side panels' : (across ? 'Fit fields: collapse both side panels so every field fits' : 'Fit day: collapse both side panels so the whole day fits')}
          className={`${btn} inline-flex items-center gap-1 rounded-full border font-bold ${fit ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
          {fit ? <Minimize2 size={tight ? 10 : 12} /> : <Maximize2 size={tight ? 10 : 12} />}
        </button>
        <button onClick={toggleCompact} aria-label={allTimesMin ? 'Show every time at full size' : 'Compact: shrink every time'}
          title={allTimesMin ? 'Show every time at full size' : 'Compact: shrink every time so the whole day fits'}
          className={`${btn} inline-flex items-center rounded-full border ${allTimesMin ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}>
          {across ? (allTimesMin ? <UnfoldVertical size={tight ? 10 : 12} /> : <FoldVertical size={tight ? 10 : 12} />) : (allTimesMin ? <UnfoldHorizontal size={12} /> : <FoldHorizontal size={12} />)}
        </button>
        {minCount > 0 && (
          <button onClick={() => saveMin(new Set(), new Set())} aria-label={`Expand ${minCount} minimized`} title={`Expand ${minCount} minimized field${minCount === 1 ? '' : 's'} / time${minCount === 1 ? '' : 's'}`}
            className={`${btn} inline-flex items-center gap-1 rounded-full border font-bold bg-white text-teal-700 border-teal-300 hover:bg-teal-50`}>
            +{minCount}
          </button>
        )}
      </div>
    )
  }

  // Plain render functions, not nested components: a nested component is a new type
  // every render, which remounts its DOM and cancels an in-progress drag.
  // One cell of the day: a placed game, or a drop target while a game is picked up.
  function renderCell(f: SField, s: string, si: number, mini = false) {
    const g = cellMap[s + '|' + f.fullName]
    const closed = closedAt(f.fullName, s)
    const status = sel && !g && !closed ? placementStatus(sel, si, p.dayGames, p.slots, p.increment) : null
    const wrongField = !!(status && status !== 'blocked' && p.fieldAllows && !p.fieldAllows(f.fullName, sel!.division))
    const bt = status && status !== 'blocked' && isBracket(sel!) ? bracketTiming(sel!, s, p.activeDate, p.games, p.increment) : null
    const h = bt?.early ? { ...HINT.early, label: `Before ${bt.early}` } : wrongField ? HINT.field : status === 'valid' && bt?.b2b ? HINT.risk : status ? HINT[status] : null
    return (
      <div key={f.fullName + '|' + s} className="relative border-b border-slate-200 border-r border-slate-100 min-w-0"
        title={closed && !g ? `${f.fieldName} is closed at ${p.fmtTime(s)}` : undefined}
        onDragOver={e => {
          if (!g && !closed) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; return }
          // onto another placed game: the two trade places
          if (g && p.onSwap && draggingPlaced && dragId !== g.id) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (swapOver !== g.id) setSwapOver(g.id) }
        }}
        onDragLeave={e => { if (g && swapOver === g.id && !e.currentTarget.contains(e.relatedTarget as Node | null)) setSwapOver(null) }}
        onDrop={e => {
          e.preventDefault(); setSwapOver(null)
          const id = dropTarget(e); const src = id ? p.games.find(x => x.id === id) : null
          if (src && !g) place(src, s, f.fullName)
          else if (src && g && src.id !== g.id && isPlaced(src)) doSwap(src.id, g.id)
          setDragId(null)
        }}
        onClick={() => { if (!g && sel && status !== 'blocked') place(sel, s, f.fullName) }}
        style={{ cursor: !g && status && status !== 'blocked' ? 'copy' : undefined, background: closed && !g ? 'repeating-linear-gradient(135deg,#ffffff 0 8px,#fef2f2 8px 10px)' : undefined }}>
        {g ? renderGameCard(g, mini) : h ? (
          <div className={`absolute ${mini ? 'inset-0.5 rounded' : 'inset-1 rounded-lg'} flex items-center justify-center text-[10px] font-bold overflow-hidden`} style={{ border: `1.5px dashed ${h.border}`, background: h.bg, color: h.text }} title={h.label}>{mini ? null : h.label}</div>
        ) : null}
      </div>
    )
  }

  // fields-down: one row per field, a cell per time slot
  function renderFieldRow(f: SField) {
    const n = p.dayGames.filter(g => g.location === f.fullName).length
    const mf = minFields.has(f.fullName)
    return (
      <Fragment key={f.fullName}>
        <div {...fieldDrag(f)} title={p.onReorderFields ? `${f.fieldName} · drag to move this field` : undefined}
          className={`sticky left-0 z-10 border-b border-r border-slate-200 pl-1 pr-0.5 flex items-center gap-0.5 min-w-0 ${isClosed(f.fullName) ? 'bg-red-50' : 'bg-white'} ${p.onReorderFields ? 'cursor-grab active:cursor-grabbing' : ''} ${dragField === f.fullName ? 'opacity-40' : ''}`}
          style={dropEdge(f)}>
          {mf ? (
            <button onClick={() => toggleMinField(f.fullName)} title={`Show ${f.fieldName}`} className="flex-1 text-left pl-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-900 truncate">{f.fieldName}</button>
          ) : (<>
            {p.onReorderFields && <GripVertical size={12} className="text-slate-300 flex-shrink-0" />}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
              <span className={`text-xs font-extrabold truncate ${isClosed(f.fullName) ? 'text-red-700 line-through decoration-red-300' : 'text-slate-900'}`}>{f.fieldName}</span>
              <span className={`text-[10px] truncate ${isClosed(f.fullName) ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{isClosed(f.fullName) ? closedShort(f.fullName) : `${f.venueName} · ${n}`}</span>
            </div>
            {p.onToggleClosed && <button onClick={() => p.onToggleClosed!(f.fullName)} title={isClosed(f.fullName) ? closedTitle(f.fullName) : 'Close this field for all or part of this day: nothing can be placed there by hand or by Auto-fill'} aria-label={isClosed(f.fullName) ? `Change or reopen ${f.fieldName}` : `Close ${f.fieldName} for all or part of this day`} aria-pressed={isClosed(f.fullName)} className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center ${isClosed(f.fullName) ? 'text-red-600 bg-red-100' : 'text-slate-300 hover:bg-slate-200 hover:text-slate-700'}`}><Ban size={11} /></button>}
            <button onClick={() => toggleMinField(f.fullName)} title="Minimize this field" aria-label={`Minimize ${f.fieldName}`} className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-slate-300 hover:bg-slate-200 hover:text-slate-700"><Minimize2 size={11} /></button>
          </>)}
        </div>
        {p.slots.map((s, si) => renderCell(f, s, si, mf || minSlots.has(s)))}
      </Fragment>
    )
  }

  // fields-across: one row per time slot, a cell per field
  function renderSlotRow(s: string, si: number) {
    const n = perSlot[si]
    const ms = minSlots.has(s)
    return (
      <Fragment key={s}>
        <div className={`sticky left-0 z-10 bg-white border-b border-r border-slate-200 ${allTimesMin ? 'pl-1' : 'pl-2.5'} pr-0.5 flex items-center gap-0.5 min-w-0`}>
          {ms ? (
            <button onClick={() => toggleMinSlot(s)} title={`${p.fmtTime(s)} · ${n} game${n === 1 ? '' : 's'}. Click to show at full size.`} className="flex-1 text-left text-[10px] font-bold text-slate-500 hover:text-slate-900 truncate whitespace-nowrap">{allTimesMin ? ampm(p.fmtTime(s)) : p.fmtTime(s)}<span className="font-normal text-slate-400">{allTimesMin ? `·${n}` : ` · ${n}`}</span></button>
          ) : (<>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <span className="text-xs font-extrabold text-slate-900 truncate">{p.fmtTime(s)}</span>
              <span className="h-1 rounded-full" style={{ width: `${Math.round(100 * n / Math.max(1, p.fields.length))}%`, background: n >= p.fields.length ? '#ef4444' : n ? '#14b8a6' : '#e2e8f0' }} />
            </div>
            <button onClick={() => toggleMinSlot(s)} title="Minimize this time" aria-label={`Minimize ${p.fmtTime(s)}`} className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center text-slate-300 hover:bg-slate-200 hover:text-slate-700"><Minimize2 size={11} /></button>
          </>)}
        </div>
        {p.fields.map(f => renderCell(f, s, si, ms || minFields.has(f.fullName)))}
      </Fragment>
    )
  }

  function renderGameCard(g: SGame, mini = false) {
    const c = p.divColor(g.division)
    const items = byGame.get(g.id)
    const worst = worstOf(items)
    const k = KIND(worst)
    const on = selId === g.id, d = dim(g)
    const done = g.isCanceled || (g.score1 != null && g.score2 != null)
    // Filtered-out games (another division, or pool vs bracket) used to go gray,
    // and with a filter on most of the board lost its colors: Bo couldn't tell
    // which division was which (Oct 5 2026). They now keep their division color
    // and just fade; hovering brings one back to full strength.
    const fade = on ? '' : divOut(g) ? 'grayscale opacity-40 hover:grayscale-0 hover:opacity-100' : d ? 'opacity-60 hover:opacity-100' : done ? 'opacity-70' : ''
    const bg = on ? '#0f172a' : worst === 'conflict' || worst === 'closed' || worst === 'field' || worst === 'b2b' || worst === 'bracket' ? k!.bg : tint(g.division)
    const handlers = {
      draggable: true,
      'data-tl-game': g.id,
      onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('gameId', g.id); e.dataTransfer.effectAllowed = 'move'; setDragId(g.id); setSelId(g.id); disarmHover() },
      onMouseDown: () => disarmHover(),
      onDragEnd: () => setDragId(null),
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); disarmHover(); if (swapArmed && sel && sel.id !== g.id && isPlaced(g)) { doSwap(sel.id, g.id); return } setSelId(on ? null : g.id) },
      onMouseEnter: (e: React.MouseEvent<HTMLDivElement>) => { if (dragId || sel) return; const r = e.currentTarget.getBoundingClientRect(); armHover({ id: g.id, x: r.left + r.width / 2, y: r.bottom, below: window.innerHeight - r.bottom > 170 }) },
      onMouseLeave: () => disarmHover(g.id),
    }
    // In a minimized field or time: one line, game number in the division color.
    if (mini) return (
      <div key={g.id} {...handlers}
        className={`absolute inset-0.5 rounded px-1 flex items-center gap-1 overflow-hidden whitespace-nowrap text-[9px] leading-none ${swapArmed && !on ? 'cursor-pointer hover:ring-2 hover:ring-amber-400' : 'cursor-grab active:cursor-grabbing'} ${fade}`}
        style={{ background: bg, border: on ? '1px solid #0f172a' : k && worst !== 'gap' ? `1px solid ${k.border}` : g.ifNeeded ? `1px dashed ${IF_BORDER}` : '1px solid #e2e8f0', borderLeft: `4px solid ${c}`, boxShadow: swapOver === g.id ? '0 0 0 2px #f59e0b' : on ? `0 0 0 2px ${c}66` : undefined }}>
        <b style={{ color: on ? '#fff' : c }}>{g.gameNumber}</b>
        <GameTag g={g} on={on} mini />
        {/* Count goes before each name: a long name truncates, and the count is the
            part Bo is reading for, so it must never be the part that gets cut. */}
        {/* Each name truncates on its own, so the second team's count survives a long first name. */}
        <span className={`flex-1 min-w-0 flex items-center ${on ? 'text-slate-200' : 'text-slate-700'}`}>
          {cnt(g.division, g.team1, on)}<span className="truncate min-w-0">{humanTeam(g.team1)}</span>
          <span className="text-slate-400 flex-shrink-0 px-[3px]">v</span>
          {cnt(g.division, g.team2, on)}<span className="truncate min-w-0">{humanTeam(g.team2)}</span>
        </span>
      </div>
    )
    return (
      <div key={g.id} {...handlers}
        className={`absolute inset-1 rounded-lg px-1.5 py-1 flex flex-col gap-px overflow-hidden transition-shadow ${swapArmed && !on ? 'cursor-pointer hover:ring-2 hover:ring-amber-400' : 'cursor-grab active:cursor-grabbing'} ${on ? '' : 'hover:shadow-md'} ${fade}`}
        // Selected: dark card, but the division still shows: its stripe stays and the
        // selection ring takes the division color instead of a generic teal.
        style={{ background: bg, border: on ? '1px solid #0f172a' : k && worst !== 'gap' ? `1px solid ${k.border}` : g.ifNeeded ? `1.5px dashed ${IF_BORDER}` : '1px solid #e2e8f0', borderLeft: `${on ? 5 : 4}px solid ${c}`, boxShadow: swapOver === g.id ? '0 0 0 3px #f59e0b' : on ? `0 0 0 3px ${c}66` : undefined }}>
        <div className={`flex items-center gap-1 text-[9px] leading-none whitespace-nowrap ${on ? 'text-slate-300' : 'text-slate-500'}`}>
          <b style={{ color: on ? '#fff' : c }}>{g.gameNumber}</b>
          <span className="font-semibold truncate" style={{ color: on ? '#cbd5e1' : c }} title={g.division}>{p.divAbbr(g.division)}</span>
          {g.pool && <span className="truncate">{g.pool}</span>}
          <GameTag g={g} on={on} />
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
// Bracket preview (pop-over over the board): one division's bracket as the schedule has it
// right now -- each game's time and field, or "Not placed". Follows the picked
// game's division; the picked game is ringed and the games feeding it and fed by
// it are tinted, so "where does this go" reads off the tree. Click a game to pick it.
// ───────────────────────────────────────────────────────────────────────────────
function BracketPanel({ p, sel, onPick, onClose }: { p: ViewsProps; sel: SGame | null; onPick: (id: string) => void; onClose: () => void }) {
  const bracketDivs = useMemo(() => p.divisions.filter(d => p.games.some(g => g.division === d && isBracket(g))), [p.divisions, p.games])
  const [pickedDiv, setPickedDiv] = useState<string | null>(null)
  const div = (sel && isBracket(sel) ? sel.division : null) ?? pickedDiv ?? (p.filterDiv !== '__all__' && bracketDivs.includes(p.filterDiv) ? p.filterDiv : null) ?? bracketDivs[0] ?? ''
  const games = useMemo(() => p.games.filter(g => g.division === div && isBracket(g)), [p.games, div])
  const byNum = useMemo(() => new Map(games.map(g => [g.gameNumber.toUpperCase(), g])), [games])
  const refOf = (t: string) => { const m = (t || '').match(/^([WL])-(B\d+)$/i); return m ? { kind: m[1].toUpperCase(), num: m[2].toUpperCase() } : null }
  const depth = useMemo(() => {
    const d = new Map<string, number>()
    const go = (g: SGame, seen: Set<string>): number => {
      if (d.has(g.id)) return d.get(g.id)!
      if (seen.has(g.id)) return 0
      seen.add(g.id)
      let v = 0
      for (const t of [g.team1, g.team2]) { const r = refOf(t); const src = r ? byNum.get(r.num) : undefined; if (src) v = Math.max(v, go(src, seen) + 1) }
      d.set(g.id, v); return v
    }
    games.forEach(g => go(g, new Set()))
    return d
  }, [games, byNum])
  const num = (a: SGame, b: SGame) => a.gameNumber.localeCompare(b.gameNumber, undefined, { numeric: true })
  const main = games.filter(g => g.bracketSection !== 'consolation' && !(g.bracketSection === '' && /^L-/i.test(g.team1) && /^L-/i.test(g.team2)))
  const cons = games.filter(g => !main.includes(g)).sort((a, b) => (depth.get(a.id)! - depth.get(b.id)!) || num(a, b))
  const rounds: SGame[][] = []
  main.forEach(g => { const r = depth.get(g.id) ?? 0; (rounds[r] ??= []).push(g) })
  rounds.forEach(r => r.sort(num))
  const roundName = (i: number, n: number) => i === n - 1 ? 'Final' : i === n - 2 && n >= 3 ? 'Semifinals' : `Round ${i + 1}`
  // the picked game's neighbors: what feeds it, and what it feeds
  const feeds = new Set<string>(), fedBy = new Set<string>()
  if (sel && sel.division === div) {
    for (const t of [sel.team1, sel.team2]) { const r = refOf(t); const g = r && byNum.get(r.num); if (g) feeds.add(g.id) }
    games.forEach(g => { if ([g.team1, g.team2].some(t => refOf(t)?.num === sel.gameNumber.toUpperCase())) fedBy.add(g.id) })
  }
  const c = p.divColor(div)
  const node = (g: SGame, w = 'w-full') => {
    const placed = !!(g.date && g.startTime && g.location)
    const on = sel?.id === g.id, near = feeds.has(g.id) || fedBy.has(g.id)
    const day = placed ? new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' }) : ''
    const field = placed ? (p.fields.find(f => f.fullName === g.location)?.fieldName ?? g.location.split(' - ').pop()) : ''
    return (
      <button key={g.id} onClick={() => onPick(g.id)} title={`${g.gameNumber}: ${humanTeam(g.team1)} vs ${humanTeam(g.team2)}${placed ? ` · ${day} ${p.fmtTime(g.startTime)} · ${field}` : ' · not placed yet'}`}
        className={`${w} text-left rounded-lg border bg-white px-1.5 py-1 transition-shadow hover:shadow-md ${on ? 'ring-2 ring-offset-1' : ''}`}
        style={{ borderColor: on ? c : near ? c + '99' : '#e2e8f0', background: near && !on ? c + '14' : '#fff', boxShadow: on ? `0 0 0 2px ${c}` : undefined }}>
        <div className="flex items-center gap-1 text-[9px] leading-none mb-0.5">
          <b style={{ color: c }}>{g.gameNumber}</b>
          <GameTag g={g} mini />
                  </div>
        <div className={`text-[9px] leading-none mb-0.5 truncate ${placed ? 'text-slate-500' : 'text-orange-600 font-semibold'}`}>{placed ? `${day} ${p.fmtTime(g.startTime).replace(/ ([AP])M$/, (_, x) => x.toLowerCase())} · ${field}` : 'Not placed'}</div>
        <div className="text-[10px] font-semibold text-slate-800 truncate leading-tight">{humanTeam(g.team1)}</div>
        <div className="text-[10px] text-slate-600 truncate leading-tight">{humanTeam(g.team2)}</div>
      </button>
    )
  }
  const placedN = games.filter(g => g.date && g.startTime && g.location).length
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
        <select value={div} onChange={e => setPickedDiv(e.target.value)} disabled={!!(sel && isBracket(sel))} title={sel && isBracket(sel) ? 'Following the game you picked' : 'Division'}
          className="flex-1 min-w-0 text-xs font-bold text-slate-800 bg-transparent focus:outline-none disabled:opacity-100">
          {bracketDivs.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <span className="text-[10px] text-slate-500 whitespace-nowrap">{placedN}/{games.length} placed</span>
        <button onClick={onClose} aria-label="Close the bracket" title="Close (Esc)" className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={14} /></button>
      </div>
      {games.length === 0 ? <p className="text-xs text-slate-400 text-center py-8">No bracket games yet.</p> : (
        <div className="flex-1 overflow-auto p-3 space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {rounds.map((r, i) => (
              <div key={i} className="flex-1 min-w-[132px] flex flex-col">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5 text-center">{roundName(i, rounds.length)}</div>
                <div className="flex-1 flex flex-col justify-around gap-2">{r.map(g => node(g))}</div>
              </div>
            ))}
          </div>
          {cons.length > 0 && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Consolation</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))' }}>{cons.map(g => node(g))}</div>
            </div>
          )}
          <p className="text-[10px] text-slate-400 leading-snug">Click a game to pick it up, then click a slot to place it. Ringed: the game you picked. Tinted: the games that feed it and the one it feeds.</p>
        </div>
      )}
    </div>
  )
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
            {p.divisions.map(d => { const on = d === div, cc = p.divColor(d), st = divStage(counts[d]) ? STAGE[divStage(counts[d])!] : null; return (
              <button key={d} onClick={() => p.setFilterDiv(d)} title={st?.title} className="inline-flex items-center gap-1.5 text-xs font-bold pl-2 pr-3 py-1 rounded-full border"
                style={on ? { background: cc, borderColor: cc, color: '#fff' } : st ? { background: st.bg, borderColor: st.border, color: st.text } : { background: '#fff', borderColor: '#e2e8f0', color: '#334155' }}>
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
