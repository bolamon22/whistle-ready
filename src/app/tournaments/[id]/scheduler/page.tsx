'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import TournamentNav from '../TournamentNav'
import ShortTeamsBanner from '@/components/ShortTeamsBanner'
import { affectedTeams as digestAffectedTeams } from '@/lib/scheduleDigest'
import { usePublicVisibility, PublicVisibilityMenu } from '../PublicVisibility'
import { TimelineView, TeamLanesView, useDragAutoScroll } from './SchedulerViews'
import toast, { Toaster } from 'react-hot-toast'
import { autoFill, isRealTeam, teamKey } from '@/lib/autoSchedule'
import { closuresOf, isFieldClosedAt, fieldClosure, closureLabel, withClosure, blockedKeys, isAllDay, type Closure } from '@/lib/fieldClosures'
import { divisionAbbr, teamRefKey } from '@/lib/names'
import { divisionColorMap } from '@/lib/divisionColors'
import { RefreshCw, RotateCw, Check, CheckCircle2, ArrowLeftRight, X, Send, ArrowLeft, ArrowRight, PanelRight, PanelLeft, Trash2, ChevronUp, ChevronDown, ArrowUpDown, Clock, MapPin, Building2, AlertTriangle, Zap, CloudRain, Bookmark, Eye, MoreHorizontal, Bell, Ban, PanelTop, Undo2 } from 'lucide-react'

interface Game {
  id: string
  gameNumber: string
  date: string
  startTime: string
  location: string
  division: string
  pool: string | null
  team1: string
  team2: string
  isChampionship: boolean
  isCanceled: boolean
  score1?: number | null
  score2?: number | null
  ifNeeded?: boolean   // lib/ifNeeded: only played on a certain result
  ifNeededFromBracket?: boolean
  bracketLabel?: string
  bracketSection?: string
}

interface Field {
  venueName: string
  fieldName: string
  fullName: string
  // Setup > Venues "only these divisions" list. Empty = any division.
  divRestrictions?: string[]
}

// Field objects saved in Setup carry divRestrictions; plain-string fields have none.
function restrictionsOf(f: any): string[] {
  return f && typeof f === 'object' && Array.isArray(f.divRestrictions) ? f.divRestrictions.filter((d: any) => typeof d === 'string' && d.trim()) : []
}
function flattenVenues(venueList: any[]): Field[] {
  const flat: Field[] = []
  venueList.forEach(v => {
    const flds: any[] = Array.isArray(v?.fields) ? v.fields : []
    flds.forEach(f => {
      const fieldName = typeof f === 'string' ? f : (f.name ?? String(f))
      flat.push({ venueName: v.name, fieldName, fullName: `${v.name} - ${fieldName}`, divRestrictions: restrictionsOf(f) })
    })
  })
  return flat
}

const PALETTE = [
  '#3b82f6',
  '#10b981',
  '#a855f7',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
  '#b45309',
  '#6366f1',
  '#06b6d4',
]

function getLuma(hex: string) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0,2),16)/255, g = parseInt(c.slice(2,4),16)/255, b = parseInt(c.slice(4,6),16)/255
  return 0.2126*r + 0.7152*g + 0.0722*b
}
function textColor(hex: string) { return getLuma(hex) > 0.35 ? '#1e293b' : '#ffffff' }

// Distinct per division and the same as the Divisions page (lib/divisionColors).
function divColor(div: string, colors: Record<string, string>) {
  return colors[div] ?? PALETTE[0]
}

function hmToMin(s: string): number { const p = String(s || '').split(':'); const h = parseInt(p[0]); const m = parseInt(p[1] || '0'); return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m) }
function minToHM(t: number): string { const h = Math.floor(t / 60), m = t % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }

function makeSlots(startMin: number, endMin: number, inc: number) {
  // Step continuously by `inc` minutes from the exact (minute-level) day start, so an
  // 8:10 start shows an 8:10 first row — matching the saved field availability exactly.
  const slots: string[] = []
  const step = inc > 0 ? inc : 30
  for (let t = startMin; t < endMin; t += step) {
    const h = Math.floor(t / 60), m = t % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
  }
  return slots
}

