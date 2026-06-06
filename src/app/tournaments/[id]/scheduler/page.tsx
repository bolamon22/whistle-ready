'use client'
import { useEffect, useState } from 'react'
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
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-cyan-500',
]

function divColor(div: string, divs: string[]) {
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

export default function SchedulerPage({ params }: { params: { id: string } }) {
  const [games, setGames]               = useState<Game[]>([])
  const [fields, setFields]             = useState<Field[]>([])
  const [dates, setDates]               = useState<string[]>([])
  const [activeDate, setActiveDate]     = useState('')
  const [increment, setIncrement]       = useState(30)
  const [startH, setStartH]             = useState(8)
  const [endH, setEndH]                 = useState(19)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [tName, setTName]               = useState('')
  const [dragId, setDragId]             = useState<string | null>(null)
  const [filterDiv, setFilterDiv]       = useState('__all__')
  const [overCell, setOverCell]         = useState<string | null>(null) // "time|field"
  const [renumberingPools, setRenumberingPools] = useState(false)

  useEffect(() => {
    async function load() {
      const [gRes, vRes, tRes] = await Promise.all([
        fetch(`/api/tournaments/${params.id}/games`),
        fetch(`/api/venues/${params.id}`),
        fetch(`/api/tournaments/${params.id}`),
      ])
      const gData = await gRes.json()
      const vData = await vRes.json()
      const tData = await tRes.json()

      const allGames: Game[] = Array.isArray(gData) ? gData : (gData.games ?? [])
      setGames(allGames)
      setTName(tData.name ?? '')
      if (tData.scheduleIncrement) setIncrement(Number(tData.scheduleIncrement))

      // Flatten venues → fields (fields may be strings or {id,name,abbr} objects)
      const venueList: any[] = vData.venues ?? []
      const flat: Field[] = []
      venueList.forEach(v => {
        const flds: any[] = Array.isArray(v.fields) ? v.fields : []
        flds.forEach(f => {
          const fieldName = typeof f === 'string' ? f : (f.name ?? String(f))
          flat.push({ venueName: v.name, fieldName, fullName: `${v.name} - ${fieldName}` })
        })
      })
      setFields(flat)

      // Derive tournament dates
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
        allDates = [
          t.toISOString().split('T')[0],
          new Date(t.getTime() + 86400000).toISOString().split('T')[0],
        ]
      }

      setDates(allDates)
      setActiveDate(allDates[0] ?? '')
      setLoading(false)
    }
    load()
  }, [params.id])

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

  function handleDragStart(e: React.DragEvent, gameId: string) {
    e.dataTransfer.setData('gameId', gameId)
    e.dataTransfer.effectAllowed = 'move'
    setDragId(gameId)
  }
  function handleDragEnd() { setDragId(null); setOverCell(null) }

  function handleDropCell(e: React.DragEvent, time: string, field: string) {
    e.preventDefault()
    setOverCell(null)
    const gameId = e.dataTransfer.getData('gameId') || dragId
    if (!gameId) return
    patchGame(gameId, { date: activeDate, startTime: time, location: field })
  }

  function handleDropParking(e: React.DragEvent) {
    e.preventDefault()
    setOverCell(null)
    const gameId = e.dataTransfer.getData('gameId') || dragId
    if (!gameId) return
    const g = games.find(x => x.id === gameId)
    if (g && (g.date || g.startTime || g.location)) {
      patchGame(gameId, { date: '', startTime: '', location: '' })
    }
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

  async function renumberPoolGames() {
    setRenumberingPools(true)
    const divs = [...new Set(games.filter(g => g.pool).map(g => g.division))]
    await Promise.all(divs.map(div =>
      fetch(`/api/tournaments/${params.id}/divisions/${encodeURIComponent(div)}/pool-games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'renumber' }),
      })
    ))
    const gRes = await fetch(`/api/tournaments/${params.id}/games`)
    const gData = await gRes.json()
    setGames(Array.isArray(gData) ? gData : (gData.games ?? []))
    toast.success(`Renumbered pool games for ${divs.length} division${divs.length !== 1 ? 's' : ''}`)
    setRenumberingPools(false)
  }

  const divisions = [...new Set(games.map(g => g.division))].sort()
  const unscheduled = games.filter(g => !g.date || !g.startTime || !g.location)
  const filtered = unscheduled.filter(g => filterDiv === '__all__' || g.division === filterDiv)
  const dayGames = games.filter(g => g.date === activeDate && g.startTime && g.location)
  const slots = makeSlots(startH, endH, increment)

  // slot+field → game lookup
  const cellMap: Record<string, Game> = {}
  dayGames.forEach(g => { cellMap[`${g.startTime}|${g.location}`] = g })

  // ── Conflict detection ─────────────────────────────────────────────
  const scheduledGames = games.filter(g => g.date && g.startTime)

  function slotIndex(time: string) {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + m
  }

  const conflictIds = new Set<string>()
  const backToBackIds = new Set<string>()

  const teamGames: Record<string, Game[]> = {}
  scheduledGames.forEach(g => {
    ;[g.team1, g.team2].forEach(team => {
      if (!team || team === 'TBD') return
      teamGames[team] = teamGames[team] ?? []
      teamGames[team].push(g)
    })
  })

  Object.values(teamGames).forEach(tg => {
    for (let i = 0; i < tg.length; i++) {
      for (let j = i + 1; j < tg.length; j++) {
        const a = tg[i], b = tg[j]
        if (a.date !== b.date) continue
        const diff = Math.abs(slotIndex(a.startTime) - slotIndex(b.startTime))
        if (diff === 0) {
          conflictIds.add(a.id)
          conflictIds.add(b.id)
        } else if (diff === increment) {
          backToBackIds.add(a.id)
          backToBackIds.add(b.id)
        }
      }
    }
  })

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <TournamentNav id={params.id} />
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <TournamentNav id={params.id} />
      <Toaster position="top-right" />

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div>
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
          <button onClick={renumberPoolGames} disabled={renumberingPools}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 font-medium transition-colors disabled:opacity-50">
          {renumberingPools ? 'Renumbering…' : 'Renumber Pool #s'}
        </button>
        {saving && <span className="text-blue-500 text-xs animate-pulse">Saving…</span>}
        </div>
      </div>

      {/* ── Parking Lot ── */}
      <div
        className="bg-slate-900 border-b border-slate-700 flex-shrink-0"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDropParking}
      >
        <div className="px-4 sm:px-6 pt-2 pb-1 flex items-center gap-3">
          <span className="text-slate-400 text-xs font-semibold uppercase tracking-widest">
            Parking Lot
          </span>
          <span className="bg-slate-700 text-slate-300 text-xs font-semibold rounded-full px-2 py-0.5">
            {unscheduled.length}
          </span>
          <select value={filterDiv} onChange={e => setFilterDiv(e.target.value)}
            className="ml-2 text-xs bg-slate-800 text-slate-200 border border-slate-600 rounded px-2 py-0.5">
            <option value="__all__">All Divisions</option>
            {divisions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="ml-auto text-slate-600 text-xs hidden sm:block">
            Drag to grid ↓  ·  Drag to here to unschedule
          </span>
        </div>
        <div className="overflow-x-auto">
          <div className="flex gap-2 px-4 sm:px-6 pb-3 min-w-max">
            {filtered.length === 0 ? (
              <p className="text-slate-500 text-sm py-3 italic">
                {unscheduled.length === 0 ? '🎉 All games scheduled!' : 'No games match filter'}
              </p>
            ) : filtered.map(g => {
              const color = divColor(g.division, divisions)
                  const hasConflict = conflictIds.has(g.id)
                  const hasB2B = !hasConflict && backToBackIds.has(g.id)
              return (
                <div
                  key={g.id}
                  draggable
                  onDragStart={e => handleDragStart(e, g.id)}
                  onDragEnd={handleDragEnd}
                  className={`relative ${color} rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing text-white text-xs font-medium whitespace-nowrap select-none flex-shrink-0 shadow transition-opacity ${dragId === g.id ? 'opacity-30' : 'hover:brightness-110'}`}
                >
                  {hasConflict && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm" title="Same-time conflict">⚠️</span>
                  )}
                  {hasB2B && (
                    <span className="absolute -top-1.5 -right-1.5 bg-yellow-400 text-slate-900 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center shadow-sm" title="Back-to-back game">⇔</span>
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
        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-slate-400 py-20">
          <div className="text-4xl">🏟️</div>
          <p className="text-base font-medium text-slate-600">No fields configured yet</p>
          <p className="text-sm">Add venues and fields in the
            <a href={`/tournaments/${params.id}/builder`} className="text-blue-500 hover:underline ml-1">Builder</a>
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="border-collapse" style={{ minWidth: `${80 + fields.length * 160}px` }}>
            <thead className="sticky top-0 z-20">
              <tr>
                {/* Time header */}
                <th className="sticky left-0 z-30 w-20 bg-slate-100 border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 text-center">
                  Time
                </th>
                {/* Group fields by venue */}
                {fields.map(f => (
                  <th key={f.fullName}
                    className="bg-slate-100 border border-slate-200 px-3 py-2 text-center min-w-[155px]">
                    <div className="text-[10px] text-slate-400 font-normal">{f.venueName}</div>
                    <div className="text-xs font-semibold text-slate-700">{f.fieldName}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map(slot => (
                <tr key={slot}>
                  {/* Time label */}
                  <td className="sticky left-0 z-10 bg-white border border-slate-200 px-2 py-1 text-xs text-slate-500 font-medium text-center whitespace-nowrap w-20">
                    {fmtTime(slot)}
                  </td>
                  {/* Field cells */}
                  {fields.map(f => {
                    const cellKey = `${slot}|${f.fullName}`
                    const game = cellMap[cellKey]
                    const isOver = overCell === cellKey
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
                            draggable
                            onDragStart={e => handleDragStart(e, game.id)}
                            onDragEnd={handleDragEnd}
                            className={`${divColor(game.division, divisions)} relative rounded-md px-2 py-1 cursor-grab active:cursor-grabbing h-full min-h-[52px] flex flex-col justify-between transition-opacity ${dragId === game.id ? 'opacity-30' : 'hover:brightness-110'}`}
                          >
                              {conflictIds.has(game.id) && (
                                <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[9px] font-bold rounded px-1 leading-tight shadow" title="Same-time conflict">⚠️ Conflict</span>
                              )}
                              {!conflictIds.has(game.id) && backToBackIds.has(game.id) && (
                                <span className="absolute top-0.5 right-0.5 bg-yellow-400 text-slate-900 text-[9px] font-bold rounded px-1 leading-tight shadow" title="Back-to-back game">⇔ B2B</span>
                              )}
                            <div>
                              <div className="text-white text-[10px] font-bold opacity-75">{game.gameNumber}</div>
                              <div className="text-white text-xs font-semibold leading-tight truncate">{game.team1}</div>
                              <div className="text-white/70 text-[10px] truncate">vs {game.team2}</div>
                            </div>
                            <div className="text-white/50 text-[9px] truncate">{game.division}</div>
                          </div>
                        ) : (
                          <div className={`h-full min-h-[52px] rounded-md border-2 border-dashed transition-colors ${isOver ? 'border-blue-400 bg-blue-50' : 'border-transparent'}`} />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
