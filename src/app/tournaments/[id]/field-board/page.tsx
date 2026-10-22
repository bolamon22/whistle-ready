'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { LayoutGrid, RefreshCw, ChevronDown, ChevronUp, Printer } from 'lucide-react'
import EventBackLink from '@/components/EventBackLink'
import { useRole } from '@/lib/role-context'
import { roleCanAccess } from '@/lib/routeAccess'
import { gameGender } from '@/lib/gameGender'
import { time12, dayDate } from '@/lib/time12'

// Field board (Bo, Oct 19 2026): the Assigner's grid, view only, for the people at
// the fields. Field directors can't open the Assigner, and tournament directors at the
// park shouldn't be one tap from moving someone. Fields across, times down, every ref
// and scorekeeper by name, open spots in red.
//
// "Refs" or "Scorekeepers" boils each game down to just those people (Bo: "it would
// minimize and just show that person ... and then we can just expand it if needed").
// Tap a game to open it; "Teams" opens them all.
//
// Phones get one time slot at a time instead of a table that scrolls sideways.
// Data: /api/tournaments/[id]/games, the same list the Assigner reads. A field
// director gets phone numbers for their own staff only (lib/roleScope).

type Worker = { id: string; name: string; phone?: string | null }
type Assignment = { id: string; role: string; workerId: string; worker?: Worker | null }
type Game = {
  id: string; gameNumber: string; date: string; startTime: string; location: string; division: string; pool?: string | null
  team1: string; team2: string; refCount?: number | null; isCanceled?: boolean; isChampionship?: boolean; assignments: Assignment[]
}
type Show = 'all' | 'refs' | 'sk'
type Side = 'all' | 'boys' | 'girls'

const REF_ROLES = ['ref1', 'ref2', 'ref3']
const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }
const fieldName = (loc: string) => (loc.includes(' - ') ? loc.split(' - ').slice(1).join(' - ') : loc).trim()
const fieldKey = (loc: string) => { const m = loc.match(/(\d+)\s*([A-Za-z]*)/); return m ? { n: Number(m[1]), s: m[2].toUpperCase() } : { n: 999, s: loc } }
const byField = (a: string, b: string) => { const x = fieldKey(a), y = fieldKey(b); return x.n - y.n || x.s.localeCompare(y.s) }
const tel = (p: string) => p.replace(/[^\d+]/g, '')
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// The slots a game has under the current filter: refs up to its ref count, then the scorekeeper.
function slotsOf(g: Game, show: Show) {
  const rc = Math.min(3, Math.max(1, Number(g.refCount) || 2))
  const refs = REF_ROLES.slice(0, rc).map((role, i) => ({ role, short: `R${i + 1}`, a: g.assignments.find(a => a.role === role) }))
  const sk = { role: 'scorekeeper', short: 'SK', a: g.assignments.find(a => a.role === 'scorekeeper') }
  return show === 'refs' ? refs : show === 'sk' ? [sk] : [...refs, sk]
}
const openCount = (g: Game, show: Show) => slotsOf(g, show).filter(s => !s.a).length

