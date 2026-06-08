'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import TournamentNav from '../TournamentNav'
import toast, { Toaster } from 'react-hot-toast'

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
}

interface Field {
  venueName: string
  fieldName: string
  fullName: string
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

function divColor(div: string, divs: string[], colorMap: Record<string, string> = {}) {
  if (colorMap[div]) return colorMap[div]
  const i = divs.indexOf(div)
  return PALETTE[i % PALETTE.length] ?? PALETTE[0]
}

function makeSlots(startH: number, endH: number, inc: number) {
  const slots: string[] = []
  for (let h = startH; h < endH; h++) {
    for (let m = 0; m < 60; m += inc) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
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
  const [increment, setIncrement]       = useState(30)
  const [startH, setStartH]             = useState(8)
  const [endH, setEndH]                 = useState(19)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [unscheduling, setUnscheduling] = useState(false)
  const [dragId, setDragId]             = useState<string | null>(null)
  const [dragGame, setDragGame]         = useState<Game | null>(null)
  const [overCell, setOverCell]         = useState<string | null>(null)

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
  const [scratchPad,   setScratchPad]   = useState<string[]>([])
  const [divColorMap,  setDivColorMap]  = useState<Record<string, string>>({})

  // ── Draft/publish versioning ─────────────────────────────────────────────
  const [snapshot,       setSnapshot]       = useState<Record<string, {date:string,startTime:string,location:string}>>({})
  const [publishedAt,    setPublishedAt]    = useState<string | null>(null)
  const [publishing,     setPublishing]     = useState(false)
  const [showDiff,       setShowDiff]       = useState(false)

  // ── Grid filters ─────────────────────────────────────────────────────────
  const [gridDiv,  setGridDiv]  = useState('__all__')
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
      if (tData.scheduleIncrement) setIncrement(Number(tData.scheduleIncrement))

      const venueList: any[] = vData.venues ?? []
      const flat: Field[] = []
      venueList.forEach(v => {
        const flds: any[] = Array.isArray(v.fields) ? v.fields : []
        flds.forEach(f => {
          const fieldName = typeof f === 'string' ? f : (f.name ?? String(f))
          flat.push({ venueName: v.name, fieldName, fullName: `${v.name} - ${fieldName}` })
        })
      })
      setRawVenues(venueList.map(v => ({ name: v.name, fields: (Array.isArray(v.fields) ? v.fields : []).map((f: any) => typeof f === 'string' ? f : (f.name ?? String(f))) })))
      setFields(flat)

      const gameDates = [...new Set(allGames.map(g => g.date).filter(Boolean))].sort() as string[]
      let allDates = gameDates

      if (allDates.length === 0 && tData.startDate && tData.endDate) {
        const d1 = new Date(tData.startDate)
        const d2 = new Date(tData.endDate)
        const arr: string[] = []
        for (const d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1))
          arr.push(d.toISOString().split('T')[0])
        allDates = arr
      }
      if (allDates.length === 0) {
        const t = new Date()
        allDates = [t.toISOString().split('T')[0], new Date(t.getTime() + 86400000).toISOString().split('T')[0]]
      }

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

  async function saveVenues(venues: {name:string,fields:string[]}[]) {
    setRawVenues(venues)
    const flat: Field[] = []
    venues.forEach(v => v.fields.forEach(f => flat.push({ venueName: v.name, fieldName: f, fullName: `${v.name} - ${f}` })))
    setFields(flat)
    await fetch(`/api/venues/${params.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venues, defaultAvailability: [] }),
    })
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

  async function patchGame(gameId: string, patch: Partial<Pick<Game, 'date' | 'startTime' | 'location'>>) {
    setSaving(true)
    const res = await fetch(`/api/tournaments/${params.id}/games/${gameId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setGames(prev => prev.map(g => g.id === gameId ? { ...g, ...updated } : g))
    } else {
      toast.error('Failed to update game')
    }
    setSaving(false)
  }

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
    if (swapMode) return
    e.dataTransfer.setData('gameId', gameId)
    e.dataTransfer.effectAllowed = 'move'
    setDragId(gameId)
    setDragGame(games.find(g => g.id === gameId) ?? null)
  }
  function handleDragEnd() { setDragId(null); setDragGame(null); setOverCell(null) }

  function handleDropCell(e: React.DragEvent, time: string, field: string) {
    e.preventDefault()
    setOverCell(null)
    const gameId = e.dataTransfer.getData('gameId') || dragId
    if (!gameId) return
    const occupied = games.find(g => g.id !== gameId && g.date === activeDate && g.startTime === time && g.location === field)
    if (occupied) { toast.error(`${field} is already booked at ${time}`); return }
    setScratchPad(prev => prev.filter(id => id !== gameId))
    patchGame(gameId, { date: activeDate, startTime: time, location: field })
  }

  function handleDropParking(e: React.DragEvent) {
    e.preventDefault()
    setOverCell(null)
    const gameId = e.dataTransfer.getData('gameId') || dragId
    if (!gameId) return
    const g = games.find(x => x.id === gameId)
    setScratchPad(prev => prev.filter(id => id !== gameId))
    if (g && (g.date || g.startTime || g.location)) {
      patchGame(gameId, { date: '', startTime: '', location: '' })
    }
  }

  function handleDropScratch(e: React.DragEvent) {
    e.preventDefault()
    const gameId = e.dataTransfer.getData('gameId') || dragId
    if (!gameId) return
    if (scratchPad.includes(gameId)) return
    if (scratchPad.length >= 4) { toast.error('Scratch pad is full (max 4)'); return }
    setScratchPad(prev => [...prev, gameId])
  }

  function handleSwapClick(gameId: string) {
    if (!swapMode) return
    if (!swapSourceId) { setSwapSourceId(gameId); toast('Now click the game to swap with', { icon: '🔄' }); return }
    if (swapSourceId === gameId) { setSwapSourceId(null); return }
    const a = games.find(g => g.id === swapSourceId)
    const b = games.find(g => g.id === gameId)
    if (!a || !b) { setSwapSourceId(null); return }
    Promise.all([
      fetch(`/api/tournaments/${params.id}/games/${a.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: b.date, startTime: b.startTime, location: b.location }),
      }),
      fetch(`/api/tournaments/${params.id}/games/${b.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: a.date, startTime: a.startTime, location: a.location }),
      }),
    ]).then(() => {
      setGames(prev => prev.map(g => {
        if (g.id === a.id) return { ...g, date: b.date, startTime: b.startTime, location: b.location }
        if (g.id === b.id) return { ...g, date: a.date, startTime: a.startTime, location: a.location }
        return g
      }))
      toast.success('Games swapped!')
    })
    setSwapSourceId(null)
  }

  async function publishSchedule() {
    setPublishing(true)
    try {
      const res = await fetch(`/api/tournaments/${params.id}/publish`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setPublishedAt(data.publishedAt)
        const snap: Record<string, {date:string,startTime:string,location:string}> = {}
        games.forEach(g => { snap[g.id] = { date: g.date, startTime: g.startTime, location: g.location } })
        setSnapshot(snap)
        setShowDiff(false)
        toast.success('Schedule published!')
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
  const allSlots = makeSlots(startH, endH, increment)
  const slots = hideEmptySlots
    ? allSlots.filter(s => dayGames.some(g => g.startTime === s))
    : allSlots
  const visibleFields = fields.filter(f => !hiddenFields.has(f.fullName))

  // Slots where either team of the dragged game is already scheduled today
  const busySlots = (() => {
    if (!dragGame) return new Set<string>()
    const teams = [dragGame.team1, dragGame.team2].filter(t => t && t !== 'TBD')
    const s = new Set<string>()
    dayGames.forEach(g => {
      if (g.id === dragGame.id) return
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
  dayGames.forEach(g => { cellMap[`${g.startTime}|${g.location}`] = g })

  // ── Conflict detection ────────────────────────────────────────────────────
  const scheduledGames = games.filter(g => g.date && g.startTime)
  function slotIndex(time: string) { const [h, m] = time.split(':').map(Number); return h * 60 + m }
  const conflictMsgs = new Map<string, string>()
  const backToBackMsgs = new Map<string, string>()
  const longGapMsgs = new Map<string, string>()
  const teamGames: Record<string, Game[]> = {}
  scheduledGames.forEach(g => {
    ;[g.team1, g.team2].forEach(team => {
      if (!team || team === 'TBD') return
      teamGames[team] = teamGames[team] ?? []
      teamGames[team].push(g)
    })
  })
  Object.entries(teamGames).forEach(([team, tg]) => {
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

  const selectCls = 'text-xs bg-slate-800 text-slate-200 border border-slate-600 rounded px-2 py-0.5'
  const gridSelectCls = 'text-xs bg-white text-slate-700 border border-slate-300 rounded px-2 py-1'

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <TournamentNav id={params.id} />
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    </div>
  )

  return (
    <div className="h-screen bg-slate-50 flex flex-col overflow-hidden">
      <TournamentNav id={params.id} />
      <Toaster position="top-right" />

      {/* ── Draft/Publish status bar ── */}
      <div className={`flex items-center gap-3 px-4 sm:px-6 py-1.5 text-xs flex-wrap border-b ${hasChanges ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
        {!publishedAt ? (
          <>
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Draft — never published
            </span>
            <span className="text-amber-600 hidden sm:block">Schedule changes are only visible to admins until published.</span>
          </>
        ) : hasChanges ? (
          <>
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block animate-pulse" /> Draft — {diffChanges.total} unpublished change{diffChanges.total !== 1 ? 's' : ''}
            </span>
            <button onClick={() => setShowDiff(true)} className="text-amber-700 underline hover:text-amber-900">View diff</button>
          </>
        ) : (
          <span className="inline-flex items-center gap-1 font-semibold text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Published
            {publishedAt && <span className="font-normal text-green-600 ml-1">· {new Date(publishedAt).toLocaleString()}</span>}
          </span>
        )}
        <button
          onClick={publishSchedule}
          disabled={publishing || !hasChanges}
          className="ml-auto text-xs font-semibold px-3 py-1 rounded-lg border transition-colors disabled:opacity-40
            bg-green-600 hover:bg-green-700 text-white border-green-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-300"
        >
          {publishing ? 'Publishing…' : '🚀 Publish Schedule'}
        </button>
      </div>

      {/* ── Diff modal ── */}
      {showDiff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setShowDiff(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-slate-900">Unpublished Changes</h2>
              <button onClick={() => setShowDiff(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {diffChanges.newlyScheduled.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-700 mb-2">✓ Newly Scheduled ({diffChanges.newlyScheduled.length})</h3>
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
                  <h3 className="text-sm font-semibold text-amber-700 mb-2">↔ Moved ({diffChanges.moved.length})</h3>
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
                  <h3 className="text-sm font-semibold text-red-700 mb-2">✕ Unscheduled ({diffChanges.nowUnscheduled.length})</h3>
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
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
              <button onClick={() => setShowDiff(false)} className="text-sm text-slate-600 hover:text-slate-900 px-4 py-2">Cancel</button>
              <button onClick={publishSchedule} disabled={publishing}
                className="text-sm font-semibold bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg disabled:opacity-50">
                {publishing ? 'Publishing…' : '🚀 Publish Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Link href={`/tournaments/${params.id}/divisions`} className="text-xs text-blue-600 hover:text-blue-800 hover:underline">← Divisions</Link>
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Game Scheduler</h1>
          <p className="text-sm text-slate-500">
            {games.length} games · <span className="text-amber-600 font-medium">{unscheduled.length} unscheduled</span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm flex-wrap">
          <label className="text-slate-500 text-xs">Increment</label>
          <select value={increment} onChange={e => setIncrement(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white">
            {[10, 15, 20, 30, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}
          </select>
          <label className="text-slate-500 text-xs">Start</label>
          <select value={startH} onChange={e => setStartH(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white">
            {Array.from({ length: 14 }, (_, i) => i + 5).map(h => (
              <option key={h} value={h}>{fmtTime(`${String(h).padStart(2,'0')}:00`)}</option>
            ))}
          </select>
          <label className="text-slate-500 text-xs">End</label>
          <select value={endH} onChange={e => setEndH(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white">
            {Array.from({ length: 14 }, (_, i) => i + 12).map(h => (
              <option key={h} value={h}>{fmtTime(`${String(h).padStart(2,'0')}:00`)}</option>
            ))}
          </select>
          {saving && <span className="text-blue-500 text-xs animate-pulse">Saving…</span>}
          <button onClick={renumberAll}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 rounded-lg px-3 py-1 transition-colors whitespace-nowrap">
            ↻ Renumber All
          </button>
          <button onClick={() => setSideStage(v => !v)}
            className={`text-xs border rounded-lg px-3 py-1 transition-colors whitespace-nowrap ${sideStage ? 'bg-slate-800 text-white border-slate-600' : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'}`}
            title={sideStage ? 'Switch to top bar layout' : 'Switch to side panel layout'}>
            {sideStage ? '◨ Side Panel' : '◧ Side Panel'}
          </button>
          {games.some(g => g.date || g.startTime || g.location) && (
            <button onClick={unscheduleAll} disabled={unscheduling}
              className="text-xs bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-lg px-3 py-1 disabled:opacity-50 transition-colors whitespace-nowrap">
              {unscheduling ? 'Unscheduling…' : '🗑 Unschedule All'}
            </button>
          )}
        </div>
      </div>

      {/* ── Parking Lot ── */}
      {!sideStage && <div className="bg-slate-900 border-b border-slate-700 flex-shrink-0">

        {/* Filter row */}
        <div className="px-4 sm:px-6 pt-2 pb-1 flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-widest mr-1">Parking Lot</span>
          <button onClick={() => setLotExpanded(v => !v)}
            className="text-slate-500 hover:text-slate-300 transition-colors text-xs px-1"
            title={lotExpanded ? 'Collapse' : 'Expand to see all games'}>
            {lotExpanded ? '▲ Collapse' : '▼ Expand'}
          </button>
          <button
            onClick={() => setLotOrder(
              [...games.filter(g => !g.date || !g.startTime || !g.location)]
                .sort((a,b) => a.division.localeCompare(b.division) || a.gameNumber.localeCompare(b.gameNumber, undefined, {numeric:true}))
                .map(g => g.id)
            )}
            className="text-slate-500 hover:text-slate-300 transition-colors text-xs px-1"
            title="Sort by game number">
            ↕ Sort
          </button>
          <span className="bg-slate-700 text-slate-300 text-xs font-semibold rounded-full px-2 py-0.5 mr-1">
            {unscheduled.length}
          </span>

          <label className="text-slate-500 text-xs">Division:</label>
          <select value={filterDiv}
            onChange={e => { setFilterDiv(e.target.value); setFilterPool('__all__'); setFilterTeam('__all__') }}
            className={selectCls}>
            <option value="__all__">All Divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
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
            <button
              onClick={() => setHideEmptySlots(v => !v)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${hideEmptySlots ? 'bg-slate-200 text-slate-700 border-slate-300' : 'text-slate-400 border-slate-200 hover:border-slate-400'}`}
              title="Hide time rows with no games">
              ⏱ Compact
            </button>
            <div className="relative">
              <button
                onClick={() => setShowFieldPicker(v => !v)}
                className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${hiddenFields.size > 0 ? 'bg-slate-200 text-slate-700 border-slate-300' : 'text-slate-400 border-slate-200 hover:border-slate-400'}`}
                title="Show/hide field columns">
                🏟 Fields{hiddenFields.size > 0 ? ` (${visibleFields.length}/${fields.length})` : ''}
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
                        className="rounded accent-blue-600" />
                      <span className="text-xs text-slate-700">{f.fieldName}</span>
                    </label>
                  ))}
                  {hiddenFields.size > 0 && <button onClick={() => setHiddenFields(new Set())} className="mt-2 text-[10px] text-blue-600 hover:underline block">Show all</button>}
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
                  const color = game ? divColor(game.division, divisions, divColorMap) : ''
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
            </div>
          )}
          {swapMode && (
            <span className="ml-auto text-emerald-400 text-xs hidden sm:block">
              🔄 Click two scheduled games to swap them
            </span>
          )}
        </div>

        {/* Chips + drop zone */}
        <div className="flex gap-0 px-4 sm:px-6 pb-3">
          {/* Drop zone box */}
          <div
            className="flex-shrink-0 w-36 mr-3 rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/50 flex items-center justify-center text-center text-slate-500 text-xs font-medium leading-tight p-2 cursor-default select-none"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDropParking}
          >
            DROP HERE<br />TO UNSCHEDULE
          </div>

          {/* Game chips */}
          <div className={lotExpanded ? 'flex-1 max-h-72 overflow-y-auto' : 'overflow-x-auto flex-1'}>
            <div className={lotExpanded ? 'flex flex-wrap gap-2' : 'flex gap-2 min-w-max'}>
              {filtered.length === 0 ? (
                <p className="text-slate-500 text-sm py-3 italic self-center">
                  {unscheduled.length === 0 ? '🎉 All games scheduled!' : 'No games match filter'}
                </p>
              ) : filteredSorted.map(g => {
                const color = divColor(g.division, divisions, divColorMap)
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
                        patchGame(sourceId, { date: '', startTime: '', location: '' })
                      } else {
                        reorderLot(sourceId, g.id)
                      }
                    }}
                    className={`relative rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing text-xs font-medium whitespace-nowrap select-none flex-shrink-0 shadow transition-all ${dragId === g.id ? 'opacity-30' : 'hover:brightness-110'} ${isLotOver && dragId !== g.id ? 'ring-2 ring-white scale-105' : ''}`}
                    style={{ backgroundColor: color, color: textColor(color) }}
                  >
                    {hasConflict && (
                      <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm" title={conflictMsgs.get(g.id) ?? 'Same-time conflict'}>⚠</span>
                    )}
                    {hasB2B && (
                      <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-slate-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm" title={backToBackMsgs.get(g.id) ?? 'Back-to-back game'}>↔</span>
                    )}
                    <div className="font-bold text-[11px] opacity-80">{g.gameNumber}</div>
                    <div className="font-semibold">{g.team1}</div>
                    <div className="opacity-80">vs {g.team2}</div>
                    <div className="opacity-60 text-[10px] mt-0.5">{g.division}{g.pool ? ` · ${g.pool}` : ''}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>}

      {/* ── Side staging wrapper ── */}
      <div className="flex flex-1 overflow-hidden">
      {sideStage && (
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
              {divisions.map(d => <option key={d} value={d}>{d}</option>)}
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
                const color = game ? divColor(game.division, divisions, divColorMap) : ''
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

          {/* Drop zone */}
          <div
            className="mx-2 mt-2 mb-1 flex-shrink-0 rounded border-2 border-dashed border-slate-600 bg-slate-800/50 flex items-center justify-center text-slate-500 text-xs font-medium p-1.5 cursor-default select-none"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDropParking}
          >
            DROP TO UNSCHEDULE
          </div>
          {/* Game chips */}
          <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1.5">
            {filteredSorted.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-4">
                {unscheduled.length === 0 ? '🎉 All scheduled!' : 'No matches'}
              </p>
            ) : filteredSorted.map(g => {
              const color = divColor(g.division, divisions, divColorMap)
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
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm" title={conflictMsgs.get(g.id) ?? 'Same-time conflict'}>⚠</span>
                  )}
                  {hasB2B && (
                    <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-slate-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm" title={backToBackMsgs.get(g.id) ?? 'Back-to-back game'}>↔</span>
                  )}
                  <div className="font-bold text-[10px] opacity-70 mb-0.5">{g.gameNumber} · {g.division}{g.pool ? ` · ${g.pool}` : ''}</div>
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

        <label className="text-slate-500 text-xs">Division:</label>
        <select value={gridDiv}
          onChange={e => { setGridDiv(e.target.value); setGridPool('__all__'); setGridTeam('__all__') }}
          className={gridSelectCls}>
          <option value="__all__">All Divisions</option>
          {divisions.map(d => <option key={d} value={d}>{d}</option>)}
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
            🔄 Click a game to swap with it
          </span>
        )}
      </div>

      {/* ── Date Tabs ── */}
      <div className="bg-white border-b border-slate-200 overflow-x-auto flex-shrink-0">
        <div className="flex min-w-max">
          {dates.map(d => (
            <button key={d} onClick={() => setActiveDate(d)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeDate === d
                  ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}>
              {fmtDate(d)}
              <span className="ml-2 text-xs rounded-full px-1.5 py-0.5 bg-slate-100 text-slate-500">
                {games.filter(g => g.date === d).length}
              </span>
            </button>
          ))}
          <button onClick={addDay}
            className="px-4 py-3 text-sm text-slate-400 hover:text-slate-600 border-b-2 border-transparent hover:bg-slate-50 whitespace-nowrap">
            + Add Day
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      {fields.length === 0 ? (
        <div className="flex-1 flex items-center justify-center flex-col gap-4 text-slate-400 py-20">
          <div className="text-4xl">🏟️</div>
          <p className="text-base font-medium text-slate-600">No fields configured yet</p>
          {addingField ? (
            <div className="flex items-center gap-2">
              <input autoFocus type="text" placeholder="Field name…" value={newFieldName}
                onChange={e => setNewFieldName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addField(); if (e.key === 'Escape') { setAddingField(false); setNewFieldName('') } }}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 w-40" />
              <button onClick={addField} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">Add</button>
              <button onClick={() => { setAddingField(false); setNewFieldName('') }} className="text-slate-400 hover:text-slate-600 text-xs px-2">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={() => setAddingField(true)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">+ Add Field</button>
              <span className="text-slate-400 text-xs">or add in</span>
              <a href={`/tournaments/${params.id}/builder`} className="text-blue-500 hover:underline text-sm">Builder →</a>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse" style={{ minWidth: `${80 + visibleFields.length * 160}px` }}>
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="sticky left-0 z-30 w-20 bg-slate-100 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 text-center">
                  Time
                </th>
                {visibleFields.map(f => (
                  <th key={f.fullName} className="bg-slate-100 border border-slate-200 px-3 py-2 text-center min-w-[155px] group relative">
                    <div className="text-[10px] text-slate-400 font-normal">{f.venueName}</div>
                    <div className="text-xs font-semibold text-slate-700">{f.fieldName}</div>
                    <button
                      onClick={() => removeField(f.fullName)}
                      className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 text-xs leading-none transition-opacity"
                      title="Remove field">×</button>
                  </th>
                ))}
                <th className="bg-slate-100 border border-slate-200 px-2 py-2 text-center w-24">
                  {addingField ? (
                    <div className="flex flex-col items-center gap-1">
                      <input autoFocus type="text" placeholder="Name…" value={newFieldName}
                        onChange={e => setNewFieldName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addField(); if (e.key === 'Escape') { setAddingField(false); setNewFieldName('') } }}
                        className="border border-slate-300 rounded px-1.5 py-0.5 text-xs w-20 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <div className="flex gap-1">
                        <button onClick={addField} className="bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded">Add</button>
                        <button onClick={() => { setAddingField(false); setNewFieldName('') }} className="text-slate-400 text-[10px] px-1">✕</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingField(true)}
                      className="text-slate-400 hover:text-blue-600 text-xs font-medium transition-colors whitespace-nowrap">
                      + Field
                    </button>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {slots.map(slot => (
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
                        className={`border border-slate-200 p-1 align-top h-16 transition-colors ${isOver ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'}`}
                        onDragOver={e => { e.preventDefault(); setOverCell(cellKey) }}
                        onDragLeave={() => setOverCell(null)}
                        onDrop={e => handleDropCell(e, slot, f.fullName)}
                      >
                        {game ? (
                          <div
                            draggable={!swapMode}
                            onDragStart={e => handleDragStart(e, game.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => handleSwapClick(game.id)}
                            className={`relative rounded-md px-2 py-1 h-full min-h-[52px] flex flex-col justify-between transition-all
                              ${swapMode ? 'cursor-pointer hover:ring-2 hover:ring-white' : 'cursor-grab active:cursor-grabbing'}
                              ${dragId === game.id ? 'opacity-30' : ''}
                              ${!matchesGrid ? 'opacity-20' : 'hover:brightness-110'}
                              ${isSwapSource ? 'ring-2 ring-white ring-offset-1 brightness-125' : ''}
                            `}
                            style={{ backgroundColor: divColor(game.division, divisions, divColorMap), color: textColor(divColor(game.division, divisions, divColorMap)) }}
                          >
                            {conflictMsgs.has(game.id) && (
                              <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[9px] font-bold rounded px-1 leading-tight shadow" title={conflictMsgs.get(game.id) ?? 'Same-time conflict'}>⚠ Conflict</span>
                            )}
                            {!conflictMsgs.has(game.id) && backToBackMsgs.has(game.id) && (
                              <span className="absolute top-0.5 right-0.5 bg-yellow-400 text-slate-900 text-[9px] font-bold rounded px-1 leading-tight shadow" title={backToBackMsgs.get(game.id) ?? 'Back-to-back game'}>⇔</span>
                            )}
                            {!conflictMsgs.has(game.id) && !backToBackMsgs.has(game.id) && longGapMsgs.has(game.id) && (
                              <span className="absolute top-0.5 right-0.5 bg-blue-400 text-white text-[9px] font-bold rounded px-1 leading-tight shadow" title={longGapMsgs.get(game.id) ?? 'Long gap'}>⏱ Gap</span>
                            )}
                            <div className="flex items-center justify-between gap-1">
                              <div className="font-bold text-[10px] leading-none" style={{ color: 'inherit' }}>{game.gameNumber}</div>
                              <div className="text-[9px] leading-none truncate" style={{ opacity: 0.75 }}>{game.division}{game.pool ? ` · ${game.pool}` : ''}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold truncate leading-tight">{game.team1}{(teamGames[game.team1]?.length ?? 0) > 0 && <span className="opacity-60 font-normal"> ({teamGames[game.team1]?.length})</span>}</div>
                              <div className="text-[10px] truncate" style={{ opacity: 0.85 }}>vs {game.team2}{(teamGames[game.team2]?.length ?? 0) > 0 && <span className="opacity-60"> ({teamGames[game.team2]?.length})</span>}</div>
                            </div>
                          </div>
                        ) : isTeamBusy ? (
                          <div className="h-full rounded-sm bg-orange-900/30 border border-orange-400/40 flex items-center justify-center text-[9px] text-orange-300 font-medium">busy</div>
                        ) : null}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>{/* end right-content wrapper */}
      </div>{/* end side staging wrapper */}
    </div>
  )
}