function fmtTime(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtDate(d: string) {
  if (!d) return d
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function gameType(g: Game) {
  if (g.isChampionship) return 'championship'
  if (g.gameNumber.startsWith('B')) return 'bracket'
  if (g.pool) return 'pool'
  return 'regular'
}

// One rule for every short division label (tiles, bracket ids, the builder): lib/names.
function divAbbr(div: string) { return divisionAbbr(div) }

function bracketFeeders(team: string): string | null {
  const m = team.match(/^[WL]-(B\d+)$/i)
  return m ? m[1].toUpperCase() : null
}

export default function SchedulerPage({ params }: { params: { id: string } }) {
  const [games, setGames]               = useState<Game[]>([])
  const [fields, setFields]             = useState<Field[]>([])
  const [rawVenues, setRawVenues]         = useState<{name:string,fields:string[]}[]>([])
  const [addingField, setAddingField]     = useState(false)
  const [newFieldName, setNewFieldName]   = useState('')
  const [hideEmptySlots,  setHideEmptySlots]  = useState(false)
  const [hiddenFields,    setHiddenFields]    = useState<Set<string>>(new Set())
  const [showFieldPicker, setShowFieldPicker] = useState(false)
  const [dates, setDates]               = useState<string[]>([])
  const [activeDate, setActiveDate]     = useState('')
  const [eventDays, setEventDays]       = useState<string[]>([])  // the tournament's own start..end dates
  const [increment, setIncrement]       = useState(30)
  const [storedVenuesRaw, setStoredVenuesRaw] = useState<any[]>([])
  // Name and logo for the nav bar, which was rendered with neither and showed a blank title.
  const [tMeta, setTMeta] = useState<{ name: string; logoUrl?: string }>({ name: '' })
  const [dayAvail, setDayAvail] = useState<any[]>([])  // saved per-day field availability (source of truth = venue record)
  const [loading, setLoading]           = useState(true)
  // The page sits inside the app shell (top bar + padded <main>), so "h-screen"
  // ran past the bottom of the window by the shell's height: the placing bar,
  // the bracket pop-over and the board's last rows were below the fold (Bo,
  // Oct 5 2026: "the green placing bar isn't showing up"). Size it to what is
  // actually left of the window instead, and keep it right on resize.
  const pageRef = useRef<HTMLDivElement>(null)
  const [pageH, setPageH] = useState<number | null>(null)
  useEffect(() => {
    if (loading) return
    const fit = () => {
      const el = pageRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top + window.scrollY
      const padBottom = parseFloat(getComputedStyle(el.parentElement ?? el).paddingBottom) || 0
      setPageH(Math.max(420, Math.floor(window.innerHeight - top - padBottom)))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [loading])
  const [saving, setSaving]             = useState(false)
  const [unscheduling, setUnscheduling] = useState(false)
  const [dragId, setDragId]             = useState<string | null>(null)
  const [dragGame, setDragGame]         = useState<Game | null>(null)
  const [overCell, setOverCell]         = useState<string | null>(null)
  // Legacy grid: scroll while a game is dragged near the edge (see useDragAutoScroll).
  const gridScrollRef = useRef<HTMLDivElement>(null)
  useDragAutoScroll(gridScrollRef, !!dragId)
  const [autoFilling, setAutoFilling]   = useState(false)
  const [gridZoom, setGridZoom]         = useState(1)
  const [splitMode, setSplitMode]       = useState<'d1d2'|'spread'|'oneday'>('d1d2')
  // Auto-fill dialog: what to place, where, and how many games per team on each day.
  const [showAF, setShowAF]     = useState(false)
  const [afDiv, setAfDiv]       = useState('__all__')
  const [afType, setAfType]     = useState<'pool' | 'bracket' | 'both'>('pool')
  const [afFields, setAfFields] = useState<Set<string>>(new Set())
  const [afCaps, setAfCaps]     = useState<Record<string, number>>({})   // date -> max games per team (0 = skip)
  const [showWeather, setShowWeather] = useState(false)
  const [wxDelay, setWxDelay]         = useState(30)
  const [wxFrom, setWxFrom]           = useState('')
  const [wxBusy, setWxBusy]           = useState(false)
  const [wxMode, setWxMode]           = useState<'delay' | 'shorten'>('delay')
  const [wxSlot, setWxSlot]           = useState(40)

  // ── Parking lot filters ──────────────────────────────────────────────────
  const [filterDiv,        setFilterDiv]        = useState('__all__')
  const [filterPool,       setFilterPool]       = useState('__all__')
  const [filterTeam,       setFilterTeam]       = useState('__all__')
  const [filterType,       setFilterType]       = useState('__all__')
  const [showRestricted,   setShowRestricted]   = useState(false)
  const [lotExpanded,      setLotExpanded]      = useState(false)

  // ── Swap mode ────────────────────────────────────────────────────────────
  const [swapMode,       setSwapMode]       = useState(false)
  const [swapSourceId,   setSwapSourceId]   = useState<string | null>(null)

  // ── Parking lot order (for drag-to-reorder) ──────────────────────────────
  const [lotOrder,     setLotOrder]     = useState<string[]>([])
  const [lotDragOver,  setLotDragOver]  = useState<string | null>(null)
  const [sideStage,    setSideStage]    = useState(false)
  // Board / Timeline: parking lot docked across the top instead of the left rail.
  // The Grid has had this for a while; Bo flips between the two depending on the
  // job, so it is remembered per tournament on this device.
  const [boardLotTop, setBoardLotTopRaw] = useState(false)
  useEffect(() => { try { setBoardLotTopRaw(localStorage.getItem(`wr-sched-lot-top:${params.id}`) === '1') } catch {} }, [params.id])
  const setBoardLotTop = (v: boolean) => { setBoardLotTopRaw(v); try { localStorage.setItem(`wr-sched-lot-top:${params.id}`, v ? '1' : '0') } catch {} }
  const [scratchPad,   setScratchPad]   = useState<string[]>([])

  const [divColorMap,  setDivColorMap]  = useState<Record<string, string>>({})

  // ── Draft/publish versioning ─────────────────────────────────────────────
  const [snapshot,       setSnapshot]       = useState<Record<string, {date:string,startTime:string,location:string}>>({})
  const [checkpoint, setCheckpoint] = useState<Record<string, {date:string,startTime:string,location:string}> | null>(null)
  const [viewingCheckpoint, setViewingCheckpoint] = useState(false)
  const [publishedAt,    setPublishedAt]    = useState<string | null>(null)
  const [publishing,     setPublishing]     = useState(false)
  const [showDiff,       setShowDiff]       = useState(false)
  // Who a Publish reaches, per team, from GET /publish: follows and phones with
  // alerts on. And Bo's toggle -- on by default, off for a quiet publish.
  // Keyed by teamRefKey(division, team): the same club name plays in several divisions.
  const [followers,      setFollowers]      = useState<Record<string, { follows: number; phones: number }>>({})
  const [notifyFollowers, setNotifyFollowers] = useState(true)
  const [visKey,         setVisKey]         = useState(0)
  // The header's "Tools" menu: the seldom-used actions, so the bar fits on one line.
  const [toolsOpen,      setToolsOpen]      = useState(false)
  // "Clear games" panel in Tools: which games to send back to Unscheduled.
  const [clrDiv,  setClrDiv]  = useState('__all__')
  const [clrDay,  setClrDay]  = useState<'day' | 'all'>('all')
  const [clrType, setClrType] = useState<'all' | 'pool' | 'bracket'>('all')
  const toolsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!toolsOpen) return
    const close = (e: MouseEvent) => { if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [toolsOpen])
  // Issue tooltip for a game card: opens on hovering anywhere on the card (the badge
  // alone was a 16px target behind a slow native title), click the badge to pin it.
  const [issueTip,       setIssueTip]       = useState<{ id: string; left: number; top: number; bottom: number; pinned: boolean } | null>(null)
  useEffect(() => {
    if (!issueTip) return
    // Its position is a snapshot of the card's, so any scroll closes it.
    const close = () => setIssueTip(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', onKey) }
  }, [issueTip])
  const { vis: publicVis, update: updatePublicVis } = usePublicVisibility(params.id, visKey)

  // ── Grid filters ─────────────────────────────────────────────────────────
  const [gridDiv,  setGridDiv]  = useState('__all__')
  // Which layout of the day to show. The grid is the original; Timeline and Teams
  // are the redesigned views (SchedulerViews.tsx). Remembered per tournament.
  type SchedView = 'grid' | 'board' | 'timeline' | 'teams'
  const [schedView, setSchedViewRaw] = useState<SchedView>('grid')
  useEffect(() => { try { const v = localStorage.getItem(`wr-sched-view-${params.id}`); if (v === 'board' || v === 'timeline' || v === 'teams') setSchedViewRaw(v) } catch {} }, [params.id])
  const setSchedView = (v: SchedView) => { setSchedViewRaw(v); try { localStorage.setItem(`wr-sched-view-${params.id}`, v) } catch {} }
  const [gridPool, setGridPool] = useState('__all__')
  const [gridTeam, setGridTeam] = useState('__all__')
  const [gridType, setGridType] = useState('__all__')

  useEffect(() => {
    async function load() {
      const [gRes, vRes, tRes, pRes, cRes] = await Promise.all([
        fetch(`/api/tournaments/${params.id}/games`),
        fetch(`/api/venues/${params.id}`),
        fetch(`/api/tournaments/${params.id}`),
        fetch(`/api/tournaments/${params.id}/publish`),
        fetch(`/api/tournaments/${params.id}/division-colors`),
      ])
      const gData = await gRes.json()
      const vData = await vRes.json()
      const tData = await tRes.json()
      const pData = await pRes.json()
      const cData = await cRes.json()
      if (pData.followers) setFollowers(pData.followers)
      if (pData.publishedAt) {
        setPublishedAt(pData.publishedAt)
        const snap: Record<string, {date:string,startTime:string,location:string}> = {}
        ;(pData.snapshot?.games ?? []).forEach((g: any) => {
          snap[g.id] = { date: g.date, startTime: g.startTime, location: g.location }
        })
        setSnapshot(snap)
      }

      const allGames: Game[] = Array.isArray(gData) ? gData : (gData.games ?? [])
      setGames(allGames)
      if (cData && typeof cData === 'object' && !cData.error) setDivColorMap(cData)
      if (tData && typeof tData.name === 'string') setTMeta({ name: tData.name, logoUrl: tData.logoUrl || undefined })
      if (tData.scheduleIncrement) setIncrement(Number(tData.scheduleIncrement))

      const venueList: any[] = vData.venues ?? []
      const flat = flattenVenues(venueList)
      setRawVenues(venueList.map(v => ({ name: v.name, fields: (Array.isArray(v.fields) ? v.fields : []).map((f: any) => typeof f === 'string' ? f : (f.name ?? String(f))) })))
      setFields(flat)
      setStoredVenuesRaw(venueList)
      // Initialize the day window from saved daily availability (set at creation / in Setup)
      const avail: any[] = vData.defaultAvailability ?? []
      setDayAvail(avail)

      // Day tabs: every day of the event, plus any date a game already sits on.
      // Tabs used to come from game dates alone, so a day with nothing scheduled on
      // it yet (or one whose games were all unscheduled) disappeared, and the only
      // way to put a game there again was "Add Day".
      const gameDates = [...new Set(allGames.map(g => g.date).filter(Boolean))] as string[]
      const eventDates: string[] = []
      if (tData.startDate && tData.endDate && /^\d{4}-\d{2}-\d{2}/.test(tData.startDate) && /^\d{4}-\d{2}-\d{2}/.test(tData.endDate)) {
        const d1 = new Date(tData.startDate.slice(0, 10) + 'T12:00:00')
        const d2 = new Date(tData.endDate.slice(0, 10) + 'T12:00:00')
        for (const d = new Date(d1); d <= d2 && eventDates.length < 14; d.setDate(d.getDate() + 1))
          eventDates.push(d.toISOString().split('T')[0])
      }
      let allDates = [...new Set([...eventDates, ...gameDates])].sort()
      if (allDates.length === 0) {
        const t = new Date()
        allDates = [t.toISOString().split('T')[0], new Date(t.getTime() + 86400000).toISOString().split('T')[0]]
      }

      setEventDays(eventDates)
      setDates(allDates)
      setActiveDate(allDates[0] ?? '')
      setLoading(false)
    }
    load()
  }, [params.id])

  // Keep lotOrder in sync: add new unscheduled game IDs, remove scheduled ones
  useEffect(() => {
    setLotOrder(prev => {
      const unscheduledIds = games.filter(g => !g.date || !g.startTime || !g.location).map(g => g.id)
      const kept  = prev.filter(id => unscheduledIds.includes(id))
      const added = unscheduledIds.filter(id => !prev.includes(id))
        .sort((a, b) => {
          const ga = games.find(x => x.id === a), gb = games.find(x => x.id === b)
          const divCmp = (ga?.division ?? '').localeCompare(gb?.division ?? '')
          if (divCmp !== 0) return divCmp
          return (ga?.gameNumber ?? '').localeCompare(gb?.gameNumber ?? '', undefined, { numeric: true })
        })
      // Also re-sort kept items by division→gameNumber so the full list stays ordered
      const allSorted = [...kept, ...added].sort((a, b) => {
        const ga = games.find(x => x.id === a), gb = games.find(x => x.id === b)
        const divCmp = (ga?.division ?? '').localeCompare(gb?.division ?? '')
        if (divCmp !== 0) return divCmp
        return (ga?.gameNumber ?? '').localeCompare(gb?.gameNumber ?? '', undefined, { numeric: true })
      })
      return allSorted
    })
  }, [games])

  // Update ONLY the active day's window — never flatten or clobber the other days'
  // saved availability (which may carry per-day, minute-level hours set in Setup/Settings).
  async function persistDayWindow(startStr: string, endStr: string) {
    const target = activeDate || dates[0] || ''
    if (!target || !startStr || !endStr) return
    const newSlot = { start: startStr, end: endStr }
    const next = dayAvail.some((d: any) => d.date === target)
      ? dayAvail.map((d: any) => d.date === target ? { ...d, slots: [newSlot] } : d)
      : [...dayAvail, { date: target, slots: [newSlot] }]
    setDayAvail(next)
    try {
      await fetch(`/api/venues/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venues: storedVenuesRaw, defaultAvailability: next }),
      })
    } catch { /* non-fatal */ }
  }

  // Fields closed for a day, or part of one (Oct 2026). Bo: "3B I'm not going to
  // be using on Saturday", and later "we might use it for the first half of the
  // day and then it's converted to one big field". Closures live on the day's
  // availability record beside its hours (see src/lib/fieldClosures.ts), so they
  // ride along with the venue and the same day on another device sees them.
  // Games already inside a closed window stay put and are flagged; closing never
  // moves anything.
  const closuresFor = (date: string): Closure[] => closuresOf(dayAvail.find((x: any) => x.date === date))
  const closuresToday = closuresFor(activeDate)
  const closedAt = (field: string, time: string) => isFieldClosedAt(closuresToday, field, time)
  // Setup says which divisions fit on a field (e.g. small fields: younger divisions only).
  const fieldAllows = (fullName: string, division: string) => {
    const lim = fields.find(f => f.fullName === fullName)?.divRestrictions ?? []
    if (!lim.length || !division) return true
    const d = division.trim().toLowerCase()
    return lim.some(x => x.trim().toLowerCase() === d)
  }
  const fieldNameOf = (fullName: string) => fields.find(f => f.fullName === fullName)?.fieldName ?? fullName
  // Not a hard block (a director may knowingly override), but never silent.
  const okForField = (g: Game | undefined, fullName: string) => {
    if (!g || !fullName || fieldAllows(fullName, g.division)) return true
    return window.confirm(`${fieldNameOf(fullName)} is set in Setup for other divisions only, not ${g.division}.\n\nPlace game ${g.gameNumber} there anyway?`)
  }
  const closedLabelFor = (field: string) => closureLabel(fieldClosure(closuresToday, field), fmtTime)
  const [closeDlg, setCloseDlg] = useState<{ field: string; mode: 'day' | 'part'; from: string; to: string } | null>(null)
  function openCloseDialog(fullName: string) {
    const cur = fieldClosure(closuresToday, fullName)
    const part = !!cur && !isAllDay(cur)
    setCloseDlg({ field: fullName, mode: part ? 'part' : 'day', from: (part && cur?.from) || '', to: (part && cur?.to) || '' })
  }
  async function saveClosure(fullName: string, next: Closure | null) {
    const target = activeDate || dates[0] || ''
    if (!target) return
    const f = fields.find(x => x.fullName === fullName)
    const name = f?.fieldName ?? fullName
    if (next) {
      const probe = [next]
      const n = games.filter(g => g.date === target && g.location === fullName && g.startTime && isFieldClosedAt(probe, fullName, g.startTime)).length
      if (n > 0 && !confirm(`${name} has ${n} game${n === 1 ? '' : 's'} in that window on ${fmtDate(target)}. Close it anyway?\n\nThe games stay where they are and are flagged until you move them. Nothing new can be placed there.`)) return
    }
    const cur = dayAvail.find((x: any) => x.date === target)
    const entry = withClosure(cur ?? { date: target, slots: [] }, fullName, next)
    const nextAvail = cur ? dayAvail.map((d: any) => d.date === target ? entry : d) : [...dayAvail, entry]
    setDayAvail(nextAvail)
    setCloseDlg(null)
    try {
      const r = await fetch(`/api/venues/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venues: storedVenuesRaw, defaultAvailability: nextAvail }),
      })
      if (!r.ok) throw new Error()
      const label = closureLabel(next, fmtTime)
      toast.success(next ? `${name}: ${label!.toLowerCase()} on ${fmtDate(target)}` : `${name} is open all day on ${fmtDate(target)}`)
    } catch { toast.error('Could not save that. Reload and try again.') }
  }

  // The scheduler only edits field names and order, but Setup stores more on each
  // venue (address, map links) and each field (id, abbreviation, availability window,
  // division limits). Saving just {name, fields: string[]} wiped all of that, so the
  // stored objects are carried through and only brand-new fields get new ones.
  function mergeVenues(next: {name:string,fields:string[]}[]) {
    const nameOf = (f: any) => typeof f === 'string' ? f : (f?.name ?? String(f))
    return next.map(v => {
      const old = storedVenuesRaw.find((x: any) => x?.name === v.name)
      const oldFields: any[] = Array.isArray(old?.fields) ? old.fields : []
      const asObjects = oldFields.some(f => typeof f !== 'string')
      return {
        ...(old ?? {}), name: v.name,
        fields: v.fields.map(fn => oldFields.find(f => nameOf(f) === fn) ?? (asObjects ? { id: Math.random().toString(36).slice(2, 10), name: fn } : fn)),
      }
    })
  }

  async function saveVenues(venues: {name:string,fields:string[]}[]) {
    const merged = mergeVenues(venues)
    setRawVenues(venues)
    setStoredVenuesRaw(merged)
    setFields(flattenVenues(merged))
    // Preserve the saved per-day availability — only venues/fields change here.
    const r = await fetch(`/api/venues/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venues: merged, defaultAvailability: dayAvail }),
    }).catch(() => null)
    if (!r || !r.ok) toast.error('Could not save the field change. Reload and try again.')
  }

  // Board/Timeline: a field header dropped on another takes its place. The order is
  // saved on the venue, so the grid, auto-fill and the public page follow it too. A
  // field can't leave its venue; dropped on another venue's field, its venue moves.
  async function reorderField(fromFull: string, toFull: string) {
    const from = fields.find(f => f.fullName === fromFull), to = fields.find(f => f.fullName === toFull)
    if (!from || !to || fromFull === toFull) return
    const next = rawVenues.map(v => ({ ...v, fields: [...v.fields] }))
    if (from.venueName === to.venueName) {
      const v = next.find(x => x.name === from.venueName)
      if (!v) return
      const i = v.fields.indexOf(from.fieldName), j = v.fields.indexOf(to.fieldName)
      if (i < 0 || j < 0) return
      v.fields.splice(i, 1); v.fields.splice(j, 0, from.fieldName)
    } else {
      const i = next.findIndex(x => x.name === from.venueName), j = next.findIndex(x => x.name === to.venueName)
      if (i < 0 || j < 0) return
      const [v] = next.splice(i, 1); next.splice(j, 0, v)
    }
    await saveVenues(next)
  }

  async function addField() {
    const name = newFieldName.trim()
    if (!name) return
    const updated = rawVenues.length > 0
      ? rawVenues.map((v, i) => i === 0 ? { ...v, fields: [...v.fields, name] } : v)
      : [{ name: 'Fields', fields: [name] }]
    setAddingField(false)
    setNewFieldName('')
    await saveVenues(updated)
    toast.success(`${name} added`)
  }

  async function removeField(fullName: string) {
    const field = fields.find(f => f.fullName === fullName)
    if (!field) return
    const hasGames = games.some(g => g.location === fullName && g.date === activeDate)
    if (hasGames && !confirm(`${field.fieldName} has games scheduled today. Remove anyway?`)) return
    const updated = rawVenues.map(v =>
      v.name === field.venueName ? { ...v, fields: v.fields.filter(f => f !== field.fieldName) } : v
    ).filter(v => v.fields.length > 0)
    await saveVenues(updated)
    toast.success(`${field.fieldName} removed`)
  }

  async function patchGame(gameId: string, patch: Partial<Pick<Game, 'date' | 'startTime' | 'location'>>): Promise<Game | null> {
    setSaving(true)
    const res = await fetch(`/api/tournaments/${params.id}/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    let saved: Game | null = null
    if (res.ok) {
      const updated = await res.json()
      saved = updated
      setGames(prev => prev.map(g => g.id === gameId ? { ...g, ...updated } : g))
    } else {
      toast.error('Failed to update game')
    }
    setSaving(false)
    return saved
  }

  // ── Undo for moves made by hand ─────────────────────────────────────────────
  // Drag, place, unschedule and swap, newest last, up to 30 steps back (Bo, Oct 5:
  // "we move something somewhere and you don't remember where it came from").
  // Each step keeps where its games were and where they went. The bulk tools
  // (Auto-fill, unschedule all, weather, re-stack) keep Checkpoint and Revert.
  type Spot = { date: string; startTime: string; location: string }
  type UndoStep = { label: string; moves: { id: string; from: Spot; to: Spot }[] }
  const [undoStack, setUndoStack] = useState<UndoStep[]>([])
  const [undoing, setUndoing] = useState(false)
  const spotOf = (g: Partial<Spot>): Spot => ({ date: g.date || '', startTime: g.startTime || '', location: g.location || '' })
  const sameSpot = (a: Spot, b: Spot) => a.date === b.date && a.startTime === b.startTime && a.location === b.location
  const pushUndo = (step: UndoStep) => setUndoStack(st => [...st, step].slice(-30))
  const gameName = (g: Game) => `${g.gameNumber} (${g.division})`
  const spotPhrase = (sp: Spot) => {
    if (!sp.location) return 'in the Parking Lot'
    const field = fields.find(f => f.fullName === sp.location)?.fieldName || sp.location
    return `on ${field} at ${fmtTime(sp.startTime)}${sp.date !== activeDate ? `, ${fmtDate(sp.date)}` : ''}`
  }

  /** A move made by hand: saves it and remembers where the game was, for Undo. */
  async function moveGame(gameId: string, to: Spot) {
    const g = games.find(x => x.id === gameId)
    const saved = await patchGame(gameId, to)
    if (g && saved && !sameSpot(spotOf(g), spotOf(saved)))
      pushUndo({ label: `move ${gameName(g)}`, moves: [{ id: g.id, from: spotOf(g), to: spotOf(saved) }] })
  }

  // The placing bar's "Time" editor: an exact day / start / field, any minute.
  // Same guards as a drop (taken, closed, wrong field), plus a warning when it
  // overlaps a game on that field that starts less than one slot away.
  async function setSpot(id: string, spot: Spot): Promise<boolean> {
    const g = games.find(x => x.id === id)
    if (!g) return false
    const fname = fields.find(f => f.fullName === spot.location)?.fieldName ?? spot.location
    const taken = games.find(x => x.id !== id && x.date === spot.date && x.startTime === spot.startTime && x.location === spot.location)
    if (taken) { toast.error(`${fname} at ${fmtTime(spot.startTime)} already has ${gameName(taken)}`); return false }
    if (isFieldClosedAt(closuresFor(spot.date), spot.location, spot.startTime)) { toast.error(`${fname} is closed at ${fmtTime(spot.startTime)} that day`); return false }
    if (!okForField(g, spot.location)) return false
    const t = hmToMin(spot.startTime)
    const near = games.find(x => x.id !== id && x.date === spot.date && x.location === spot.location && x.startTime && Math.abs(hmToMin(x.startTime) - t) < increment)
    if (near && !window.confirm(`${gameName(near)} starts at ${fmtTime(near.startTime)} on ${fname}, less than ${increment} minutes away. Put ${g.gameNumber} at ${fmtTime(spot.startTime)} anyway?`)) return false
    await moveGame(id, spot)
    toast.success(`${g.gameNumber} set to ${fmtTime(spot.startTime)} on ${fname}${spot.date !== activeDate ? `, ${fmtDate(spot.date)}` : ''}`)
    return true
  }

  async function undoLast() {
    const step = undoStack[undoStack.length - 1]
    if (!step || undoing) return
    setUndoing(true)
    setUndoStack(st => st.slice(0, -1))
    try {
      // Go by what is saved now: a game someone has moved since stays where it is,
      // and a game only goes back into a slot that is still free.
      let now: Game[] = games
      try {
        const r = await fetch(`/api/tournaments/${params.id}/games`)
        if (r.ok) { const d = await r.json(); now = Array.isArray(d) ? d : (d.games ?? games) }
      } catch { /* offline: go by what this page shows */ }
      const ids = new Set(step.moves.map(m => m.id))
      const back = step.moves.filter(m => {
        const g = now.find(x => x.id === m.id)
        if (!g || !sameSpot(spotOf(g), m.to)) return false
        return !m.from.location || !now.some(o => !ids.has(o.id) && !o.isCanceled && sameSpot(spotOf(o), m.from))
      })
      const ok = await Promise.all(back.map(m => fetch(`/api/tournaments/${params.id}/games/${m.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m.from),
      }).then(r => r.ok).catch(() => false)))
      const done = back.filter((_, i) => ok[i])
      setGames(now.map(g => { const m = done.find(x => x.id === g.id); return m ? { ...g, ...m.from } : g }))
      setScratchPad(prev => prev.filter(id => !done.some(m => m.id === id && m.from.location)))
      const named = (id: string) => { const g = now.find(x => x.id === id); return g ? gameName(g) : 'A game' }
      if (done.length === 1 && step.moves.length === 1) toast.success(`Undone: ${named(done[0].id)} is back ${spotPhrase(done[0].from)}`)
      else if (done.length) toast.success(`Undone: ${done.map(m => named(m.id)).join(' and ')} ${done.length === 1 ? 'is' : 'are'} back where ${done.length === 1 ? 'it was' : 'they were'}`)
      const missed = step.moves.filter(m => !done.includes(m))
      if (missed.length) toast.error(`${missed.map(m => named(m.id)).join(' and ')} stayed put: moved again since, or the old slot is taken`)
    } finally {
      setUndoing(false)
    }
  }
  // Ctrl+Z (Cmd+Z on a Mac) undoes too, except while typing in a box.
  const undoKey = useRef<() => void>(() => {})
  undoKey.current = () => { if (!viewingCheckpoint && !saving) undoLast() }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      e.preventDefault()
      undoKey.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function reorderLot(draggedId: string, overId: string) {
    if (draggedId === overId) { setLotDragOver(null); return }
    const next = [...lotOrder]
    const from = next.indexOf(draggedId)
    const to   = next.indexOf(overId)
    if (from === -1 || to === -1) { setLotDragOver(null); return }
    next.splice(from, 1)
    next.splice(to, 0, draggedId)
    setLotOrder(next)
    setLotDragOver(null)

    // Renumber pool (P1…) and bracket (B1…) games independently in new order
    const unscheduledNow = games.filter(g => !g.date || !g.startTime || !g.location)
    let pNum = 1, bNum = 1
    const patches: { id: string; gameNumber: string }[] = []
    for (const id of next) {
      const g = unscheduledNow.find(x => x.id === id)
      if (!g) continue
      if (g.gameNumber.startsWith('B'))      patches.push({ id, gameNumber: `B${bNum++}` })
      else if (g.gameNumber.startsWith('P')) patches.push({ id, gameNumber: `P${pNum++}` })
    }
    if (patches.length === 0) return
    await Promise.all(patches.map(p =>
      fetch(`/api/tournaments/${params.id}/games/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameNumber: p.gameNumber }),
      })
    ))
    setGames(prev => prev.map(g => { const p = patches.find(x => x.id === g.id); return p ? { ...g, gameNumber: p.gameNumber } : g }))
    toast.success('Games renumbered')
  }

  async function renumberAll() {
    const divs = [...new Set(games.filter(g => g.pool).map(g => g.division))]
    await Promise.all(divs.map(div =>
      fetch(`/api/tournaments/${params.id}/divisions/${encodeURIComponent(div)}/pool-games`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'renumber' }),
      })
    ))
    const res = await fetch(`/api/tournaments/${params.id}/games`)
    const data = await res.json()
    setGames(Array.isArray(data) ? data : (data.games ?? []))
    toast.success('Games renumbered')
  }

  function handleDragStart(e: React.DragEvent, gameId: string) {
    if (swapMode || viewingCheckpoint) { e.preventDefault(); return }
    e.dataTransfer.setData('gameId', gameId)
    e.dataTransfer.effectAllowed = 'move'
    setDragId(gameId)
    setDragGame(games.find(g => g.id === gameId) ?? null)
  }
  function handleDragEnd() { setDragId(null); setDragGame(null); setOverCell(null) }

  function saveCheckpoint() {
    const snap: Record<string, {date:string,startTime:string,location:string}> = {}
    games.forEach(g => { snap[g.id] = { date: g.date, startTime: g.startTime, location: g.location } })
    setCheckpoint(snap); setViewingCheckpoint(false)
    toast.success('Checkpoint saved — experiment freely, then Compare, Keep, or Revert')
  }
  async function revertToCheckpoint() {
    if (!checkpoint) return
    setViewingCheckpoint(false)
    for (const g of games) {
      const cp = checkpoint[g.id]
      if (cp && (cp.date !== g.date || cp.startTime !== g.startTime || cp.location !== g.location))
        await patchGame(g.id, { date: cp.date, startTime: cp.startTime, location: cp.location })
    }
    toast.success('Reverted to the saved checkpoint')
  }
  function discardCheckpoint() { setCheckpoint(null); setViewingCheckpoint(false); toast.success('Checkpoint cleared — current schedule kept') }

  function handleDropCell(e: React.DragEvent, time: string, field: string) {
    e.preventDefault()
    setOverCell(null)
    const gameId = e.dataTransfer.getData('gameId') || dragId
    if (!gameId) return
    if (closedAt(field, time)) { toast.error(`${fields.find(f => f.fullName === field)?.fieldName ?? field} is closed at ${fmtTime(time)} on this day`); return }
    const occupied = games.find(g => g.id !== gameId && g.date === activeDate && g.startTime === time && g.location === field)
    if (occupied) { toast.error(`${field} is already booked at ${time}`); return }
    if (!okForField(games.find(g => g.id === gameId), field)) return
    setScratchPad(prev => prev.filter(id => id !== gameId))
    moveGame(gameId, { date: activeDate, startTime: time, location: field })
  }

  function handleDropParking(e: React.DragEvent) {
    e.preventDefault()
    setOverCell(null)
    const gameId = e.dataTransfer.getData('gameId') || dragId
    if (!gameId) return
    const g = games.find(x => x.id === gameId)
    setScratchPad(prev => prev.filter(id => id !== gameId))
    if (g && (g.date || g.startTime || g.location)) {
      moveGame(gameId, { date: '', startTime: '', location: '' })
    }
  }

  function handleDropScratch(e: React.DragEvent) {
    e.preventDefault()
    const gameId = e.dataTransfer.getData('gameId') || dragId
    if (!gameId) return
    if (scratchPad.includes(gameId)) return
    if (scratchPad.length >= 4) { toast.error('Scratch pad is full (max 4)'); return }
    setScratchPad(prev => [...prev, gameId])
    // Unschedule if it was on the grid
    const game = games.find(g => g.id === gameId)
    if (game && (game.date || game.startTime || game.location)) {
      moveGame(gameId, { date: '', startTime: '', location: '' })
    }
  }

  function handleSwapClick(gameId: string) {
    if (!swapMode) return
    if (!swapSourceId) { setSwapSourceId(gameId); toast('Now click the game to swap with', { icon: <RefreshCw size={16} /> }); return }
    if (swapSourceId === gameId) { setSwapSourceId(null); return }
    swapGames(swapSourceId, gameId)
    setSwapSourceId(null)
  }

  // Two placed games trade date, time and field. Shared by the Grid's swap mode and
  // the Board (drag a game onto another, or Swap on the moving bar).
  // "If needed" (lib/ifNeeded): flips at once, rolls back if the save fails.
  async function toggleIfNeeded(id: string) {
    const g = games.find(x => x.id === id)
    if (!g) return
    if (g.ifNeededFromBracket) { toast(`${g.gameNumber} is named "${g.bracketLabel}" in the bracket. Rename it there to change it.`); return }
    const on = !g.ifNeeded
    setGames(prev => prev.map(x => x.id === id ? { ...x, ifNeeded: on } : x))
    const r = await fetch(`/api/tournaments/${params.id}/if-needed`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: id, on }),
    }).catch(() => null)
    if (!r || !r.ok) {
      setGames(prev => prev.map(x => x.id === id ? { ...x, ifNeeded: !on } : x))
      toast.error('Could not save the If needed mark')
      return
    }
    toast.success(on ? `${g.gameNumber} marked If needed` : `${g.gameNumber} is a regular game again`)
  }

  async function swapGames(aId: string, bId: string) {
    const a = games.find(g => g.id === aId)
    const b = games.find(g => g.id === bId)
    if (!a || !b || a.id === b.id) return
    if (!okForField(a, b.location) || !okForField(b, a.location)) return
    setSaving(true)
    const send = (id: string, to: Game) => fetch(`/api/tournaments/${params.id}/games/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: to.date, startTime: to.startTime, location: to.location }),
    })
    const [ra, rb] = await Promise.all([send(a.id, b), send(b.id, a)])
    if (ra.ok && rb.ok) {
      setGames(prev => prev.map(g => {
        if (g.id === a.id) return { ...g, date: b.date, startTime: b.startTime, location: b.location }
        if (g.id === b.id) return { ...g, date: a.date, startTime: a.startTime, location: a.location }
        return g
      }))
      pushUndo({ label: `swap ${a.gameNumber} and ${b.gameNumber}`, moves: [{ id: a.id, from: spotOf(a), to: spotOf(b) }, { id: b.id, from: spotOf(b), to: spotOf(a) }] })
      toast.success(`Swapped ${a.gameNumber} and ${b.gameNumber}`)
    } else {
      toast.error('Swap did not save. Reloading the board.')
      fetch(`/api/tournaments/${params.id}/games`).then(r => r.ok ? r.json() : null).then(d => { if (d) setGames(Array.isArray(d) ? d : (d.games ?? [])) }).catch(() => {})
    }
    setSaving(false)
  }

  async function publishSchedule() {
    setPublishing(true)
    // Nothing to send when no follower of an affected team has alerts on, so skip the
    // server-side digest work in that case rather than asking it to notify nobody.
    const notify = notifyFollowers && notifyPlan.phones > 0
    try {
      const res = await fetch(`/api/tournaments/${params.id}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notify }),
      })
      const data = await res.json()
      if (data.ok) {
        const nt = data.notified || { teams: 0, sent: 0, failed: 0 }
        setPublishedAt(data.publishedAt)
        const snap: Record<string, {date:string,startTime:string,location:string}> = {}
        games.forEach(g => { snap[g.id] = { date: g.date, startTime: g.startTime, location: g.location } })
        setSnapshot(snap)
        setShowDiff(false)
        setVisKey(k => k + 1)
        toast.success(nt.sent > 0
          ? `Schedule published — ${nt.sent} phone${nt.sent === 1 ? '' : 's'} alerted across ${nt.teams} team${nt.teams === 1 ? '' : 's'}`
          : notify && nt.failed > 0
            ? `Schedule published — but ${nt.failed} alert${nt.failed === 1 ? '' : 's'} could not be delivered`
            : notify && nt.teams > 0
              ? 'Schedule published — no followers have alerts on yet'
              : 'Schedule published — the public page now shows it')
        setNotifyFollowers(true)
      }
    } finally { setPublishing(false) }
  }

  async function unscheduleAll() {
    const scheduled = games.filter(g => g.date || g.startTime || g.location)
    if (scheduled.length === 0) { toast('No scheduled games to unschedule'); return }
    if (!window.confirm(`Unschedule all ${scheduled.length} games across every division?`)) return
    if (!window.confirm(`Are you absolutely sure? This will move all ${scheduled.length} games back to the parking lot.`)) return
    setUnscheduling(true)
    await Promise.all(scheduled.map(g =>
      fetch(`/api/tournaments/${params.id}/games/${g.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '', startTime: '', location: '' }),
      })
    ))
    setGames(prev => prev.map(g => ({ ...g, date: '', startTime: '', location: '' })))
    toast.success(`Unscheduled all ${scheduled.length} games`)
    setUnscheduling(false)
  }

  // Bulk unschedule by division / day / game type. Takes a checkpoint first (unless one
  // is already open) so the whole thing can be undone with Revert.
  function clearTargets(div: string, day: 'day' | 'all', type: 'all' | 'pool' | 'bracket') {
    return games.filter(g =>
      (g.date || g.startTime || g.location) &&
      (div === '__all__' || g.division === div) &&
      (day === 'all' || g.date === activeDate) &&
      (type === 'all' || (type === 'bracket') === g.gameNumber.startsWith('B')))
  }
  async function unscheduleWhere(div: string, day: 'day' | 'all', type: 'all' | 'pool' | 'bracket') {
    const target = clearTargets(div, day, type)
    if (target.length === 0) { toast('Nothing scheduled matches'); return }
    const what = `${target.length} ${type === 'all' ? '' : type + ' '}game${target.length !== 1 ? 's' : ''}` +
      `${div === '__all__' ? ' across every division' : ` in ${div}`}${day === 'day' ? ` on ${fmtDate(activeDate)}` : ''}`
    if (!window.confirm(`Send ${what} back to Unscheduled?\n\nA checkpoint is saved first, so Tools > Revert puts them back.`)) return
    if (div === '__all__' && day === 'all' && type === 'all' &&
        !window.confirm(`That is the whole schedule (${target.length} games). Continue?`)) return
    if (!checkpoint) {
      const snap: Record<string, {date:string,startTime:string,location:string}> = {}
      games.forEach(g => { snap[g.id] = { date: g.date, startTime: g.startTime, location: g.location } })
      setCheckpoint(snap); setViewingCheckpoint(false)
    }
    setUnscheduling(true)
    const ids = new Set(target.map(g => g.id))
    const results = await Promise.all(target.map(g =>
      fetch(`/api/tournaments/${params.id}/games/${g.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '', startTime: '', location: '' }),
      }).then(r => r.ok).catch(() => false)
    ))
    const failed = results.filter(ok => !ok).length
    setGames(prev => prev.map(g => ids.has(g.id) ? { ...g, date: '', startTime: '', location: '' } : g))
    if (failed) toast.error(`${failed} of ${target.length} did not save — reload to see the real state`)
    else toast.success(`Unscheduled ${what}. Revert in Tools to undo.`)
    setUnscheduling(false)
  }

  async function unscheduleDivision(div: string) {
    const target = games.filter(g => g.division === div && (g.date || g.startTime || g.location))
    if (target.length === 0) { toast('No scheduled games in this division'); return }
    if (!window.confirm(`Unschedule all ${target.length} game${target.length !== 1 ? 's' : ''} for "${div}"?`)) return
    setUnscheduling(true)
    await Promise.all(target.map(g =>
      fetch(`/api/tournaments/${params.id}/games/${g.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: '', startTime: '', location: '' }),
      })
    ))
    setGames(prev => prev.map(g =>
      g.division === div ? { ...g, date: '', startTime: '', location: '' } : g
    ))
    toast.success(`Unscheduled ${target.length} game${target.length !== 1 ? 's' : ''} for ${div}`)
    setUnscheduling(false)
  }

  // A day added with "+ Add Day" that has no games on it can be taken off again. Event
  // days (start..end) and days with games stay: the tabs would rebuild them anyway.
  function removeDay(d: string) {
    setDates(prev => {
      const next = prev.filter(x => x !== d)
      if (activeDate === d) setActiveDate(next[next.length - 1] ?? '')
      return next
    })
  }

  function addDay() {
    const last = dates[dates.length - 1]
    if (!last) return
    const next = new Date(last + 'T12:00:00')
    next.setDate(next.getDate() + 1)
    const s = next.toISOString().split('T')[0]
    setDates(prev => [...prev, s])
    setActiveDate(s)
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const divisions = [...new Set(games.map(g => g.division))].sort()
  const colorsByDiv = divisionColorMap(divisions, divColorMap)
  const divGameCounts = divisions.reduce((acc, d) => {
    acc[d] = games.filter(g => g.division === d).length
    return acc
  }, {} as Record<string, number>)

  // ── Draft diff vs published snapshot ────────────────────────────────────
  const diffChanges = (() => {
    const moved: {game: Game, from: {date:string,startTime:string,location:string}, to: {date:string,startTime:string,location:string}}[] = []
    const newlyScheduled: Game[] = []
    const nowUnscheduled: Game[] = []
    const snapIds = Object.keys(snapshot)
    games.forEach(g => {
      const snap = snapshot[g.id]
      const curScheduled = !!(g.date && g.startTime && g.location)
      const wasScheduled = !!(snap?.date && snap?.startTime && snap?.location)
      if (curScheduled && wasScheduled) {
        if (snap.date !== g.date || snap.startTime !== g.startTime || snap.location !== g.location)
          moved.push({ game: g, from: snap, to: { date: g.date, startTime: g.startTime, location: g.location } })
      } else if (curScheduled && !wasScheduled) {
        newlyScheduled.push(g)
      } else if (!curScheduled && wasScheduled) {
        nowUnscheduled.push(g)
      }
    })
    return { moved, newlyScheduled, nowUnscheduled, total: moved.length + newlyScheduled.length + nowUnscheduled.length }
  })()
  const hasChanges = publishedAt ? diffChanges.total > 0 : games.some(g => g.date && g.startTime && g.location)
  // Publish also puts a hidden schedule back in front of the public, so it stays
  // usable with no changes while the schedule is hidden.
  const canPublish = hasChanges || (publicVis ? publicVis.schedule !== 'live' : false)

  // Who this Publish would alert — the same rule the server applies (lib/scheduleDigest):
  // on a first publish every scheduled team is affected; after that, the teams in games
  // that were placed, pulled or moved since the last Publish. Drives both the toolbar
  // button (ask only when somebody would actually hear about it) and the dialog toggle.
  const notifyPlan = (() => {
    const teams = digestAffectedTeams(publishedAt ? snapshot : null, games)
    const follows = teams.reduce((a, t) => a + (followers[teamRefKey(t.division, t.team)]?.follows || 0), 0)
    const phones  = teams.reduce((a, t) => a + (followers[teamRefKey(t.division, t.team)]?.phones  || 0), 0)
    return { teams, follows, phones }
  })()
  const unscheduled = games.filter(g => (!g.date || !g.startTime || !g.location) && !scratchPad.includes(g.id))

  // Parking lot: available pools based on division filter
  const parkingPools = [...new Set(
    games
      .filter(g => filterDiv === '__all__' || g.division === filterDiv)
      .map(g => g.pool).filter(Boolean) as string[]
  )].sort()

  // Parking lot: available teams based on division + pool filters
  const parkingTeams = [...new Set(
    games
      .filter(g => filterDiv === '__all__' || g.division === filterDiv)
      .filter(g => filterPool === '__all__' || g.pool === filterPool)
      .flatMap(g => [g.team1, g.team2])
      .filter(t => t && t !== 'TBD')
  )].sort()

  // Apply parking lot filters
  const filtered = unscheduled.filter(g => {
    if (filterDiv !== '__all__' && g.division !== filterDiv) return false
    if (filterPool !== '__all__' && g.pool !== filterPool) return false
    if (filterTeam !== '__all__' && g.team1 !== filterTeam && g.team2 !== filterTeam) return false
    if (filterType !== '__all__') {
      const t = gameType(g)
      if (filterType === 'pool' && t !== 'pool') return false
      if (filterType === 'bracket' && t !== 'bracket') return false
      if (filterType === 'championship' && t !== 'championship') return false
    }
    if (showRestricted && !g.isChampionship) return false
    return true
  })

  const filteredSorted = [...filtered].sort((a, b) => {
    const ai = lotOrder.indexOf(a.id), bi = lotOrder.indexOf(b.id)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1; if (bi === -1) return -1
    return ai - bi
  })

  const dayGames = games.filter(g => g.date === activeDate && g.startTime && g.location && !scratchPad.includes(g.id))
  // checkpoint compare: when viewing, render the grid from the saved snapshot (read-only)
  const cpSrc = (viewingCheckpoint && checkpoint) ? games.map(g => checkpoint[g.id] ? { ...g, ...checkpoint[g.id] } : g) : games
  const dayGamesView = cpSrc.filter(g => g.date === activeDate && g.startTime && g.location && !scratchPad.includes(g.id))
  const cpChanges = (() => {
    if (!checkpoint) return 0
    let c = 0
    games.forEach(g => { const cp = checkpoint[g.id]; if (!cp) { if (g.date && g.startTime && g.location) c++; return } if (cp.date !== g.date || cp.startTime !== g.startTime || cp.location !== g.location) c++ })
    return c
  })()
  // Per-day grid window, minute-precise, derived from the saved field availability
  // (so the Scheduler shows the exact same hours as Setup/Settings, e.g. 8:10).
  function windowForDate(date: string) {
    const pick = (slots: any[]) => {
      let sMin = 24 * 60, eMin = 0
      slots.forEach((sl: any) => { if (sl?.start) sMin = Math.min(sMin, hmToMin(sl.start)); if (sl?.end) eMin = Math.max(eMin, hmToMin(sl.end)) })
      return sMin < eMin ? { s: sMin, e: eMin } : null
    }
    const d = dayAvail.find((x: any) => x.date === date)
    return pick(d?.slots ?? []) || pick(dayAvail.flatMap((x: any) => x.slots ?? [])) || { s: 8 * 60, e: 19 * 60 }
  }
  const dayWin = windowForDate(activeDate)
  const allSlots = makeSlots(dayWin.s, dayWin.e, increment)
  // grid rows include any actual game time (so weather-shifted / off-grid games still render)
  const gridSlots = Array.from(new Set([...allSlots, ...dayGames.map(g => g.startTime), ...dayGamesView.map(g => g.startTime)])).sort((a, b) => hmToMin(a) - hmToMin(b))
  const slots = hideEmptySlots
    ? gridSlots.filter(s => dayGamesView.some(g => g.startTime === s))
    : gridSlots
  const visibleFields = fields.filter(f => !hiddenFields.has(f.fullName))

  // Open slots per day (Bo, Oct 5 2026: "so I know if I have enough available on
  // Sunday when I'm scheduling Saturday"). A slot is a start time in that day's
  // window on a shown field that isn't closed then and has no game. With a
  // division picked, only fields Setup allows for it count, and "to place" is
  // that division's unplaced games.
  const capDiv = gridDiv !== '__all__' ? gridDiv : null
  function capacityFor(d: string) {
    const w = windowForDate(d), daySlots = makeSlots(w.s, w.e, increment), cl = closuresFor(d)
    const taken = new Set(games.filter(g => g.date === d && g.startTime && g.location).map(g => `${g.startTime}|${g.location}`))
    let open = 0, total = 0
    for (const f of visibleFields) {
      if (capDiv && !fieldAllows(f.fullName, capDiv)) continue
      for (const t of daySlots) {
        if (isFieldClosedAt(cl, f.fullName, t)) continue
        total++
        if (!taken.has(`${t}|${f.fullName}`)) open++
      }
    }
    return { open, total }
  }
  const capacity: Record<string, { open: number; total: number }> = Object.fromEntries(dates.map(d => [d, capacityFor(d)]))
  const openSlotsAll = dates.reduce((n, d) => n + (capacity[d]?.open ?? 0), 0)
  const toPlaceN = capDiv ? unscheduled.filter(g => g.division === capDiv).length : unscheduled.length

  // ── Weather delay (hold + shift) ──
  const gameDone = (g: Game) => g.isCanceled || (g.score1 != null && g.score2 != null)
  const wxCutoff = wxFrom ? hmToMin(wxFrom) : -1
  const wxMovable = dayGames.filter(g => !gameDone(g) && hmToMin(g.startTime) >= wxCutoff)
  const wxOverflow = wxMovable.filter(g => hmToMin(g.startTime) + wxDelay + increment > dayWin.e)
  const wxShortenOver = (() => {
    const byField: Record<string, Game[]> = {}
    wxMovable.forEach(g => { (byField[g.location] = byField[g.location] || []).push(g) })
    let over = 0
    Object.values(byField).forEach(list => {
      const sorted = list.slice().sort((a, b) => hmToMin(a.startTime) - hmToMin(b.startTime))
      const anchor = sorted.length ? hmToMin(sorted[0].startTime) : 0
      sorted.forEach((_, i) => { if (anchor + i * wxSlot + wxSlot > dayWin.e) over++ })
    })
    return over
  })()
  async function applyShorten() {
    const L = wxSlot
    if (!wxMovable.length || L <= 0) return
    setWxBusy(true)
    const byField: Record<string, Game[]> = {}
    wxMovable.forEach(g => { (byField[g.location] = byField[g.location] || []).push(g) })
    for (const loc of Object.keys(byField)) {
      const list = byField[loc].slice().sort((a, b) => hmToMin(a.startTime) - hmToMin(b.startTime))
      const anchor = hmToMin(list[0].startTime)  // keep the first remaining game on this field put; only pack the rest tighter
      for (let i = 0; i < list.length; i++) {
        await patchGame(list[i].id, { startTime: minToHM(anchor + i * L) })
      }
    }
    setIncrement(L)
    setWxBusy(false); setShowWeather(false)
    toast.success(`Re-stacked ${wxMovable.length} game${wxMovable.length === 1 ? '' : 's'} at ${L}-min slots — review & publish`)
  }
  async function applyWeatherDelay() {
    if (!wxMovable.length || wxDelay <= 0) return
    setWxBusy(true)
    for (const g of wxMovable) {
      await patchGame(g.id, { startTime: minToHM(hmToMin(g.startTime) + wxDelay) })
    }
    setWxBusy(false); setShowWeather(false)
    toast.success(`Delayed ${wxMovable.length} game${wxMovable.length === 1 ? '' : 's'} by ${wxDelay} min — review & publish`)
  }

  function openAutoFill() {
    setAfDiv(gridDiv)
    setAfFields(new Set(visibleFields.filter(f => { const c = fieldClosure(closuresToday, f.fullName); return !(c && isAllDay(c)) }).map(f => f.fullName)))
    // Defaults: pool play up to 3 a team on the first day; bracket on the last day.
    const first = dates[0], last = dates[dates.length - 1]
    const caps: Record<string, number> = {}
    dates.forEach(d => { caps[d] = 0 })
    if (afType !== 'bracket' && first) caps[first] = 3
    if (afType !== 'pool' && last) caps[last] = Math.max(caps[last] ?? 0, 3)
    setAfCaps(caps)
    setShowAF(true)
  }
  const isBracketGame = (g: Game) => { const t = gameType(g); return t === 'bracket' || t === 'championship' }
  const afCandidates = unscheduled.filter(g =>
    (afDiv === '__all__' || g.division === afDiv) &&
    (afType === 'both' || (afType === 'bracket') === isBracketGame(g)))

  async function runAutoFill() {
    const fieldsArg = fields.filter(f => afFields.has(f.fullName)).map(f => ({ fullName: f.fullName, divRestrictions: f.divRestrictions ?? [] }))
    if (fieldsArg.length === 0) { toast.error('Pick at least one field'); return }
    const days = dates.filter(d => (afCaps[d] ?? 0) > 0)
    if (days.length === 0) { toast.error('Give at least one day a number of games per team'); return }
    if (afCandidates.length === 0) { toast('Nothing unscheduled matches'); return }
    const toA = (g: Game) => ({ id: g.id, gameNumber: g.gameNumber, division: g.division, pool: g.pool, team1: g.team1, team2: g.team2 })
    const results: { id: string; time: string; location: string; date: string }[] = []
    const occFor = (d: string) => {
      const pre = games.filter(g => g.date === d && g.startTime && g.location && !results.some(r => r.id === g.id))
        .map(g => ({ game: toA(g), time: g.startTime, location: g.location }))
      const res = results.filter(r => r.date === d).map(r => { const g = games.find(x => x.id === r.id)!; return { game: toA(g), time: r.time, location: r.location } })
      return [...pre, ...res]
    }
    const slotsFor = (d: string) => { const w = windowForDate(d); return makeSlots(w.s, w.e, increment) }
    // Each checked day takes games until every team reaches that day's number; the
    // rest roll to the next checked day. With "both", bracket games go after pool
    // play so their feeders are already on the board.
    // Pick which games a day gets before placing them, one "round" at a time: every
    // team gets its 1st game of the day before anyone gets a 2nd, and so on up to the
    // day's number. Without this, a capped day filled in game-number order and could
    // give some teams their full count and others none.
    const pickForDay = (list: Game[], d: string, cap: number) => {
      const count = new Map<string, number>()
      const key = (g: Game, t: string) => teamKey(g.division, t)
      occFor(d).forEach(p => [p.game.team1, p.game.team2].forEach(t => { if (isRealTeam(t)) { const k = teamKey(p.game.division, t); count.set(k, (count.get(k) ?? 0) + 1) } }))
      const chosen: Game[] = [], left = [...list]
      for (let k = 1; k <= cap; k++) {
        for (let i = 0; i < left.length; i++) {
          const g = left[i]
          const ts = [g.team1, g.team2].filter(isRealTeam)
          if (ts.every(t => (count.get(key(g, t)) ?? 0) < k)) {
            ts.forEach(t => count.set(key(g, t), (count.get(key(g, t)) ?? 0) + 1))
            chosen.push(g); left.splice(i, 1); i--
          }
        }
      }
      return chosen
    }
    const fill = (list: Game[]) => {
      let remaining = list
      for (const d of days) {
        if (!remaining.length) break
        const batch = pickForDay(remaining, d, afCaps[d])
        if (!batch.length) continue
        const cl = closuresFor(d), daySlots = slotsFor(d)
        const af = autoFill({ toPlace: batch.map(toA), placed: occFor(d), fields: fieldsArg, slots: daySlots, maxPerDay: afCaps[d], blocked: blockedKeys(cl, fieldsArg, daySlots) })
        af.placements.forEach(pp => results.push({ ...pp, date: d }))
        const done = new Set(af.placements.map(pp => pp.id))
        remaining = remaining.filter(g => !done.has(g.id))
      }
      return remaining.length
    }
    const pool = afCandidates.filter(g => !isBracketGame(g)), bracket = afCandidates.filter(isBracketGame)
    const unfit = fill(pool) + fill(bracket)
    if (results.length === 0) { toast.error("No room: add fields, raise a day's games per team, or widen the day window"); return }
    if (!checkpoint) {
      const snap: Record<string, {date:string,startTime:string,location:string}> = {}
      games.forEach(g => { snap[g.id] = { date: g.date, startTime: g.startTime, location: g.location } })
      setCheckpoint(snap); setViewingCheckpoint(false)
    }
    setShowAF(false)
    setAutoFilling(true)
    try {
      const ok = await Promise.all(results.map(pp =>
        fetch(`/api/tournaments/${params.id}/games/${pp.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: pp.date, startTime: pp.time, location: pp.location }),
        }).then(r => r.ok).catch(() => false)
      ))
      const byId = new Map(results.filter((_, i) => ok[i]).map(pp => [pp.id, pp]))
      setGames(prev => prev.map(g => { const pp = byId.get(g.id); return pp ? { ...g, date: pp.date, startTime: pp.time, location: pp.location } : g }))
      const perDay = days.map(d => `${fmtDate(d)} ${results.filter(r => r.date === d).length}`).join(', ')
      const failed = ok.filter(x => !x).length
      if (failed) toast.error(`${failed} of ${results.length} did not save — reload to check`)
      else toast.success(`Placed ${results.length} (${perDay})` + (unfit ? ` · ${unfit} didn't fit` : '') + ' · Revert to undo')
    } catch { toast.error('Auto-fill failed') } finally { setAutoFilling(false) }
  }

  async function autoFillDay() {
    if (filtered.length === 0) { toast('Nothing in the parking lot to place'); return }
    const day1 = dates[0] || activeDate
    const day2 = dates[1] || day1
    const lastDay = dates[dates.length - 1] || day1
    const fieldsArg = visibleFields.map(f => ({ fullName: f.fullName, divRestrictions: f.divRestrictions ?? [] }))
    const toA = (g: Game) => ({ id: g.id, gameNumber: g.gameNumber, division: g.division, pool: g.pool, team1: g.team1, team2: g.team2 })
    const isBk = (g: Game) => { const t = gameType(g); return t === 'bracket' || t === 'championship' }
    const poolGames = filtered.filter(g => !isBk(g))
    const bracketGames = filtered.filter(g => isBk(g))
    const results: { id: string; time: string; location: string; date: string }[] = []
    // occupancy on a day = pre-existing scheduled games + anything placed so far this run
    const occFor = (d: string) => {
      const pre = games.filter(g => g.date === d && g.startTime && g.location && !results.some(r => r.id === g.id))
        .map(g => ({ game: toA(g), time: g.startTime, location: g.location }))
      const res = results.filter(r => r.date === d).map(r => { const g = games.find(x => x.id === r.id)!; return { game: toA(g), time: r.time, location: r.location } })
      return [...pre, ...res]
    }
    // fill a set of games across one or more days; overflow carries to the next day (maxPerDay naturally spreads)
    const fillAcross = (toPlace: Game[], days: string[]) => {
      let remaining = toPlace
      for (const d of days) {
        if (!remaining.length) break
        const cl = closuresFor(d)
        const af = autoFill({ toPlace: remaining.map(toA), placed: occFor(d), fields: fieldsArg, slots: allSlots, blocked: blockedKeys(cl, fieldsArg, allSlots) })
        af.placements.forEach(pp => results.push({ ...pp, date: d }))
        const done = new Set(af.placements.map(pp => pp.id))
        remaining = remaining.filter(g => !done.has(g.id))
      }
      return remaining.length
    }
    let unfit = 0
    let where = ''
    if (splitMode === 'oneday') {
      unfit += fillAcross([...poolGames, ...bracketGames], [activeDate])
      where = `on ${fmtDate(activeDate)}`
    } else if (splitMode === 'spread') {
      const poolDays = dates.length ? dates : [day1]
      unfit += fillAcross(poolGames, poolDays)
      if (bracketGames.length) unfit += fillAcross(bracketGames, [lastDay])
      where = bracketGames.length
        ? `pool across ${poolDays.length} day${poolDays.length !== 1 ? 's' : ''}, bracket → ${fmtDate(lastDay)}`
        : `pool across ${poolDays.length} day${poolDays.length !== 1 ? 's' : ''}`
    } else {
      unfit += fillAcross(poolGames, [day1])
      unfit += fillAcross(bracketGames, [day2])
      where = (poolGames.length && bracketGames.length && day1 !== day2)
        ? `pool → ${fmtDate(day1)}, bracket → ${fmtDate(day2)}`
        : `on ${fmtDate((results[0] && results[0].date) || day1)}`
    }
    if (results.length === 0) { toast.error('No room to place games — add fields/time or clear some slots'); return }
    setAutoFilling(true)
    try {
      await Promise.all(results.map(pp =>
        fetch(`/api/tournaments/${params.id}/games/${pp.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: pp.date, startTime: pp.time, location: pp.location }),
        })
      ))
      const byId = new Map(results.map(pp => [pp.id, pp]))
      setGames(prev => prev.map(g => { const pp = byId.get(g.id); return pp ? { ...g, date: pp.date, startTime: pp.time, location: pp.location } : g }))
      toast.success(`Placed ${results.length} game${results.length !== 1 ? 's' : ''} (${where})` + (unfit ? ` · ${unfit} couldn't fit` : ''))
    } catch { toast.error('Auto-fill failed') } finally { setAutoFilling(false) }
  }

  // Slots where either team of the dragged game is already scheduled today
  const busySlots = (() => {
    if (!dragGame) return new Set<string>()
    // Same division only, and real teams only: a same-named team in another division,
    // or another division's "Seed 1", is not this team.
    const teams = [dragGame.team1, dragGame.team2].filter(isRealTeam)
    const s = new Set<string>()
    dayGames.forEach(g => {
      if (g.id === dragGame.id || g.division !== dragGame.division) return
      if (teams.includes(g.team1) || teams.includes(g.team2)) s.add(g.startTime)
    })
    return s
  })()

  // Grid: available pools/teams for grid filters
  const gridPools = [...new Set(
    games.filter(g => gridDiv === '__all__' || g.division === gridDiv).map(g => g.pool).filter(Boolean) as string[]
  )].sort()
  const gridTeams = [...new Set(
    games
      .filter(g => gridDiv === '__all__' || g.division === gridDiv)
      .filter(g => gridPool === '__all__' || g.pool === gridPool)
      .flatMap(g => [g.team1, g.team2])
      .filter(t => t && t !== 'TBD')
  )].sort()

  function gameMatchesGridFilter(g: Game) {
    if (gridDiv !== '__all__' && g.division !== gridDiv) return false
    if (gridPool !== '__all__' && g.pool !== gridPool) return false
    if (gridTeam !== '__all__' && g.team1 !== gridTeam && g.team2 !== gridTeam) return false
    if (gridType !== '__all__') {
      const t = gameType(g)
      if (gridType === 'pool' && t !== 'pool') return false
      if (gridType === 'bracket' && t !== 'bracket') return false
      if (gridType === 'championship' && t !== 'championship') return false
    }
    return true
  }

  // slot+field → game lookup
  const cellMap: Record<string, Game> = {}
  dayGamesView.forEach(g => { cellMap[`${g.startTime}|${g.location}`] = g })

  // ── Conflict detection ────────────────────────────────────────────────────
  const scheduledGames = games.filter(g => g.date && g.startTime)
  function slotIndex(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m }
  const conflictMsgs = new Map<string, string>()
  const backToBackMsgs = new Map<string, string>()
  const longGapMsgs = new Map<string, string>()
  // Keyed by division + name: clubs reuse team names across divisions ("H44" in Boys
  // HS A and Boys HS B are different rosters), and flagging those as double-booked
  // was a false conflict.
  const teamGames: Record<string, Game[]> = {}
  const teamLabel: Record<string, string> = {}
  scheduledGames.forEach(g => {
    ;[g.team1, g.team2].forEach(team => {
      if (!isRealTeam(team)) return // ignore bracket placeholders that repeat across divisions
      const k = teamKey(g.division, team)
      teamLabel[k] = team
      teamGames[k] = teamGames[k] ?? []
      teamGames[k].push(g)
    })
  })
  Object.entries(teamGames).forEach(([key, tg]) => {
    const team = teamLabel[key]
    // Sort by date+time for gap detection
    const sorted = [...tg].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1]
      if (a.date === b.date) {
        const diff = slotIndex(b.startTime) - slotIndex(a.startTime)
        if (diff > increment * 2) {
          const slots = Math.round(diff / increment) - 1
          const msg = `${team}: ${slots}-slot gap between ${a.startTime} and ${b.startTime}`
          longGapMsgs.set(a.id, longGapMsgs.has(a.id) ? longGapMsgs.get(a.id)! + '\n' + msg : msg)
          longGapMsgs.set(b.id, longGapMsgs.has(b.id) ? longGapMsgs.get(b.id)! + '\n' + msg : msg)
        }
      }
    }
    for (let i = 0; i < tg.length; i++) {
      for (let j = i + 1; j < tg.length; j++) {
        const a = tg[i], b = tg[j]
        if (a.date !== b.date) continue
        const diff = Math.abs(slotIndex(a.startTime) - slotIndex(b.startTime))
        if (diff === 0) {
          const msg = `${team} plays two games at ${a.startTime} — conflict!`
          conflictMsgs.set(a.id, conflictMsgs.has(a.id) ? conflictMsgs.get(a.id)! + '\n' + msg : msg)
          conflictMsgs.set(b.id, conflictMsgs.has(b.id) ? conflictMsgs.get(b.id)! + '\n' + msg : msg)
        } else if (diff === increment) {
          const [first, second] = slotIndex(a.startTime) < slotIndex(b.startTime) ? [a, b] : [b, a]
          const msg = `${team}: back-to-back at ${first.startTime} & ${second.startTime}`
          backToBackMsgs.set(a.id, backToBackMsgs.has(a.id) ? backToBackMsgs.get(a.id)! + '\n' + msg : msg)
          backToBackMsgs.set(b.id, backToBackMsgs.has(b.id) ? backToBackMsgs.get(b.id)! + '\n' + msg : msg)
        }
      }
    }
  })

  // ── Bracket dependency-order detection ──────────────────────────────────────────
  const bracketOrderMsgs = new Map<string, string>()
  scheduledGames.filter(g => g.gameNumber.startsWith('B')).forEach(g => {
    const feeders = [g.team1, g.team2].map(bracketFeeders).filter((f): f is string => f !== null)
    feeders.forEach(feederNum => {
      const feeder = games.find(x => x.gameNumber === feederNum && x.division === g.division)
      if (!feeder) return
      let msg = ''
      if (!feeder.date || !feeder.startTime) {
        msg = `${divAbbr(g.division)}-${feederNum} is not yet scheduled (must play before ${g.gameNumber})`
      } else {
        const feederTime = feeder.date + 'T' + feeder.startTime
        const gameTime = g.date + 'T' + g.startTime
        if (feederTime >= gameTime) {
          const when = feeder.date === g.date
            ? (feeder.startTime === g.startTime ? 'at the same time as' : `after (${feeder.startTime})`)
            : 'on a later date than'
          msg = `${divAbbr(g.division)}-${feederNum} scheduled ${when} ${g.gameNumber} — bracket out of order!`
        }
      }
      if (msg) bracketOrderMsgs.set(g.id, bracketOrderMsgs.has(g.id) ? bracketOrderMsgs.get(g.id)! + '\n' + msg : msg)
    })
  })

  // Every issue on a game, worst first, for the hover card.
  const ISSUE_KINDS = [
    { map: conflictMsgs,     label: 'Conflict',      dot: 'bg-red-500' },
    { map: backToBackMsgs,   label: 'Back-to-back',  dot: 'bg-yellow-400' },
    { map: bracketOrderMsgs, label: 'Bracket order', dot: 'bg-orange-500' },
    { map: longGapMsgs,      label: 'Long gap',      dot: 'bg-teal-400' },
  ]
  function gameIssues(id: string) {
    return ISSUE_KINDS.flatMap(k => (k.map.get(id) ?? '').split('\n').filter(Boolean).map(text => ({ label: k.label, dot: k.dot, text })))
  }
  function showIssues(e: React.MouseEvent, id: string, pinned = false) {
    if (dragId || gameIssues(id).length === 0) return
    const r = (e.currentTarget as HTMLElement).closest('[data-game-card]')?.getBoundingClientRect()
      ?? (e.currentTarget as HTMLElement).getBoundingClientRect()
    setIssueTip(t => (t?.pinned && !pinned && t.id !== id) ? t : { id, left: r.left, top: r.top, bottom: r.bottom, pinned })
  }
  function hideIssues(id: string) { setIssueTip(t => (t && t.id === id && !t.pinned) ? null : t) }

  const selectCls = 'text-xs bg-slate-800 text-slate-200 border border-slate-600 rounded px-2 py-0.5'
  const gridSelectCls = 'text-xs bg-white text-slate-700 border border-slate-300 rounded px-2 py-1'

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <TournamentNav id={params.id} name={tMeta.name} logoUrl={tMeta.logoUrl} />
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-teal-600 border-t-transparent rounded-full" />
      </div>
    </div>
  )

  return (
    <div ref={pageRef} className="h-screen bg-slate-50 flex flex-col overflow-hidden" style={pageH ? { height: pageH } : undefined}>
      <TournamentNav id={params.id} name={tMeta.name} logoUrl={tMeta.logoUrl} />
      <Toaster position="top-right" />

      {/* A pool short a team is short of games for everyone it was drawn
          against, and nothing else on this page would say so -- the per-game
          issue badges are about placement, not about games that do not exist.
          Computed live, so it clears itself once the pool is level again.
          Compact here: the board is what this page is for, and the fix lives on
          Divisions, which this links to. */}
      <div className="px-4 pt-3 flex-shrink-0 empty:hidden">
        <ShortTeamsBanner games={games} compact detailsHref={`/tournaments/${params.id}/divisions`} />
      </div>

      {issueTip && !dragId && (() => {
        const items = gameIssues(issueTip.id)
        if (items.length === 0) return null
        const W = 280
        const left = Math.max(8, Math.min(issueTip.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - W - 8))
        const below = (typeof window !== 'undefined' ? window.innerHeight : 800) - issueTip.bottom > 140
        return (
          <div
            className={`fixed z-[100] bg-slate-900 text-white rounded-lg shadow-xl px-3 py-2 text-xs ${issueTip.pinned ? '' : 'pointer-events-none'}`}
            style={{ left, width: W, ...(below ? { top: issueTip.bottom + 6 } : { top: issueTip.top - 6, transform: 'translateY(-100%)' }) }}
            onClick={() => setIssueTip(null)}
          >
            <ul className="space-y-1.5">
              {items.map((it, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${it.dot}`} />
                  <span><span className="font-semibold">{it.label}:</span> {it.text}</span>
                </li>
              ))}
            </ul>
            {issueTip.pinned && <p className="mt-1.5 text-[10px] text-slate-400">Click to close</p>}
          </div>
        )
      })()}

      {/* ── Diff modal ── */}
      {showDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setShowDiff(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-slate-900">{publishedAt ? 'Unpublished Changes' : 'Publish schedule'}</h2>
              <button onClick={() => setShowDiff(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none"><X size={15} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* A first publish has no "before" — every scheduled game would list as new, so summarize instead. */}
              {!publishedAt && diffChanges.newlyScheduled.length > 0 && (
                <div className="flex items-start gap-2 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-green-800">
                  <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-green-600" />
                  <span><span className="font-semibold">{diffChanges.newlyScheduled.length} game{diffChanges.newlyScheduled.length === 1 ? '' : 's'}</span> go public for the first time. The public page will show the full schedule.</span>
                </div>
              )}
              {publishedAt && diffChanges.newlyScheduled.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-green-700 mb-2"><Check size={14} /> Newly scheduled ({diffChanges.newlyScheduled.length})</h3>
                  <div className="space-y-1">
                    {diffChanges.newlyScheduled.map(g => (
                      <div key={g.id} className="text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <span className="font-semibold">{g.gameNumber}</span> · {g.division} · {g.team1} vs {g.team2}
                        <span className="ml-2 text-green-700">→ {fmtDate(g.date)} {g.startTime} @ {g.location}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {diffChanges.moved.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 mb-2"><ArrowLeftRight size={14} /> Moved ({diffChanges.moved.length})</h3>
                  <div className="space-y-1">
                    {diffChanges.moved.map(({ game: g, from, to }) => (
                      <div key={g.id} className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <span className="font-semibold">{g.gameNumber}</span> · {g.division} · {g.team1} vs {g.team2}
                        <div className="mt-0.5 text-amber-700">
                          <span className="line-through opacity-60">{fmtDate(from.date)} {from.startTime} @ {from.location}</span>
                          <span className="mx-1">→</span>
                          <span>{fmtDate(to.date)} {to.startTime} @ {to.location}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {diffChanges.nowUnscheduled.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-red-700 mb-2"><X size={14} /> Unscheduled ({diffChanges.nowUnscheduled.length})</h3>
                  <div className="space-y-1">
                    {diffChanges.nowUnscheduled.map(g => (
                      <div key={g.id} className="text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <span className="font-semibold">{g.gameNumber}</span> · {g.division} · {g.team1} vs {g.team2}
                        <span className="ml-2 text-red-600 line-through opacity-70">{fmtDate(snapshot[g.id]?.date ?? '')} {snapshot[g.id]?.startTime} @ {snapshot[g.id]?.location}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {(() => {
              const { teams, follows, phones } = notifyPlan
              const nobody = phones === 0
              return (
                <label className={`flex items-start gap-3 mx-6 mb-4 rounded-xl border px-4 py-3 ${nobody ? 'border-slate-200 bg-slate-50' : notifyFollowers ? 'border-teal-200 bg-teal-50/60' : 'border-slate-200 bg-white'} ${nobody ? 'cursor-default' : 'cursor-pointer'}`}>
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-teal-600" checked={notifyFollowers && !nobody} disabled={nobody}
                    onChange={e => setNotifyFollowers(e.target.checked)} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Bell size={14} className={nobody ? 'text-slate-400' : 'text-teal-600'} />
                      {publishedAt ? 'Tell followers their schedule changed' : 'Tell followers the schedule is out'}
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      {teams.length === 0
                        ? 'No team\u2019s games changed.'
                        : nobody
                          ? `${teams.length} team${teams.length === 1 ? '' : 's'} affected \u00b7 nobody following them has alerts on yet.`
                          : `${teams.length} team${teams.length === 1 ? '' : 's'} affected \u00b7 ${phones} phone${phones === 1 ? '' : 's'} with alerts on (${follows} follower${follows === 1 ? '' : 's'}). One message per team with its current schedule \u2014 never one per game.`}
                    </span>
                  </span>
                </label>
              )
            })()}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowDiff(false)} className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2">Cancel</button>
              <button onClick={publishSchedule} disabled={publishing}
                className="text-sm font-semibold bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg disabled:opacity-50">
                {publishing ? 'Publishing…' : <span className="inline-flex items-center gap-1.5"><Send size={14} /> Publish schedule</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close a field for all or part of the day ── */}
      {closeDlg && (() => {
        const f = fields.find(x => x.fullName === closeDlg.field)
        const name = f?.fieldName ?? closeDlg.field
        const cur = fieldClosure(closuresToday, closeDlg.field)
        const dayLabel = fmtDate(activeDate || dates[0] || '')
        const fromOk = closeDlg.mode === 'day' || closeDlg.from || closeDlg.to
        const rangeOk = closeDlg.mode === 'day' || !closeDlg.from || !closeDlg.to || hmToMin(closeDlg.from) < hmToMin(closeDlg.to)
        const preview: Closure = closeDlg.mode === 'day' ? { field: closeDlg.field } : { field: closeDlg.field, from: closeDlg.from || null, to: closeDlg.to || null }
        const affected = fromOk && rangeOk ? games.filter(g => g.date === activeDate && g.location === closeDlg.field && g.startTime && isFieldClosedAt([preview], closeDlg.field, g.startTime)).length : 0
        const timeOpts = allSlots
        // plain render function, not a nested component (a nested component is a new type every render and remounts)
        const sel = (id: string, value: string, onChange: (v: string) => void, blank: string) => (
          <select id={id} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">{blank}</option>
            {timeOpts.map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
          </select>
        )
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setCloseDlg(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h2 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2"><Ban size={18} className="text-red-600" /> Close {name}</h2>
                <button onClick={() => setCloseDlg(null)} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
              </div>
              <div className="px-6 py-4 space-y-4">
                <div className="text-xs text-slate-500">{dayLabel}{cur ? <> · currently <span className="font-semibold text-red-700">{closureLabel(cur, fmtTime)!.toLowerCase()}</span></> : null}</div>
                <div className="inline-flex p-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold">
                  {(['day', 'part'] as const).map(m => (
                    <button key={m} onClick={() => setCloseDlg(d => d && { ...d, mode: m })} aria-pressed={closeDlg.mode === m}
                      className={`px-3 py-1 rounded-full ${closeDlg.mode === m ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
                      {m === 'day' ? 'All day' : 'Part of the day'}
                    </button>
                  ))}
                </div>
                {closeDlg.mode === 'part' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600" htmlFor="cl-from">Closed from</label>
                      {sel('cl-from', closeDlg.from, v => setCloseDlg(d => d && { ...d, from: v }), 'Start of day')}
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600" htmlFor="cl-to">Open again at</label>
                      {sel('cl-to', closeDlg.to, v => setCloseDlg(d => d && { ...d, to: v }), 'End of day')}
                    </div>
                    {!fromOk && <div className="col-span-2 text-xs text-slate-500">Pick a start or an end time, or switch to All day.</div>}
                    {fromOk && !rangeOk && <div className="col-span-2 text-xs text-red-600">The field has to reopen after it closes.</div>}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  {closeDlg.mode === 'day' ? 'Nothing can be placed on this field today, by hand or by Auto-fill.' : 'Games can\u2019t start inside the closed window, by hand or by Auto-fill.'}
                  {affected > 0 && <> <span className="font-semibold text-amber-700">{affected} game{affected === 1 ? '' : 's'} already there</span> will stay put and show in Issues until moved.</>}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 px-6 py-3 border-t bg-slate-50 rounded-b-2xl">
                {cur ? <button onClick={() => saveClosure(closeDlg.field, null)} className="text-sm font-semibold text-teal-700 hover:text-teal-900">Reopen all day</button> : <span />}
                <div className="flex items-center gap-2">
                  <button onClick={() => setCloseDlg(null)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100">Cancel</button>
                  <button disabled={!fromOk || !rangeOk} onClick={() => saveClosure(closeDlg.field, preview)} className="text-sm px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed">
                    {cur ? 'Save' : 'Close field'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Weather modal (delay / shorten) ── */}
      {showAF && (() => {
        const poolN = unscheduled.filter(g => (afDiv === '__all__' || g.division === afDiv) && !isBracketGame(g)).length
        const brN = unscheduled.filter(g => (afDiv === '__all__' || g.division === afDiv) && isBracketGame(g)).length
        const allOn = fields.length > 0 && fields.every(f => afFields.has(f.fullName))
        const setType = (v: 'pool' | 'bracket' | 'both') => {
          setAfType(v)
          // keep the day numbers sensible when switching: bracket-only lives on the last day
          const first = dates[0], last = dates[dates.length - 1]
          if (v === 'bracket') setAfCaps(Object.fromEntries(dates.map(d => [d, d === last ? 3 : 0])))
          else if (v === 'pool') setAfCaps(c => (Object.values(c).some(n => n > 0) && !(dates.length > 1 && c[last] && !c[first])) ? c : Object.fromEntries(dates.map(d => [d, d === first ? 3 : 0])))
        }
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setShowAF(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2"><Zap size={18} className="text-teal-600" /> Auto-fill</h2>
              <button onClick={() => setShowAF(false)} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4 overflow-auto">
              <div>
                <label className="text-xs font-semibold text-slate-600" htmlFor="af-div">Division</label>
                <select id="af-div" value={afDiv} onChange={e => setAfDiv(e.target.value)} className="mt-1 w-full text-sm border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white">
                  <option value="__all__">All divisions</option>
                  {divisions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-600">Games</div>
                <div className="mt-1 inline-flex p-0.5 rounded-full bg-slate-100 border border-slate-200">
                  {([['pool', `Pool play · ${poolN}`], ['bracket', `Bracket · ${brN}`], ['both', 'Both']] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setType(v)} className={`text-xs font-bold px-3 py-1 rounded-full ${afType === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{l}</button>
                  ))}
                </div>
                {afType === 'both' && <p className="text-[11px] text-slate-400 mt-1">Pool games are placed first, bracket games after them.</p>}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-600">Games per team, each day</div>
                <p className="text-[11px] text-slate-400">0 skips the day. What doesn&apos;t fit rolls to the next day with a number. Counts include games already on that day.</p>
                <div className="mt-2 space-y-1.5">
                  {dates.map(d => (
                    <div key={d} className="flex items-center gap-3">
                      <span className="text-sm text-slate-700 w-36">{fmtDate(d)}</span>
                      <div className="inline-flex items-center rounded-lg border border-slate-300 overflow-hidden">
                        <button onClick={() => setAfCaps(c => ({ ...c, [d]: Math.max(0, (c[d] ?? 0) - 1) }))} aria-label={`Fewer on ${fmtDate(d)}`} className="px-2.5 py-1 text-slate-600 hover:bg-slate-50">−</button>
                        <span className={`w-8 text-center text-sm font-bold ${(afCaps[d] ?? 0) ? 'text-slate-900' : 'text-slate-300'}`}>{afCaps[d] ?? 0}</span>
                        <button onClick={() => setAfCaps(c => ({ ...c, [d]: Math.min(8, (c[d] ?? 0) + 1) }))} aria-label={`More on ${fmtDate(d)}`} className="px-2.5 py-1 text-slate-600 hover:bg-slate-50">+</button>
                      </div>
                      <span className="text-xs text-slate-400">{(afCaps[d] ?? 0) ? `up to ${afCaps[d]} a team · ${fmtTime(minToHM(windowForDate(d).s))}–${fmtTime(minToHM(windowForDate(d).e))}` : 'skip'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Fields</span>
                  <button onClick={() => setAfFields(allOn ? new Set() : new Set(fields.map(f => f.fullName)))} className="text-[11px] font-semibold text-teal-700 hover:underline">{allOn ? 'Clear' : 'All'}</button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {fields.map(f => { const on = afFields.has(f.fullName); return (
                    <button key={f.fullName} onClick={() => setAfFields(prev => { const n = new Set(prev); if (on) n.delete(f.fullName); else n.add(f.fullName); return n })}
                      className={`text-xs font-bold px-3 py-1 rounded-full border ${on ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`} title={f.fullName}>{f.fieldName}</button>
                  ) })}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex items-center gap-3">
              <p className="text-[11px] text-slate-400 flex-1">Saves a checkpoint first, so Revert undoes it. Placed games can still be dragged.</p>
              <button onClick={() => setShowAF(false)} className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-100">Cancel</button>
              <button onClick={runAutoFill} disabled={autoFilling || afCandidates.length === 0 || afFields.size === 0}
                className="text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:bg-slate-200 disabled:text-slate-400 px-4 py-2 rounded-lg">
                {afCandidates.length === 0 ? 'Nothing to place' : `Place ${afCandidates.length} game${afCandidates.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {showWeather && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setShowWeather(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2"><CloudRain size={18} className="text-amber-500" /> Weather adjust</h2>
              <button onClick={() => setShowWeather(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                {(['delay', 'shorten'] as const).map(m => (
                  <button key={m} onClick={() => setWxMode(m)} className={`text-sm font-semibold px-3 py-1.5 rounded-md transition-colors ${wxMode === m ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{m === 'delay' ? 'Delay' : 'Shorten'}</button>
                ))}
              </div>
              <p className="text-sm text-slate-500">{wxMode === 'delay' ? 'Push back' : 'Re-stack'} the rest of {fmtDate(activeDate)}. Played games (with a score) and canceled games stay put.</p>

              {wxMode === 'delay' ? (
                <div>
                  <label className="text-xs font-semibold text-slate-600">Delay by</label>
                  <div className="flex items-center gap-2 mt-1">
                    {[15, 30, 45, 60].map(m => (
                      <button key={m} onClick={() => setWxDelay(m)} className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${wxDelay === m ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}>{m}m</button>
                    ))}
                    <input type="number" min="5" step="5" value={wxDelay} onChange={e => setWxDelay(Math.max(0, Number(e.target.value) || 0))} className="w-16 text-sm border border-slate-300 rounded-lg px-2 py-1.5" />
                    <span className="text-xs text-slate-500">min</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-semibold text-slate-600">New time-slot length</label>
                  <div className="flex items-center gap-2 mt-1">
                    {[30, 35, 40, 45].map(m => (
                      <button key={m} onClick={() => setWxSlot(m)} className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${wxSlot === m ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}>{m}m</button>
                    ))}
                    <input type="number" min="10" step="5" value={wxSlot} onChange={e => setWxSlot(Math.max(5, Number(e.target.value) || 0))} className="w-16 text-sm border border-slate-300 rounded-lg px-2 py-1.5" />
                    <span className="text-xs text-slate-500">min</span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-600">Affect games starting at or after</label>
                <input type="time" value={wxFrom} onChange={e => setWxFrom(e.target.value)} className="block mt-1 text-sm border border-slate-300 rounded-lg px-2 py-1.5" />
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-sm">
                {wxMode === 'delay' ? (
                  <>
                    <div className="text-slate-700"><span className="font-semibold">{wxMovable.length}</span> game{wxMovable.length === 1 ? '' : 's'} will move +{wxDelay} min.</div>
                    {wxOverflow.length > 0 && <div className="text-amber-700 mt-1 inline-flex items-center gap-1"><AlertTriangle size={13} /> {wxOverflow.length} would pass the day&apos;s end ({fmtTime(minToHM(dayWin.e))}).</div>}
                  </>
                ) : (
                  <>
                    <div className="text-slate-700">Tighten <span className="font-semibold">{wxMovable.length}</span> unplayed game{wxMovable.length === 1 ? '' : 's'} (from {wxFrom ? fmtTime(wxFrom) : 'the first remaining game'}) to <span className="font-semibold">{wxSlot}-min</span> slots. Each field keeps its first remaining game; the rest pull in. Earlier games are untouched.</div>
                    {wxShortenOver > 0 && <div className="text-amber-700 mt-1 inline-flex items-center gap-1"><AlertTriangle size={13} /> {wxShortenOver} would still pass the day&apos;s end ({fmtTime(minToHM(dayWin.e))}).</div>}
                  </>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowWeather(false)} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => wxMode === 'delay' ? applyWeatherDelay() : applyShorten()} disabled={wxBusy || !wxMovable.length || (wxMode === 'delay' ? wxDelay <= 0 : wxSlot <= 0)} className="text-sm font-semibold px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40">{wxBusy ? 'Applying…' : (wxMode === 'delay' ? 'Apply delay' : 'Apply shorten')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header: one line. Counts, day window, Tools menu, then status + actions. ── */}
      <div className={`border-b px-3 sm:px-4 h-11 flex items-center gap-2 whitespace-nowrap flex-shrink-0 relative z-30 ${hasChanges ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
        <div className="flex items-baseline gap-2 mr-1 flex-shrink-0">
          <span className="text-sm font-semibold text-slate-800">Scheduler</span>
          {/* "to place" vs "open slots": was "N open", which read like open slots */}
          <span className="text-[11px] text-slate-400" title={`${toPlaceN} game${toPlaceN === 1 ? '' : 's'}${capDiv ? ` in ${capDiv}` : ''} still to place; ${openSlotsAll} open slot${openSlotsAll === 1 ? '' : 's'} across all days${capDiv ? ` on fields set for ${capDiv}` : ''}`}>
            {games.length} games · <span className="text-amber-600 font-medium">{toPlaceN} to place</span> · <span className={`font-medium ${openSlotsAll < toPlaceN ? 'text-red-600' : 'text-emerald-600'}`}>{openSlotsAll} open slots</span>
          </span>
        </div>

        {/* Day window as one control */}
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 h-7 flex-shrink-0" title="Day start and end for the selected day">
          <Clock size={12} className="text-slate-400" />
          <input type="time" value={minToHM(dayWin.s)} onChange={e => { if (e.target.value) persistDayWindow(e.target.value, minToHM(dayWin.e)) }}
            className="text-xs bg-transparent border-0 p-0 w-[92px] text-slate-700 focus:outline-none" aria-label="Day start" />
          <span className="text-slate-300 text-xs">–</span>
          <input type="time" value={minToHM(dayWin.e)} onChange={e => { if (e.target.value) persistDayWindow(minToHM(dayWin.s), e.target.value) }}
            className="text-xs bg-transparent border-0 p-0 w-[92px] text-slate-700 focus:outline-none" aria-label="Day end" />
        </div>

        {/* Tools menu */}
        <div className="relative flex-shrink-0" ref={toolsRef}>
          <button onClick={() => { if (!toolsOpen) setClrDiv(gridDiv); setToolsOpen(o => !o) }}
            className={`inline-flex items-center gap-1 text-xs font-semibold h-7 px-2.5 rounded-lg border transition-colors ${toolsOpen ? 'bg-slate-800 text-white border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'}`}
            title="Renumber, side panel, checkpoint, unschedule all, auto-fill day mode">
            <MoreHorizontal size={14} /> Tools
          </button>
          {toolsOpen && (
            <div className="absolute left-0 top-full mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50 text-left whitespace-normal">
              <button onClick={() => { renumberAll(); setToolsOpen(false) }} className="w-full flex items-center gap-2 text-xs text-slate-700 px-2.5 py-2 rounded-lg hover:bg-slate-50">
                <RotateCw size={13} className="text-slate-400" /> Renumber all games
              </button>
              {schedView === 'grid' ? (
                <button onClick={() => { setSideStage(v => !v); setToolsOpen(false) }} className="w-full flex items-center gap-2 text-xs text-slate-700 px-2.5 py-2 rounded-lg hover:bg-slate-50">
                  {sideStage ? <PanelLeft size={13} className="text-slate-400" /> : <PanelRight size={13} className="text-slate-400" />} {sideStage ? 'Parking lot on top' : 'Parking lot as side panel'} <span className="ml-auto text-[10px] text-slate-400">Grid</span>
                </button>
              ) : schedView !== 'teams' ? (
                <button onClick={() => { setBoardLotTop(!boardLotTop); setToolsOpen(false) }} className="w-full flex items-center gap-2 text-xs text-slate-700 px-2.5 py-2 rounded-lg hover:bg-slate-50">
                  {boardLotTop ? <PanelLeft size={13} className="text-slate-400" /> : <PanelTop size={13} className="text-slate-400" />} {boardLotTop ? 'Parking lot as side panel' : 'Parking lot on top'} <span className="ml-auto text-[10px] text-slate-400">{schedView === 'board' ? 'Board' : 'Timeline'}</span>
                </button>
              ) : null}
              {!checkpoint && (
                <button onClick={() => { saveCheckpoint(); setToolsOpen(false) }} className="w-full flex items-center gap-2 text-xs text-slate-700 px-2.5 py-2 rounded-lg hover:bg-slate-50" title="Save a checkpoint of this schedule. Experiment freely, then compare, keep, or revert.">
                  <Bookmark size={13} className="text-slate-400" /> Save a checkpoint
                </button>
              )}
              {games.some(g => g.date || g.startTime || g.location) && (() => {
                const n = clearTargets(clrDiv, clrDay, clrType).length
                const sel = 'text-[11px] rounded-md border border-slate-300 bg-white px-1.5 py-1 text-slate-700 w-full'
                return (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <div className="px-2.5 pt-1.5 pb-2 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Trash2 size={13} className="text-red-500" /> Unschedule games</div>
                      <select value={clrDiv} onChange={e => setClrDiv(e.target.value)} className={sel} aria-label="Division to unschedule">
                        <option value="__all__">All divisions</option>
                        {divisions.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                      <div className="grid grid-cols-2 gap-1.5">
                        <select value={clrDay} onChange={e => setClrDay(e.target.value as 'day' | 'all')} className={sel} aria-label="Which days">
                          <option value="all">All days</option>
                          <option value="day">{activeDate ? fmtDate(activeDate) : 'This day'} only</option>
                        </select>
                        <select value={clrType} onChange={e => setClrType(e.target.value as 'all' | 'pool' | 'bracket')} className={sel} aria-label="Which games">
                          <option value="all">Pool + bracket</option>
                          <option value="pool">Pool only</option>
                          <option value="bracket">Bracket only</option>
                        </select>
                      </div>
                      <button onClick={() => { setToolsOpen(false); unscheduleWhere(clrDiv, clrDay, clrType) }} disabled={unscheduling || n === 0}
                        className="w-full text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg py-1.5">
                        {unscheduling ? 'Unscheduling…' : n === 0 ? 'Nothing scheduled matches' : `Unschedule ${n} game${n !== 1 ? 's' : ''}`}
                      </button>
                      <p className="text-[10px] text-slate-400 leading-snug">Saves a checkpoint first, so Revert undoes it.</p>
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </div>

        {/* Undo: one hand move (or swap) back per click */}
        <button onClick={undoLast} disabled={!undoStack.length || undoing || saving || viewingCheckpoint}
          title={undoStack.length ? `Undo ${undoStack[undoStack.length - 1].label} (Ctrl+Z) · ${undoStack.length} step${undoStack.length === 1 ? '' : 's'} back available` : 'Nothing to undo yet. Moves you make by hand can be undone here (Ctrl+Z).'}
          className="inline-flex items-center gap-1 text-xs font-semibold h-7 px-2.5 rounded-lg border transition-colors flex-shrink-0 bg-white hover:bg-slate-100 text-slate-600 border-slate-200 disabled:opacity-40 disabled:hover:bg-white">
          <Undo2 size={14} /> Undo{undoStack.length > 1 && <span className="font-medium text-slate-400">{undoStack.length}</span>}
        </button>

        {/* Checkpoint, only while one exists */}
        {checkpoint && (
          <div className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-1.5 h-7 flex-shrink-0">
            <Bookmark size={12} className="text-violet-600" />
            <button onClick={() => setViewingCheckpoint(v => !v)}
              className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${viewingCheckpoint ? 'bg-violet-600 text-white border-violet-700' : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-100'}`}
              title="Flip between your working version and the saved checkpoint to compare">
              <span className="inline-flex items-center gap-1"><Eye size={11} /> {viewingCheckpoint ? 'Viewing saved' : 'Compare'}</span>
            </button>
            {cpChanges > 0 && <span className="text-[11px] text-violet-600">{cpChanges}</span>}
            <button onClick={revertToCheckpoint} disabled={viewingCheckpoint} className="text-[11px] px-2 py-0.5 rounded border bg-white text-amber-700 border-amber-300 hover:bg-amber-50 disabled:opacity-40" title="Discard your changes and restore the checkpoint">Revert</button>
            <button onClick={discardCheckpoint} className="text-[11px] px-2 py-0.5 rounded border bg-white text-green-700 border-green-300 hover:bg-green-50" title="Keep your current changes and clear the checkpoint">Keep</button>
          </div>
        )}
        {saving && <span className="text-teal-500 text-[11px] animate-pulse flex-shrink-0">Saving…</span>}

        <div className="flex items-center gap-2 ml-auto flex-shrink-0">
          {!publishedAt ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Draft
            </span>
          ) : hasChanges ? (
            <button onClick={() => setShowDiff(true)} className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:underline" title="See what changed since the last publish">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse inline-block" /> {diffChanges.total} change{diffChanges.total === 1 ? '' : 's'}
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Published
            </span>
          )}
          <button
            onClick={() => { setShowWeather(true); if (!wxFrom) { const u = dayGames.filter(g => !gameDone(g)).sort((a, b) => hmToMin(a.startTime) - hmToMin(b.startTime)); if (u.length) setWxFrom(u[0].startTime) } }}
            disabled={dayGames.length === 0}
            title="Weather delay — push back the rest of today's unplayed games"
            className="text-xs font-semibold h-7 px-2.5 rounded-lg border transition-colors disabled:opacity-40 bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
          >
            <span className="inline-flex items-center gap-1"><CloudRain size={13} /> Weather</span>
          </button>
          <button
            onClick={openAutoFill}
            disabled={autoFilling || unscheduled.length === 0}
            title="Pick a division, pool or bracket, fields and games per team per day, then place them automatically"
            className="text-xs font-semibold h-7 px-2.5 rounded-lg border transition-colors disabled:opacity-40 bg-teal-600 hover:bg-teal-700 text-white border-teal-700"
          >
            {autoFilling ? 'Filling…' : <span className="inline-flex items-center gap-1"><Zap size={13} /> Auto-fill</span>}
          </button>
          <PublicVisibilityMenu tournamentId={params.id} vis={publicVis} update={updatePublicVis} />
          <button
            // When followers with alerts on would hear about this publish, stop at the
            // dialog so Bo can choose to tell them or publish quietly (week-of shuffles).
            // When nobody would be alerted there is nothing to ask, so publish right away.
            onClick={() => (notifyPlan.phones > 0 ? setShowDiff(true) : publishSchedule())}
            disabled={publishing || !canPublish}
            title={notifyPlan.phones > 0
              ? `Review the changes and choose whether the ${notifyPlan.phones} phone${notifyPlan.phones === 1 ? '' : 's'} following affected teams hear about them`
              : 'Save the current times and fields as what the public sees, and show the schedule on the public page'}
            className="text-xs font-semibold h-7 px-3 rounded-lg border transition-colors disabled:opacity-40
              bg-green-600 hover:bg-green-700 text-white border-green-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-300"
          >
            {publishing ? 'Publishing…' : <span className="inline-flex items-center gap-1"><Send size={13} /> Publish</span>}
          </button>
        </div>
      </div>

      {viewingCheckpoint && (
        <div className="bg-violet-600 text-white text-xs font-medium px-4 sm:px-6 py-1.5 flex items-center gap-2">
          <Eye size={13} /> Viewing the saved checkpoint (read-only). Click &quot;Viewing saved&quot; again to return to your working version.
        </div>
      )}

      {/* ── Parking Lot (grid view only: the other views carry their own unscheduled list) ── */}
      {schedView === 'grid' && !sideStage && <div className="bg-slate-900 border-b border-slate-700 flex-shrink-0">

        {/* Filter row */}
        <div className="px-4 sm:px-6 pt-2 pb-1 flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-widest mr-1">Parking Lot</span>
          <button onClick={() => setLotExpanded(v => !v)}
            className="text-slate-500 hover:text-slate-300 transition-colors text-xs px-1"
            title={lotExpanded ? 'Collapse' : 'Expand to see all games'}>
            {lotExpanded ? <span className="inline-flex items-center gap-1"><ChevronUp size={12} /> Collapse</span> : <span className="inline-flex items-center gap-1"><ChevronDown size={12} /> Expand</span>}
          </button>
          <button
            onClick={() => setLotOrder(
              [...games.filter(g => !g.date || !g.startTime || !g.location)]
                .sort((a,b) => a.division.localeCompare(b.division) || a.gameNumber.localeCompare(b.gameNumber, undefined, {numeric:true}))
                .map(g => g.id)
            )}
            className="text-slate-500 hover:text-slate-300 transition-colors text-xs px-1"
            title="Sort by game number">
            <span className="inline-flex items-center gap-1"><ArrowUpDown size={12} /> Sort</span>
          </button>
          <span className="bg-slate-700 text-slate-300 text-xs font-semibold rounded-full px-2 py-0.5 mr-1">
            {unscheduled.length}
          </span>

          <label className="text-slate-500 text-xs">Division:</label>
          <select value={filterDiv}
            onChange={e => { setFilterDiv(e.target.value); setFilterPool('__all__'); setFilterTeam('__all__') }}
            className={selectCls}>
            <option value="__all__">All Divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d} ({divGameCounts[d] ?? 0})</option>)}
          </select>

          <label className="text-slate-500 text-xs">Pool:</label>
          <select value={filterPool}
            onChange={e => { setFilterPool(e.target.value); setFilterTeam('__all__') }}
            className={selectCls}>
            <option value="__all__">All Pools</option>
            {parkingPools.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          <label className="text-slate-500 text-xs">Team:</label>
          <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} className={selectCls}>
            <option value="__all__">All Teams</option>
            {parkingTeams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          <label className="text-slate-500 text-xs">Game Type:</label>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectCls}>
            <option value="__all__">All</option>
            <option value="pool">Pool</option>
            <option value="bracket">Bracket</option>
          </select>

          <label className="flex items-center gap-1 text-slate-400 text-xs cursor-pointer select-none">
            <input type="checkbox" checked={showRestricted} onChange={e => setShowRestricted(e.target.checked)}
              className="accent-yellow-400" />
            Restricted
          </label>

          <label className="flex items-center gap-1 text-xs cursor-pointer select-none ml-1"
            style={{ color: swapMode ? '#34d399' : '#94a3b8' }}>
            <input type="checkbox" checked={swapMode}
              onChange={e => { setSwapMode(e.target.checked); setSwapSourceId(null) }}
              className="accent-emerald-400" />
            Swap Games
          </label>

          {filterDiv !== '__all__' && (
            <button onClick={() => unscheduleDivision(filterDiv)} disabled={unscheduling}
              className="ml-2 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded px-2 py-0.5 disabled:opacity-50 transition-colors whitespace-nowrap">
              {unscheduling ? 'Unscheduling…' : 'Unschedule All'}
            </button>
          )}

          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <div className="flex items-center gap-0.5 mr-1 text-slate-400">
              <span className="text-[10px] mr-0.5">Zoom</span>
              <button onClick={() => setGridZoom(z => Math.max(0.5, Math.round((z - 0.1) * 100) / 100))} className="w-5 h-5 rounded border border-slate-200 hover:bg-slate-50 text-xs leading-none">−</button>
              <span className="text-[10px] w-8 text-center tabular-nums">{Math.round(gridZoom * 100)}%</span>
              <button onClick={() => setGridZoom(z => Math.min(1, Math.round((z + 0.1) * 100) / 100))} className="w-5 h-5 rounded border border-slate-200 hover:bg-slate-50 text-xs leading-none">+</button>
            </div>
            <button
              onClick={() => setHideEmptySlots(v => !v)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${hideEmptySlots ? 'bg-slate-200 text-slate-700 border-slate-300' : 'text-slate-400 border-slate-200 hover:border-slate-400'}`}
              title="Compact view: hides empty time rows so you only see slots that have games. Click again to show every time.">
              <span className="inline-flex items-center gap-1"><Clock size={12} /> Compact</span>
            </button>
            <div className="relative">
              <button
                onClick={() => setShowFieldPicker(v => !v)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${hiddenFields.size > 0 ? 'bg-slate-200 text-slate-700 border-slate-300' : 'text-slate-400 border-slate-200 hover:border-slate-400'}`}
                title="Show/hide field columns">
                <MapPin size={12} className="inline -mt-0.5 mr-1" /> Fields{hiddenFields.size > 0 ? ` (${visibleFields.length}/${fields.length})` : ''}
              </button>
              {showFieldPicker && (
                <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-3 min-w-[180px]" onClick={e => e.stopPropagation()}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Show / Hide Fields</p>
                  {fields.map(f => (
                    <label key={f.fullName} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-slate-50 rounded px-1">
                      <input type="checkbox" checked={!hiddenFields.has(f.fullName)}
                        onChange={() => setHiddenFields(prev => {
                          const next = new Set(prev)
                          if (next.has(f.fullName)) next.delete(f.fullName); else next.add(f.fullName)
                          return next
                        })}
                        className="rounded accent-teal-600" />
                      <span className="text-xs text-slate-700">{f.fieldName}</span>
                    </label>
                  ))}
                  {hiddenFields.size > 0 && <button onClick={() => setHiddenFields(new Set())} className="mt-2 text-[10px] text-teal-600 hover:underline block">Show all</button>}
                </div>
              )}
            </div>
          </div>
          {!swapMode && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-slate-500 text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap hidden sm:block">Scratch</span>
              <div
                className="flex gap-1.5"
                onDragOver={e => { if (scratchPad.length < 4 || scratchPad.includes(e.dataTransfer.getData('gameId') || dragId || '')) e.preventDefault() }}
                onDrop={handleDropScratch}
              >
                {[0,1,2,3].map(i => {
                  const id = scratchPad[i]
                  const game = id ? games.find(g => g.id === id) : null
                  const color = game ? divColor(game.division, colorsByDiv) : ''
                  return (
                    <div key={i}
                      className={`w-20 h-11 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors
                        ${game ? 'border-transparent' : 'border-slate-600 bg-slate-800/30 hover:border-slate-400'}`}
                    >
                      {game ? (
                        <div
                          draggable
                          onDragStart={e => handleDragStart(e, game.id)}
                          onDragEnd={handleDragEnd}
                          className="text-[9px] font-semibold px-1.5 py-1 cursor-grab w-full h-full flex flex-col justify-center leading-tight"
                          style={{ backgroundColor: color, color: textColor(color) }}
                        >
                          <div className="opacity-60 text-[8px]">{game.gameNumber} · {game.division}</div>
                          <div className="truncate">{game.team1}</div>
                          <div className="opacity-75 truncate">vs {game.team2}</div>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-[10px] select-none">{i + 1}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <span className="ml-4 text-[10px] text-slate-600 italic hidden sm:block self-center">
                Scratch: hold up to 4 games while rearranging · Drag games to the grid to schedule · Drop a scheduled game anywhere here to unschedule
              </span>
            </div>
          )}
          {swapMode && (
            <span className="ml-auto text-emerald-400 text-xs hidden sm:block">
              <RefreshCw size={13} className="inline -mt-0.5 mr-1" /> Click two scheduled games to swap them
            </span>
          )}
        </div>

        {/* Chips — 2-row wrap by default, full wrap when expanded */}
        <div className="px-4 sm:px-6 pb-3" onDragOver={e => e.preventDefault()} onDrop={handleDropParking}>
          <div className={lotExpanded ? 'max-h-72 overflow-y-auto' : ''}>
            <div className={lotExpanded ? 'flex flex-wrap gap-2' : 'flex flex-wrap gap-2 max-h-[5.5rem] overflow-hidden'}>
              {filtered.length === 0 ? (
                <p className="text-slate-500 text-sm py-3 italic self-center">
                  {unscheduled.length === 0 ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} /> All games scheduled!</span> : 'No games match filter'}
                </p>
              ) : filteredSorted.map(g => {
                const color = divColor(g.division, colorsByDiv)
                const hasConflict = conflictMsgs.has(g.id)
                const hasB2B = !hasConflict && backToBackMsgs.has(g.id)
                const isLotOver = lotDragOver === g.id
                return (
                  <div
                    key={g.id}
                    draggable={!swapMode}
                    onDragStart={e => handleDragStart(e, g.id)}
                    onDragEnd={() => { handleDragEnd(); setLotDragOver(null) }}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setLotDragOver(g.id) }}
                    onDragLeave={() => setLotDragOver(null)}
                    onDrop={e => {
                      e.preventDefault(); e.stopPropagation()
                      const sourceId = e.dataTransfer.getData('gameId') || dragId
                      if (!sourceId) return
                      const src = games.find(x => x.id === sourceId)
                      if (!src) return
                      if (src.date || src.startTime || src.location) {
                        moveGame(sourceId, { date: '', startTime: '', location: '' })
                      } else {
                        reorderLot(sourceId, g.id)
                      }
                    }}
                    className={`relative rounded-md px-2 py-1 cursor-grab active:cursor-grabbing text-[11px] font-medium whitespace-nowrap select-none flex-shrink-0 shadow transition-all ${dragId === g.id ? 'opacity-30' : 'hover:brightness-110'} ${isLotOver && dragId !== g.id ? 'ring-2 ring-white scale-105' : ''}`}
                    style={{ backgroundColor: color, color: textColor(color) }}
                  >
                    {hasConflict && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm" title={conflictMsgs.get(g.id) ?? 'Same-time conflict'}>!</span>
                    )}
                    {hasB2B && (
                      <span className="absolute -top-1 -right-1 bg-yellow-400 text-slate-900 text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm" title={backToBackMsgs.get(g.id) ?? 'Back-to-back game'}><ArrowLeftRight size={9} /></span>
                    )}
                    <div className="font-bold leading-none mb-0.5"><span className="opacity-60 text-[9px] mr-1">{g.gameNumber.startsWith('B') ? `${divAbbr(g.division)}-${g.gameNumber}` : g.gameNumber}</span>{g.team1}</div>
                    <div className="opacity-75 text-[10px] leading-none">vs {g.team2} <span className="opacity-60">· {g.division}{g.pool ? ` ${g.pool}` : ''}</span></div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>}

      {/* ── Side staging wrapper ── */}
      <div className="flex flex-1 overflow-hidden">
      {schedView === 'grid' && sideStage && (
        <div className="w-56 bg-slate-900 border-r border-slate-700 flex flex-col flex-shrink-0 overflow-hidden">
          {/* Sidebar header + filters */}
          <div className="px-3 pt-3 pb-2 border-b border-slate-700 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-300 text-xs font-semibold uppercase tracking-widest">Staging</span>
              <span className="bg-slate-700 text-slate-300 text-xs font-semibold rounded-full px-2 py-0.5">{unscheduled.length}</span>
            </div>
            <select value={filterDiv}
              onChange={e => { setFilterDiv(e.target.value); setFilterPool('__all__'); setFilterTeam('__all__') }}
              className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-600 rounded px-2 py-1 mb-1">
              <option value="__all__">All Divisions</option>
              {divisions.map(d => <option key={d} value={d}>{d} ({divGameCounts[d] ?? 0})</option>)}
            </select>
            <select value={filterPool}
              onChange={e => { setFilterPool(e.target.value); setFilterTeam('__all__') }}
              className="w-full text-xs bg-slate-800 text-slate-200 border border-slate-600 rounded px-2 py-1">
              <option value="__all__">All Pools</option>
              {parkingPools.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          {/* Scratch pad - side mode */}
          <div className="px-2 pt-2 pb-2 flex-shrink-0 border-b border-slate-700"
            onDragOver={e => { if (scratchPad.length < 4 || scratchPad.includes(e.dataTransfer.getData('gameId') || dragId || '')) e.preventDefault() }}
            onDrop={handleDropScratch}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-slate-400 text-[10px] font-semibold uppercase tracking-widest">Scratch</span>
              <span className="text-slate-500 text-[9px]">{scratchPad.length}/4</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {[0,1,2,3].map(i => {
                const id = scratchPad[i]
                const game = id ? games.find(g => g.id === id) : null
                const color = game ? divColor(game.division, colorsByDiv) : ''
                return (
                  <div key={i}
                    className={`h-11 rounded border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors
                      ${game ? 'border-transparent' : 'border-slate-600 bg-slate-800/30 hover:border-slate-400'}`}
                  >
                    {game ? (
                      <div
                        draggable
                        onDragStart={e => handleDragStart(e, game.id)}
                        onDragEnd={handleDragEnd}
                        className="text-[8px] font-semibold px-1 py-0.5 cursor-grab w-full h-full flex flex-col justify-center leading-tight"
                        style={{ backgroundColor: color, color: textColor(color) }}
                      >
                        <div className="opacity-60 text-[7px]">{game.gameNumber}</div>
                        <div className="truncate">{game.team1}</div>
                        <div className="opacity-70 truncate">vs {game.team2}</div>
                      </div>
                    ) : (
                      <span className="text-slate-600 text-[9px] select-none">{i + 1}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Game chips */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1.5" onDragOver={e => e.preventDefault()} onDrop={handleDropParking}>
            {filteredSorted.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-4">
                {unscheduled.length === 0 ? <span className="inline-flex items-center gap-1"><CheckCircle2 size={14} /> All scheduled!</span> : 'No matches'}
              </p>
            ) : filteredSorted.map(g => {
              const color = divColor(g.division, colorsByDiv)
              const hasConflict = conflictMsgs.has(g.id)
              const hasB2B = !hasConflict && backToBackMsgs.has(g.id)
              return (
                <div
                  key={g.id}
                  draggable={!swapMode}
                  onDragStart={e => handleDragStart(e, g.id)}
                  onDragEnd={() => { handleDragEnd(); setLotDragOver(null) }}
                  className={`relative rounded-lg px-2.5 py-2 cursor-grab active:cursor-grabbing text-xs font-medium select-none shadow transition-all ${dragId === g.id ? 'opacity-30' : 'hover:brightness-110'}`}
                  style={{ backgroundColor: color, color: textColor(color) }}
                >
                  {hasConflict && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm" title={conflictMsgs.get(g.id) ?? 'Same-time conflict'}><AlertTriangle size={10} /></span>
                  )}
                  {hasB2B && (
                    <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-slate-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm" title={backToBackMsgs.get(g.id) ?? 'Back-to-back game'}><ArrowLeftRight size={9} /></span>
                  )}
                  <div className="font-bold text-[10px] opacity-70 mb-0.5">{g.gameNumber.startsWith('B') ? `${divAbbr(g.division)}-${g.gameNumber}` : g.gameNumber} · {g.division}{g.pool ? ` · ${g.pool}` : ''}</div>
                  <div className="font-semibold truncate">{g.team1}</div>
                  <div className="opacity-80 truncate">vs {g.team2}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

      {/* ── Grid filter row ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2 flex items-center gap-2 flex-wrap flex-shrink-0">
        <label className="text-slate-500 text-xs font-semibold">View:</label>
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-full bg-slate-100 border border-slate-200 mr-2">
          {([['grid', 'Grid'], ['board', 'Board'], ['timeline', 'Timeline'], ['teams', 'Teams']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setSchedView(v)}
              className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${schedView === v ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'}`}
              title={v === 'grid' ? 'The original grid: fields across, time down' : v === 'board' ? 'Fields across, time down, with the new tiles, drop hints and issues panel' : v === 'timeline' ? 'Fields down, time across, with an issues panel' : 'One row per team, so rest and conflicts show as a shape'}>
              {label}
            </button>
          ))}
        </div>

        <label className="text-slate-500 text-xs">Division:</label>
        <select value={gridDiv}
          onChange={e => { setGridDiv(e.target.value); setGridPool('__all__'); setGridTeam('__all__') }}
          className={gridSelectCls}>
          <option value="__all__">All Divisions</option>
          {divisions.map(d => <option key={d} value={d}>{d} ({divGameCounts[d] ?? 0})</option>)}
        </select>

        <label className="text-slate-500 text-xs">Pool:</label>
        <select value={gridPool}
          onChange={e => { setGridPool(e.target.value); setGridTeam('__all__') }}
          className={gridSelectCls}>
          <option value="__all__">All Pools</option>
          {gridPools.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <label className="text-slate-500 text-xs">Team:</label>
        <select value={gridTeam} onChange={e => setGridTeam(e.target.value)} className={gridSelectCls}>
          <option value="__all__">All Teams</option>
          {gridTeams.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <label className="text-slate-500 text-xs">Game Type:</label>
        <select value={gridType} onChange={e => setGridType(e.target.value)} className={gridSelectCls}>
          <option value="__all__">All</option>
          <option value="pool">Pool</option>
          <option value="bracket">Bracket</option>
        </select>

        {(gridDiv !== '__all__' || gridPool !== '__all__' || gridTeam !== '__all__' || gridType !== '__all__') && (
          <button onClick={() => { setGridDiv('__all__'); setGridPool('__all__'); setGridTeam('__all__'); setGridType('__all__') }}
            className="text-xs text-slate-400 hover:text-slate-600 underline">
            Clear
          </button>
        )}

        {swapMode && swapSourceId && (
          <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 border border-emerald-300 rounded px-2 py-0.5">
            <RefreshCw size={13} className="inline -mt-0.5 mr-1" /> Click a game to swap with it
          </span>
        )}
      </div>

      {/* ── Date Tabs ── */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto flex-shrink-0">
        <div className="flex min-w-max">
          {dates.map(d => {
            const n = games.filter(g => g.date === d).length
            const removable = n === 0 && !eventDays.includes(d)
            return (
            <div key={d} className={`relative flex items-stretch border-b-2 transition-colors ${
                activeDate === d ? 'border-teal-600 bg-teal-50/50' : 'border-transparent hover:bg-slate-50'}`}>
              <button onClick={() => setActiveDate(d)}
                className={`${removable ? 'pl-5 pr-1' : 'px-5'} py-3 text-sm font-medium whitespace-nowrap ${
                  activeDate === d ? 'text-teal-600' : 'text-slate-600 hover:text-slate-900'}`}>
                {fmtDate(d)}
                <span className="ml-2 text-xs rounded-full px-1.5 py-0.5 bg-slate-100 text-slate-500" title={`${n} game${n === 1 ? '' : 's'} placed`}>{n}</span>
                {capacity[d] && (
                  <span className={`ml-1 text-xs rounded-full px-1.5 py-0.5 ${capacity[d].open ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}
                    title={`${capacity[d].open} of ${capacity[d].total} slots open${capDiv ? ` on fields set for ${capDiv}` : ''}`}>{capacity[d].open} open</span>
                )}
              </button>
              {removable && (
                <button onClick={() => removeDay(d)} aria-label={`Remove ${fmtDate(d)}`} title="Remove this day (no games on it)"
                  className="self-center mr-2 w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                  <X size={12} />
                </button>
              )}
            </div>
            )
          })}
          <button onClick={addDay}
            className="px-4 py-3 text-sm text-slate-400 hover:text-slate-600 border-b-2 border-transparent hover:bg-slate-50 whitespace-nowrap">
            + Add Day
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      {fields.length === 0 ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-4 text-slate-400 py-20">
          <div className="text-slate-300"><Building2 size={44} /></div>
          <p className="text-base font-medium text-slate-600">No fields configured yet</p>
          {addingField ? (
            <div className="flex items-center gap-2">
              <input autoFocus type="text" placeholder="Field name…" value={newFieldName}
                onChange={e => setNewFieldName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addField(); if (e.key === 'Escape') { setAddingField(false); setNewFieldName('') } }}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 w-40" />
              <button onClick={addField} className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Add</button>
              <button onClick={() => { setAddingField(false); setNewFieldName('') }} className="text-slate-400 hover:text-slate-600 text-xs px-2">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={() => setAddingField(true)} className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ Add Field</button>
              <span className="text-slate-400 text-xs">or add in</span>
              <a href={`/tournaments/${params.id}/builder`} className="text-teal-500 hover:underline text-sm"><span className="inline-flex items-center gap-1">Builder <ArrowRight size={12} /></span></a>
            </div>
          )}
        </div>
      ) : schedView !== 'grid' ? (
        (() => {
          const viewProps = {
            games, dayGames, unscheduled, activeDate, slots, fields: visibleFields, divisions, increment,
            divColor: (d: string) => divColor(d, colorsByDiv), fmtTime, divAbbr,
            issues: { conflict: conflictMsgs, b2b: backToBackMsgs, gap: longGapMsgs, bracket: bracketOrderMsgs },
            filterPool: gridPool, filterTeam: gridTeam,
            filterDiv: gridDiv, setFilterDiv: (d: string) => { setGridDiv(d); setGridPool('__all__'); setGridTeam('__all__') },
            // Awaited so the Board picks the next game only once this one is on the board
            // (otherwise its slot still reads as open for a moment).
            onPlace: async (id: string, time: string, field: string) => { if (!okForField(games.find(g => g.id === id), field)) return false; await moveGame(id, { date: activeDate, startTime: time, location: field }) },
            onUnschedule: (id: string) => moveGame(id, { date: '', startTime: '', location: '' }),
            saving,
            prefsKey: params.id,
            onReorderFields: reorderField,
            isFieldClosed: closedAt,
            fieldAllows,
            closedLabel: closedLabelFor,
            onToggleClosed: openCloseDialog,
            lotOnTop: boardLotTop,
            onLotOnTop: setBoardLotTop,
            onSwap: swapGames,
            onToggleIfNeeded: toggleIfNeeded,
            dates, onSetSpot: setSpot,
          }
          return schedView === 'teams' ? <TeamLanesView {...viewProps} /> : <TimelineView {...viewProps} orientation={schedView === 'board' ? 'fields-across' : 'fields-down'} />
        })()
      ) : (
        <div ref={gridScrollRef} className="flex-1 overflow-auto" style={{ zoom: gridZoom }}>
          <table className="border-collapse" style={{ minWidth: `${80 + visibleFields.length * 160}px` }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 w-20 bg-slate-100 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 text-center">
                  Time
                </th>
                {visibleFields.map(f => (
                  <th key={f.fullName} className={`border border-slate-200 px-3 py-2 text-center min-w-[155px] group relative ${closedLabelFor(f.fullName) ? 'bg-red-50' : 'bg-slate-100'}`}>
                    <div className="text-[10px] text-slate-400 font-normal">{f.venueName}</div>
                    <div className="text-xs font-semibold text-slate-700">{f.fieldName}</div>
                    <button onClick={() => openCloseDialog(f.fullName)}
                      className={`mt-0.5 text-[9px] font-bold uppercase tracking-wide px-1.5 py-px rounded-full border ${closedLabelFor(f.fullName) ? 'bg-red-100 border-red-300 text-red-700' : 'border-transparent text-slate-300 opacity-0 group-hover:opacity-100 hover:text-slate-600 hover:border-slate-300'}`}
                      title={closedLabelFor(f.fullName) ? 'Closed on this day. Click to change the hours or reopen.' : 'Close this field for all or part of this day: nothing can be placed there by hand or by Auto-fill'}>
                      {closedLabelFor(f.fullName) ?? 'Close today'}
                    </button>
                    <button
                      onClick={() => removeField(f.fullName)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 text-xs leading-none transition-opacity"
                      title="Remove field"><X size={15} /></button>
                  </th>
                ))}
                <th className="bg-slate-100 border border-slate-200 px-2 py-2 text-center w-24">
                  {addingField ? (
                    <div className="flex flex-col items-center gap-1">
                      <input autoFocus type="text" placeholder="Name…" value={newFieldName}
                        onChange={e => setNewFieldName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addField(); if (e.key === 'Escape') { setAddingField(false); setNewFieldName('') } }}
                        className="border border-slate-300 rounded px-1.5 py-0.5 text-xs w-20 text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                      <div className="flex gap-1">
                        <button onClick={addField} className="bg-teal-600 text-white text-[10px] px-1.5 py-0.5 rounded">Add</button>
                        <button onClick={() => { setAddingField(false); setNewFieldName('') }} className="text-slate-400 text-[10px] px-1"><X size={13} /></button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingField(true)}
                      className="text-slate-400 hover:text-teal-600 text-xs font-medium transition-colors whitespace-nowrap">
                      + Field
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {slots.map(slot => {
                const slotHasGame = visibleFields.some(f => !!cellMap[slot + '|' + f.fullName])
                return (
                <tr key={slot}>
                  <td className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1 text-xs text-slate-500 font-medium text-center whitespace-nowrap w-20">
                    {fmtTime(slot)}
                  </td>
                  {visibleFields.map(f => {
                    const cellKey = `${slot}|${f.fullName}`
                    const game = cellMap[cellKey]
                    const isOver = overCell === cellKey
                    const matchesGrid = game ? gameMatchesGridFilter(game) : true
                    const isSwapSource = swapSourceId === game?.id
                    const isTeamBusy = !!dragGame && !game && busySlots.has(slot)
                    return (
                      <td
                        key={f.fullName}
                        className={`border border-slate-200 p-1 align-top ${slotHasGame ? 'h-16' : 'h-8'} transition-colors ${isOver ? 'bg-teal-50' : closedAt(f.fullName, slot) ? '' : 'bg-white hover:bg-slate-50'}`}
                        style={closedAt(f.fullName, slot) && !game ? { background: 'repeating-linear-gradient(135deg,#fff 0 8px,#fef2f2 8px 10px)' } : undefined}
                        title={closedAt(f.fullName, slot) && !game ? `${f.fieldName} is closed at ${fmtTime(slot)}` : undefined}
                        onDragOver={e => { if (closedAt(f.fullName, slot)) return; e.preventDefault(); setOverCell(cellKey) }}
                        onDragLeave={() => setOverCell(null)}
                        onDrop={e => handleDropCell(e, slot, f.fullName)}
                      >
                        {game ? (
                          <div
                            draggable={!swapMode}
                            onDragStart={e => handleDragStart(e, game.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => handleSwapClick(game.id)}
                            data-game-card
                            onMouseEnter={e => showIssues(e, game.id)}
                            onMouseLeave={() => hideIssues(game.id)}
                            className={`relative rounded-md px-2 py-1 h-full min-h-[52px] flex flex-col justify-between transition-all
                              ${swapMode ? 'cursor-pointer hover:ring-2 hover:ring-white' : 'cursor-grab active:cursor-grabbing'}
                              ${dragId === game.id ? 'opacity-30' : ''}
                              ${!matchesGrid ? 'opacity-20' : 'hover:brightness-110'}
                              ${isSwapSource ? 'ring-2 ring-white ring-offset-1 brightness-125' : ''}
                            `}
                            style={{ backgroundColor: divColor(game.division, colorsByDiv), color: textColor(divColor(game.division, colorsByDiv)) }}
                          >
                            {(() => {
                              const b = conflictMsgs.has(game.id) ? { cls: 'bg-red-500 text-white', icon: <AlertTriangle size={12} /> }
                                : backToBackMsgs.has(game.id) ? { cls: 'bg-yellow-400 text-slate-900', icon: <ArrowLeftRight size={11} /> }
                                : longGapMsgs.has(game.id) ? { cls: 'bg-teal-400 text-white', icon: <Clock size={11} /> }
                                : bracketOrderMsgs.has(game.id) ? { cls: 'bg-orange-500 text-white', icon: <Zap size={12} /> }
                                : null
                              if (!b) return null
                              const n = gameIssues(game.id).length
                              return (
                                <button type="button" aria-label="Show scheduling issues"
                                  onClick={e => { e.stopPropagation(); if (issueTip?.id === game.id && issueTip.pinned) setIssueTip(null); else showIssues(e, game.id, true) }}
                                  className={`absolute bottom-0.5 right-0.5 rounded-full w-5 h-5 flex items-center justify-center shadow ring-2 ring-white/70 ${b.cls}`}>
                                  {b.icon}
                                  {n > 1 && <span className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white text-[8px] font-bold rounded-full min-w-[14px] h-[14px] px-0.5 flex items-center justify-center">{n}</span>}
                                </button>
                              )
                            })()}
                            <div className="flex items-center justify-between gap-1">
                              <div className="font-bold text-[10px] leading-none" style={{ color: 'inherit' }}>{game.gameNumber.startsWith('B') ? `${divAbbr(game.division)}-${game.gameNumber}` : game.gameNumber}</div>
                              <div className="text-[9px] leading-none truncate" style={{ opacity: 0.75 }}>{game.division}{game.pool ? ` · ${game.pool}` : ''}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold truncate leading-tight">{game.team1}{(teamGames[teamKey(game.division, game.team1)]?.length ?? 0) > 0 && <span className="opacity-60 font-normal"> ({teamGames[teamKey(game.division, game.team1)]?.length})</span>}</div>
                              <div className="text-[10px] truncate" style={{ opacity: 0.85 }}>vs {game.team2}{(teamGames[teamKey(game.division, game.team2)]?.length ?? 0) > 0 && <span className="opacity-60"> ({teamGames[teamKey(game.division, game.team2)]?.length})</span>}</div>
                            </div>
                          </div>
                        ) : isTeamBusy ? (
                          <div className="h-full rounded-sm bg-slate-100 border border-slate-300 flex items-center justify-center text-[10px] text-slate-500 font-semibold tracking-wide">In Use</div>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              )
              })}
            </tbody>
          </table>
        </div>
      )}
      </div>{/* end right-content wrapper */}
      </div>{/* end side staging wrapper */}
    </div>
  )
}