export default function FieldBoardPage() {
  const { id } = useParams()
  const tid = Array.isArray(id) ? id[0] : String(id)
  const { effectiveRole, planOff } = useRole()
  const [games, setGames] = useState<Game[]>([])
  const [day, setDay] = useState('')
  const [show, setShowRaw] = useState<Show>('all')
  const [side, setSide] = useState<Side>('all')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [teams, setTeams] = useState(true)            // every game opened up
  const [opened, setOpened] = useState<Set<string>>(new Set())  // games opened one at a time
  const [slot, setSlot] = useState('')                // phone: the time slot showing
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [stamp, setStamp] = useState<Date | null>(null)
  const [eventName, setEventName] = useState('')
  useEffect(() => { fetch(`/api/tournaments/${encodeURIComponent(tid)}`).then(r => r.ok ? r.json() : null).then(t => t?.name && setEventName(t.name)).catch(() => {}) }, [tid])

  // Picking refs or scorekeepers folds the games down to names; Everyone opens them.
  function setShow(s: Show) { setShowRaw(s); setTeams(s === 'all'); setOpened(new Set()) }

  function load() {
    fetch(`/api/tournaments/${encodeURIComponent(tid)}/games`, { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => null)
      if (!r.ok || !Array.isArray(d)) { setErr((d && d.error) || 'Could not load the games'); return }
      setGames(d); setErr(''); setStamp(new Date())
    }).catch(() => setErr('Could not load the games')).finally(() => setLoaded(true))
  }
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [tid])

  const placed = useMemo(() => games.filter(g => !g.isCanceled && g.date && g.startTime && g.location), [games])
  const dates = useMemo(() => Array.from(new Set(placed.map(g => g.date))).sort(), [placed])
  useEffect(() => { if (!day && dates.length) setDay(dates.includes(todayISO()) ? todayISO() : dates[0]) }, [dates, day])

  const dayGames = placed.filter(g => g.date === day && (side === 'all' || gameGender(g.division) === side || gameGender(g.division) === 'both'))
  const shown = onlyOpen ? dayGames.filter(g => openCount(g, show) > 0) : dayGames
  const times = Array.from(new Set(dayGames.map(g => g.startTime))).sort((a, b) => toMin(a) - toMin(b))
  const shownTimes = times.filter(t => shown.some(g => g.startTime === t))
  const fields = Array.from(new Set(dayGames.map(g => g.location))).sort(byField)
  const cell = new Map(shown.map(g => [`${g.startTime}|${g.location}`, g]))
  const openSpots = dayGames.reduce((n, g) => n + openCount(g, show), 0)
  const crewed = (t: string) => { const gs = dayGames.filter(g => g.startTime === t); return { done: gs.filter(g => !openCount(g, show)).length, of: gs.length } }

  // Phone: the slot now under way (or next) on game day, else the first.
  useEffect(() => {
    if (!shownTimes.length) return
    if (slot && shownTimes.includes(slot)) return
    const now = new Date().getHours() * 60 + new Date().getMinutes()
    const live = day === todayISO() ? shownTimes.find(t => toMin(t) + 50 > now) : undefined
    setSlot(live || shownTimes[0])
  }, [shownTimes.join(','), day])

  const isOpen = (g: Game) => teams || opened.has(g.id)
  const toggle = (g: Game) => setOpened(s => { const n = new Set(s); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n })
  const showLabel = show === 'refs' ? 'refs' : show === 'sk' ? 'scorekeepers' : 'spots'
  const canAssign = roleCanAccess(effectiveRole, `/tournaments/${tid}`, planOff)

  const people = (g: Game, big = false) => (
    <div className={big ? 'space-y-1' : 'space-y-0.5'}>
      {slotsOf(g, show).map(s => {
        const w = s.a?.worker
        return (
          <div key={s.role} className={`flex items-baseline gap-1.5 ${big ? 'text-sm' : 'text-[12px]'} leading-snug min-w-0`}>
            <span className={`shrink-0 w-6 font-extrabold ${s.role === 'scorekeeper' ? 'text-emerald-600' : 'text-sky-600'}`}>{s.short}</span>
            {!s.a ? <span className="font-bold text-red-600">{s.role === 'scorekeeper' ? 'Need scorekeeper' : 'Need ref'}</span>
              : w?.phone ? <a href={`tel:${tel(w.phone)}`} onClick={e => e.stopPropagation()} className="truncate text-slate-800 underline decoration-slate-300 underline-offset-2 hover:text-teal-700" title={`Call ${w.name} · ${w.phone}`}>{w.name}</a>
              : <span className="truncate text-slate-800">{w?.name || 'Assigned'}</span>}
          </div>
        )
      })}
    </div>
  )
  const head = (g: Game) => (
    <div className="flex items-center gap-1 text-[10.5px] font-bold text-slate-500 min-w-0">
      <span className="text-slate-800">#{g.gameNumber}</span>
      <span className="truncate">{g.division}{g.pool ? ` · ${g.pool}` : ''}</span>
      {g.isChampionship && <span className="text-amber-600">★</span>}
    </div>
  )
  const stripe = (g: Game) => { const s = gameGender(g.division); return s === 'boys' ? 'border-l-sky-400' : s === 'girls' ? 'border-l-pink-400' : 'border-l-slate-300' }
  const seg = (on: boolean) => `px-3 py-1.5 rounded-lg text-[13px] font-semibold ${on ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`

  return (
    <div className="max-w-[1600px] mx-auto">
      <EventBackLink id={tid} />
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><LayoutGrid size={22} className="text-teal-600" /> Field board</h1>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => window.print()} disabled={!shown.length} title="Print what's showing: the day, Refs or Scorekeepers, Boys or Girls" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg px-3 py-1.5 disabled:opacity-40"><Printer size={14} /> Print</button>
          {/* Every day at once, as a list or grid (Print schedule; field directors too, Oct 22 2026). */}
          <Link href={`/tournaments/${tid}/print-schedule`} title="Print every day, or one, by time or by field" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 px-2 py-1">All days</Link>
          <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 px-2 py-1"><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Who&apos;s on every field, view only. Red is a spot nobody has yet. Tap a name to call them.
        {canAssign && <> Changes happen in the <Link href={`/tournaments/${tid}`} className="text-teal-700 font-semibold hover:underline">Assigner</Link>.</>}
        {stamp && <span className="text-slate-400"> Updated {stamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.</span>}
      </p>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {loaded && !err && dates.length === 0 && <p className="text-sm text-slate-400">No games have a day, time and field yet.</p>}

      {dates.length > 0 && (<>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-0.5" role="group" aria-label="Day">
            {dates.map(d => <button key={d} type="button" onClick={() => { setDay(d); setSlot('') }} aria-pressed={d === day} className={seg(d === day)}>{dayDate(d)}</button>)}
          </div>
          <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-0.5" role="group" aria-label="Show">
            {([['all', 'Everyone'], ['refs', 'Refs'], ['sk', 'Scorekeepers']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setShow(k)} aria-pressed={show === k} className={seg(show === k)}>{l}</button>)}
          </div>
          <div className="inline-flex p-1 rounded-xl bg-slate-100 gap-0.5" role="group" aria-label="Boys or girls">
            {([['all', 'All'], ['boys', 'Boys'], ['girls', 'Girls']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setSide(k)} aria-pressed={side === k} className={seg(side === k)}>{l}</button>)}
          </div>
          <button type="button" onClick={() => setOnlyOpen(o => !o)} aria-pressed={onlyOpen}
            className={`h-9 px-3 rounded-full border text-[13px] font-semibold ${onlyOpen ? 'bg-red-600 border-red-600 text-white' : openSpots ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-500'}`}>
            {openSpots ? `${openSpots} open ${showLabel}` : `No open ${showLabel}`}{onlyOpen ? ' · showing only these' : ''}
          </button>
          <button type="button" onClick={() => { setTeams(t => !t); setOpened(new Set()) }} aria-pressed={teams}
            className="h-9 px-3 rounded-full border border-slate-200 bg-white text-[13px] font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1">
            {teams ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {teams ? 'Hide teams' : 'Show teams'}
          </button>
        </div>

        {shown.length === 0 && <p className="text-sm text-slate-400 py-6">{onlyOpen ? `Every game has its ${showLabel === 'spots' ? 'crew' : showLabel}.` : 'No games this day.'}</p>}

        {/* Print (Bo, Oct 20 2026: refs print it and bring it to the field): only this block
            prints, landscape, the table whatever the screen size, with a heading that says
            which day and filters it shows. */}
        <style>{`@media print {
          @page { size: landscape; margin: 0.35in }
          body * { visibility: hidden !important }
          #fb-print, #fb-print * { visibility: visible !important }
          #fb-print { position: absolute; left: 0; top: 0; width: 100% }
          #fb-print .fb-table { display: block !important; max-height: none !important; overflow: visible !important; border: 0 !important; border-radius: 0 !important }
          #fb-print .fb-table table { min-width: 0 !important; font-size: 10px }
          #fb-print .fb-table th, #fb-print .fb-table td { position: static !important }
          #fb-print .fb-phone { display: none !important }
          #fb-print tr { break-inside: avoid }
          #fb-print .truncate { white-space: normal !important; overflow: visible !important; text-overflow: clip !important }
          #fb-print a { text-decoration: none !important; color: inherit !important }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact }
        }`}</style>
        <div id="fb-print">
        <div className="hidden print:block mb-2">
          <div className="text-base font-bold text-slate-900">{eventName || 'Field board'} · {dayDate(day)}</div>
          <div className="text-[11px] text-slate-600">{show === 'refs' ? 'Refs only' : show === 'sk' ? 'Scorekeepers only' : 'Refs and scorekeepers'}{side !== 'all' ? ` · ${side === 'boys' ? 'Boys' : 'Girls'} games` : ''}{onlyOpen ? ' · only games with open spots' : ''} · printed {new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
        </div>

        {/* Desktop and tablets: fields across, times down. */}
        {shown.length > 0 && (
          <div className="fb-table hidden md:block rounded-xl border border-slate-200 bg-white overflow-auto max-h-[calc(100vh-220px)]">
            {/* Fixed columns so every field gets the same width and fits the screen where it can. */}
            <table className="border-collapse w-full table-fixed" style={{ minWidth: 96 + fields.length * 150 }}>
              <colgroup><col style={{ width: 96 }} />{fields.map(f => <col key={f} />)}</colgroup>
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-20 bg-slate-800 text-white text-[11px] font-bold px-2 py-2 text-left w-24">Time</th>
                  {fields.map(f => <th key={f} className="sticky top-0 z-10 bg-slate-50 border-b border-l border-slate-200 text-[11px] font-bold uppercase tracking-wide text-slate-500 px-2 py-2 text-left">{fieldName(f)}</th>)}
                </tr>
              </thead>
              <tbody>
                {shownTimes.map(t => {
                  const c = crewed(t)
                  return (
                    <tr key={t} className="border-t border-slate-200">
                      <td className="sticky left-0 z-10 bg-slate-800 text-white px-2 py-2 align-top whitespace-nowrap">
                        <div className="text-[13px] font-extrabold">{time12(t)}</div>
                        <div className={`text-[10.5px] ${c.done < c.of ? 'text-red-200' : 'text-slate-300'}`}>{c.done} of {c.of} crewed</div>
                      </td>
                      {fields.map(f => {
                        const g = cell.get(`${t}|${f}`)
                        if (!g) return <td key={f} className="border-l border-slate-100 bg-slate-50/60" />
                        const open = openCount(g, show) > 0
                        return (
                          <td key={f} onClick={() => !teams && toggle(g)}
                            className={`border-l border-slate-200 align-top p-0 ${!teams ? 'cursor-pointer' : ''}`}>
                            <div className={`h-full px-2 py-1.5 border-l-4 ${stripe(g)} ${open ? 'bg-red-50' : ''}`}>
                              {head(g)}
                              {isOpen(g) && <div className="text-[12px] font-semibold text-slate-900 leading-tight my-1">{g.team1}<span className="font-normal text-slate-400"> vs </span>{g.team2}</div>}
                              {people(g)}
                            </div>
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

        {/* Phones: one time slot at a time. */}
        {shown.length > 0 && (
          <div className="fb-phone md:hidden">
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
              {shownTimes.map(t => {
                const c = crewed(t)
                return (
                  <button key={t} type="button" onClick={() => setSlot(t)} aria-pressed={slot === t}
                    className={`shrink-0 px-3 py-1.5 rounded-full border text-[13px] font-bold ${slot === t ? 'bg-teal-600 border-teal-600 text-white' : c.done < c.of ? 'border-red-300 text-red-700 bg-white' : 'border-slate-200 text-slate-700 bg-white'}`}>
                    {time12(t).replace(' ', ' ')}
                  </button>
                )
              })}
            </div>
            {slot && (() => {
              const c = crewed(slot)
              return (<>
                <div className="flex items-baseline justify-between my-2">
                  <h2 className="text-base font-extrabold text-slate-800">{time12(slot)}</h2>
                  <span className={`text-xs font-semibold ${c.done < c.of ? 'text-red-600' : 'text-slate-500'}`}>{c.done} of {c.of} crewed</span>
                </div>
                <div className="space-y-2">
                  {shown.filter(g => g.startTime === slot).sort((a, b) => byField(a.location, b.location)).map(g => {
                    const open = openCount(g, show) > 0
                    return (
                      <div key={g.id} onClick={() => !teams && toggle(g)}
                        className={`rounded-xl border border-l-4 ${stripe(g)} px-3 py-2.5 ${open ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'} ${!teams ? 'cursor-pointer' : ''}`}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm font-extrabold text-slate-900 shrink-0">{fieldName(g.location)}</span>
                          {head(g)}
                        </div>
                        {isOpen(g) && <div className="text-[13px] font-semibold text-slate-800 leading-snug mt-0.5 mb-1">{g.team1}<span className="font-normal text-slate-400"> vs </span>{g.team2}</div>}
                        <div className="mt-1">{people(g, true)}</div>
                      </div>
                    )
                  })}
                </div>
              </>)
            })()}
          </div>
        )}
        </div>
      </>)}
    </div>
  )
}
