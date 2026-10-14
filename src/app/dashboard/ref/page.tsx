'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import MyAvailability, { type AvDay } from '@/components/MyAvailability'
import StaffW9Card from '@/components/StaffW9Card'
import { Radio, Target, Users, ClipboardCheck, TriangleAlert, Timer, Clock, Play, Square, CalendarDays, CheckCircle2, GraduationCap, ChevronRight, BookOpen, Phone, MessageSquare, Search, MapPin, Siren, Bell, ArrowRight } from 'lucide-react'
import { videosFor } from '@/lib/training'
import StaffAlerts from '@/components/StaffAlerts'
import { teamRefKey } from '@/lib/names'
import SmsConsent from '@/components/SmsConsent'

interface Tournament { id: string; name: string; startDate: string; logoUrl: string }
interface PortalEvent { id: string; name: string; startDate: string; endDate: string; location: string; working: boolean; assignedGames: number; avail?: { days: AvDay[] } | null }
interface Portal { worker: { id: string; name: string; defaultRole: string; roles: string[] } | null; events: PortalEvent[] }

// Which game-day tools each role actually uses — a referee has no business in the
// setup checklist (Bo, Sep 4). Multi-role workers see the union; no linked worker
// record falls back to showing everything.
const TOOLS: { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; roles: string[] | null }[] = [
  { href: 'communications', label: 'Field Request',   icon: Radio,          roles: null },
  { href: 'scoring',        label: 'Live scoring',    icon: Timer,          roles: ['ref', 'scorekeeper', 'field_ops'] },
  { href: 'scores',         label: 'Post scores',     icon: Target,         roles: ['ref', 'scorekeeper', 'field_ops'] },
  { href: 'directory',      label: 'Staff contacts',  icon: Users,          roles: null },
  { href: 'checklist',      label: 'Setup checklist', icon: ClipboardCheck, roles: ['field_ops'] },
  { href: 'incidents',      label: 'Incidents',       icon: TriangleAlert,  roles: null },
  { href: 'emergency',      label: 'Emergency plan',  icon: Siren,          roles: null },
  { href: 'rules',          label: 'Rules',           icon: BookOpen,       roles: ['ref', 'scorekeeper'] },
]
interface Crew { role: string; name: string; phone: string }
interface Assignment { id: string; role: string; payRate: number; game: Game; crew?: Crew[] }
interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  isCanceled: boolean; tournamentId: string
  assignments?: { role: string; workerId: string; worker?: { name: string; phone?: string | null } }[]
}

// Assignment slots are stored as ref1/ref2/ref3 and scorekeeper; say them the way the
// assigner board does.
const slotLabel = (r?: string) => !r ? '' : r === 'scorekeeper' ? 'Scorekeeper' : /^ref(\d)$/.test(r) ? `Official ${r.slice(3)}` : r === 'ref' ? 'Official' : r
const slotOrder = (r: string) => r === 'scorekeeper' ? 9 : Number(r.replace(/\D/g, '') || 0)
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const minsOf = (t?: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const time12 = (t?: string) => { const m = minsOf(t); if (m == null) return t || 'TBD'; const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
const dayLabel = (d?: string) => { if (!d) return 'Date TBD'; const t = new Date(d + 'T12:00:00'); return isNaN(t.getTime()) ? d : t.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }
function byDay<T extends { date: string }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>(); for (const g of list) { const k = g.date || ''; m.set(k, [...(m.get(k) || []), g]) }
  return Array.from(m.entries())
}

export default function RefDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [allGames, setAllGames] = useState<Game[]>([])
  // Availability (Oct 14 2026): a to-do card until every day of every event they work
  // has an answer, "You're all set" right after the last one, and the event a
  // reminder email links to (?avail=<id>) scrolled to and outlined.
  const [allSet, setAllSet] = useState(false)
  const [flash, setFlash] = useState('')
  const linked = useRef(false)
  const [selTournament, setSelTournament] = useState('')
  const [view, setView] = useState<'mine' | 'all'>('mine')
  const [showPast, setShowPast] = useState(false)
  const [q, setQ] = useState('')
  // Coach names per team, by event (api/ref/coaches): teamRefKey(division, team) -> name.
  const [coaches, setCoaches] = useState<Record<string, Record<string, string>>>({})
  const [loading, setLoading] = useState(true)
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set())
  const [punch, setPunch] = useState<any>(null)      // { worker, open, entries }
  const [portal, setPortal] = useState<Portal | null>(null)
  const [eventBusy, setEventBusy] = useState('')
  const [punchBusy, setPunchBusy] = useState(false)
  const [, setNowTick] = useState(0)                  // re-render the elapsed timer
  const [training, setTraining] = useState<{ roles: string[]; watched: string[] } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/ref/assignments').then(r => r.json()),
      fetch('/api/tournaments').then(r => r.json()),
      fetch('/api/staff-portal').then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([a, t, p]) => {
      fetch('/api/training').then(r => r.ok ? r.json() : null).then(d => { if (d && Array.isArray(d.watched)) setTraining({ roles: d.roles || [], watched: d.watched }) }).catch(() => {})
      setAssignments(Array.isArray(a) ? a : [])
      setCheckedIn(new Set((Array.isArray(a) ? a : []).filter((x: any) => x.checkedInAt).map((x: any) => x.game.id)))
      setTournaments(Array.isArray(t) ? t : [])
      setPortal(p && Array.isArray(p.events) ? p : null)
      // Default to the first event they're actually working, else the first tournament
      const firstWorking = p && Array.isArray(p.events) ? p.events.find((e: PortalEvent) => e.working) : null
      const def = firstWorking?.id || (Array.isArray(t) && t.length > 0 ? t[0].id : '')
      if (def) { setSelTournament(def); loadAllGames(def) }
      setLoading(false)
    })
  }, [status])

  useEffect(() => {
    if (!portal || linked.current) return
    linked.current = true
    const id = new URLSearchParams(window.location.search).get('avail')
    if (id) setTimeout(() => jumpTo(id), 200)
  }, [portal])

  function jumpTo(id?: string) {
    if (!id) return
    const el = document.getElementById(`ev-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setFlash(id); setTimeout(() => setFlash(f => (f === id ? '' : f)), 3000)
  }

  // Days still without an answer, across the events they're working.
  const openDays = (p: Portal | null) => (p?.events || []).filter(e => e.working && e.avail).reduce((n, e) => n + e.avail!.days.filter(d => !d.state).length, 0)
  function updateAvail(eventId: string, days: AvDay[]) {
    if (!portal) return
    const next = { ...portal, events: portal.events.map(e => e.id === eventId ? { ...e, avail: { days } } : e) }
    if (openDays(portal) > 0 && openDays(next) === 0) setAllSet(true)
    setPortal(next)
  }

  const loadAllGames = async (tournamentId: string) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/games`)
    const g = await res.json()
    setAllGames(Array.isArray(g) ? g : [])
  }

  // Saved per game (api/ref/checkin) so the director sees it on Assignments; tap again to undo a mis-tap.
  async function checkIn(id: string) {
    const undo = checkedIn.has(id)
    if (undo && !confirm('Undo your check-in for this game?')) return
    const res = await fetch('/api/ref/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gameId: id, undo }) }).catch(() => null)
    const d = res ? await res.json().catch(() => ({})) : {}
    if (!res?.ok) { toast.error(d.error || 'Could not check in. Try again.'); return }
    setCheckedIn(s => { const n = new Set(s); if (undo) n.delete(id); else n.add(id); return n })
    toast.success(undo ? 'Check-in undone' : 'Checked in')
  }

  // ── My events: put yourself on / off an event's roster (see /api/staff-portal) ──
  async function setWorkingEvent(ev: PortalEvent, join: boolean) {
    if (eventBusy) return
    if (!join && !confirm(`Take yourself off ${ev.name}?`)) return
    setEventBusy(ev.id)
    try {
      const res = await fetch('/api/staff-portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: ev.id, action: join ? 'join' : 'leave' }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'Could not update'); return }
      // Reload, so a new event comes back with its days to answer.
      const fresh = await fetch('/api/staff-portal').then(r => r.ok ? r.json() : null).catch(() => null)
      if (fresh && Array.isArray(fresh.events)) setPortal(fresh)
      else setPortal(pt => pt ? { ...pt, events: pt.events.map(e => e.id === ev.id ? { ...e, working: join } : e) } : pt)
      toast.success(join ? `You're on the list for ${ev.name}. Now tell us which days you can work.` : `Removed from ${ev.name}`)
      if (join) { setSelTournament(ev.id); loadAllGames(ev.id) }
    } catch { toast.error('Could not update') } finally { setEventBusy('') }
  }

  const fmtRange = (a: string, b: string) => {
    const f = (d: string) => { const t = new Date(d.includes('T') ? d : d + 'T12:00:00'); return isNaN(t.getTime()) ? '' : t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
    const s1 = f(a), s2 = b && b !== a ? f(b) : ''
    return s1 ? (s2 ? `${s1} – ${s2}` : s1) : 'Dates TBD'
  }

  const myRoles = portal?.worker?.roles ?? null
  const visibleTools = TOOLS.filter(t => !t.roles || !myRoles || t.roles.some(r => myRoles.includes(r)))

  // ── Punch clock (hourly staff: field ops + trainers) ──
  async function loadPunch(tid: string) {
    try { const d = await fetch(`/api/tournaments/${tid}/punch`).then(r => r.ok ? r.json() : null); setPunch(d) } catch {}
  }
  useEffect(() => {
    if (!selTournament) return
    loadPunch(selTournament)
    const t = setInterval(() => setNowTick(n => n + 1), 30000) // refresh elapsed display
    return () => clearInterval(t)
  }, [selTournament])

  const coachEvents = Array.from(new Set([selTournament, ...assignments.map(a => a.game.tournamentId)].filter(Boolean))).sort().join(',')
  useEffect(() => {
    for (const tid of coachEvents ? coachEvents.split(',') : []) {
      if (coaches[tid]) continue
      fetch(`/api/ref/coaches?t=${encodeURIComponent(tid)}`).then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.coaches) setCoaches(c => ({ ...c, [tid]: d.coaches })) }).catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachEvents])

  const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  function teHours(e: any): number {
    if (e.hoursManual != null) return e.hoursManual
    if (e.clockIn && e.clockOut) { const [ih, im] = e.clockIn.split(':').map(Number); const [oh, om] = e.clockOut.split(':').map(Number); return Math.max(0, (oh * 60 + om - (ih * 60 + im)) / 60) }
    return 0
  }
  function elapsedLabel(clockIn: string): string {
    const [h, m] = clockIn.split(':').map(Number)
    const start = new Date(); start.setHours(h, m, 0, 0)
    let mins = Math.floor((Date.now() - start.getTime()) / 60000); if (mins < 0) mins = 0
    return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
  }
  const friendlyRole = (r?: string) => r === 'field_ops' ? 'Field Ops' : r === 'athletic_trainer' ? 'Athletic Trainer' : r === 'scorekeeper' ? 'Scorekeeper' : r === 'ref' ? 'Referee' : 'Staff'
  async function punchAction(action: 'in' | 'out') {
    if (!selTournament) return
    setPunchBusy(true)
    try {
      const res = await fetch(`/api/tournaments/${selTournament}/punch`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, time: nowHHMM(), date: todayYMD() }),
      })
      if (res.ok) { toast.success(action === 'in' ? 'Clocked in ✓' : 'Clocked out ✓'); await loadPunch(selTournament) }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Failed') }
    } catch { toast.error('Failed') } finally { setPunchBusy(false) }
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  const myGameIds = new Set(assignments.map(a => a.game.id))
  const coachOf = (g: Game, team: string) => coaches[g.tournamentId]?.[teamRefKey(g.division, team)] || ''
  function Coaches({ g }: { g: Game }) {
    const c1 = coachOf(g, g.team1), c2 = coachOf(g, g.team2)
    if (!c1 && !c2) return null
    return <p className="text-xs text-gray-500 mt-0.5">Coaches: {[c1 && `${c1} (${g.team1})`, c2 && `${c2} (${g.team2})`].filter(Boolean).join(' · ')}</p>
  }
  const myWorkerId = portal?.worker?.id || ''
  const myName = (portal?.worker?.name || session?.user?.name || '').trim().toLowerCase()
  const sortKey = (g: Game) => `${g.date || ''}${g.startTime || ''}`
  const mineAll = assignments
    .filter(a => !a.game.isCanceled)
    .map(a => ({ ...a.game, role: a.role, payRate: a.payRate, crew: a.crew || [] }))
    .sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1)
  // Up next is the next game that hasn't finished (one in the last hour still counts as
  // on now), not the first game ever assigned -- that kept showing last weekend's game.
  const today = ymd(new Date()); const nowM = new Date().getHours() * 60 + new Date().getMinutes()
  const isAhead = (g: Game) => !!g.date && (g.date > today || (g.date === today && (minsOf(g.startTime) ?? 24 * 60) >= nowM - 60))
  const upcoming = mineAll.filter(isAhead)
  const past = mineAll.filter(g => !isAhead(g))
  const mine = showPast ? mineAll : upcoming
  const upNext = upcoming[0]
  const startsIn = (g: Game) => {
    if (g.date !== today) return ''
    const d = (minsOf(g.startTime) ?? 0) - nowM
    return d <= 0 ? 'On now' : d < 60 ? `Starts in ${d} min` : `Starts in ${Math.floor(d / 60)}h ${d % 60}m`
  }

  // All games: every official's name on each game, so a ref can find theirs.
  const ql = q.trim().toLowerCase()
  const crewOf = (g: Game) => (g.assignments || []).slice().sort((a, b) => slotOrder(a.role) - slotOrder(b.role))
  const allShown = allGames.filter(g => g.tournamentId === selTournament && !g.isCanceled).filter(g => !ql ||
    [g.team1, g.team2, g.location, g.division, g.gameNumber, coachOf(g, g.team1), coachOf(g, g.team2), ...crewOf(g).map(a => a.worker?.name || '')].some(x => String(x || '').toLowerCase().includes(ql)))
  const isMe = (a: { workerId: string; worker?: { name: string } }) => (myWorkerId && a.workerId === myWorkerId) || (!!myName && (a.worker?.name || '').trim().toLowerCase() === myName)

  const roleLabel = friendlyRole(punch?.worker?.defaultRole || portal?.worker?.defaultRole)

  const tel = (p: string) => p.replace(/[^\d+]/g, '')
  function MyGame({ g }: { g: any }) {
    const isScorekeeper = g.role === 'scorekeeper'
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 card">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
            <span className="font-bold text-gray-800 text-sm">{time12(g.startTime)}</span>
            <span>·</span><span className="truncate">{g.location || 'Field TBD'}</span>
            {g.gameNumber && <><span>·</span><span>#{g.gameNumber}</span></>}
          </div>
          {g.role && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{slotLabel(g.role)}</span>}
        </div>
        <p className="text-sm font-semibold text-gray-800">{g.team1} <span className="text-gray-400 font-normal">vs</span> {g.team2}</p>
        <p className="text-xs text-gray-400">{g.division}{g.payRate ? ' · $' + g.payRate : ''}</p>
        <Coaches g={g} />
        {g.crew?.length > 0 && (
          <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-1.5">
            {g.crew.slice().sort((a: Crew, b: Crew) => slotOrder(a.role) - slotOrder(b.role)).map((c: Crew) => (
              <div key={c.role} className="flex items-center gap-2 text-xs">
                <span className="text-gray-400 w-20 shrink-0">{slotLabel(c.role)}</span>
                <span className="font-semibold text-gray-700 flex-1 truncate">{c.name}</span>
                {c.phone && <>
                  <a href={`tel:${tel(c.phone)}`} aria-label={`Call ${c.name}`} className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-teal-700"><Phone size={13} /></a>
                  <a href={`sms:${tel(c.phone)}`} aria-label={`Text ${c.name}`} className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-teal-700"><MessageSquare size={13} /></a>
                </>}
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={() => checkIn(g.id)} aria-pressed={checkedIn.has(g.id)}
            className={`flex-1 py-2 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 ${checkedIn.has(g.id) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {checkedIn.has(g.id) ? <><CheckCircle2 size={15} /> Checked in</> : <><MapPin size={15} /> Check in</>}
          </button>
          {isScorekeeper && !g.isCanceled && (
            <a href={`/tournaments/${g.tournamentId}/games/${g.id}/scorekeeper`}
              className="flex-1 text-center py-2 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white">Open scorer →</a>
          )}
        </div>
      </div>
    )
  }

  function AnyGame({ g }: { g: Game }) {
    const mineHere = myGameIds.has(g.id)
    const crew = crewOf(g)
    return (
      <div className={`rounded-2xl border p-3.5 ${mineHere ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'} card`}>
        <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span className="min-w-0 truncate"><b className="text-gray-800">{time12(g.startTime)}</b> · {g.location || 'Field TBD'}{g.gameNumber ? ` · #${g.gameNumber}` : ''}</span>
          {mineHere && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-emerald-600 text-white px-2 py-0.5 rounded-full">You</span>}
        </div>
        <p className="text-sm font-semibold text-gray-800 mt-1">{g.team1} <span className="text-gray-400 font-normal">vs</span> {g.team2}</p>
        <p className="text-xs text-gray-400">{g.division}</p>
        <Coaches g={g} />
        <p className="text-xs mt-1.5 leading-relaxed">
          {crew.length === 0 ? <span className="text-gray-400">No officials yet</span> : crew.map((a, i) => (
            <span key={a.role}>{i > 0 && <span className="text-gray-300"> · </span>}
              <span className={isMe(a) ? 'font-bold text-emerald-800 bg-emerald-100 rounded px-1' : 'text-gray-600'}>{a.worker?.name || '—'}</span>
              <span className="text-gray-400"> {a.role === 'scorekeeper' ? '(SK)' : `(${a.role.replace(/\D/g, '') || ''})`}</span>
            </span>
          ))}
        </p>
      </div>
    )
  }

  // The availability to-do: events they work with a day still unanswered.
  const todoEvents = (portal?.events || []).filter(e => e.working && e.avail && e.avail.days.some(d => !d.state))
  const todoLeft = openDays(portal)

  return (
    <div className="max-w-md mx-auto">
      {/* Greeting */}
      <div className="mb-4">
        <p className="text-sm text-gray-400">{roleLabel}</p>
        <h1 className="text-2xl font-bold text-gray-800">Hi, {session?.user?.name?.split(' ')[0] || 'there'} 👋</h1>
      </div>

      {/* Availability to-do: until every day of every event they work has an answer */}
      {todoLeft > 0 && (
        <div data-avail className="mb-5 rounded-2xl p-4 text-white shadow-lg bg-gradient-to-br from-[#0B1F3A] to-[#0E7490]">
          <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wider text-teal-200"><Bell size={14} />TO DO</p>
          <p className="mt-1.5 text-lg font-extrabold leading-snug">Tell us which days you can work</p>
          <p className="mt-1 text-[13px] leading-snug text-slate-300">{todoEvents.map(e => e.name).join(' and ')} · {todoLeft} {todoLeft === 1 ? 'day still needs' : 'days still need'} an answer</p>
          <button type="button" onClick={() => jumpTo(todoEvents[0]?.id)} className="mt-3 inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#ffffff] text-[#0B1F3A] text-sm font-extrabold hover:bg-[#f1f5f9]">Answer now<ArrowRight size={16} /></button>
        </div>
      )}
      {todoLeft === 0 && allSet && (
        <div data-avail className="mb-5 rounded-2xl p-3.5 bg-teal-50 border border-teal-200 flex items-start gap-3">
          <CheckCircle2 size={24} className="text-teal-700 shrink-0" />
          <div>
            <p className="text-[15px] font-extrabold text-slate-900">You're all set</p>
            <p className="text-[13px] text-slate-600 leading-snug">The assigner can see your answers. You can change them any time before the event.</p>
          </div>
        </div>
      )}

      {/* Game-day alerts for this phone (field requests) */}
      <div className="mb-5"><StaffAlerts compact /></div>

      {/* Permission to text them, next to the push alerts because it is the same
          question to whoever is reading it. Renders nothing for an account with
          no staff record. */}
      <div className="mb-5"><SmsConsent compact /></div>

      {/* My events — sign up for the tournaments you can work */}
      {portal && portal.events.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">My events</p>
            <Link href="/dashboard/staff/id-card" className="text-xs font-semibold text-teal-700 hover:text-teal-900">My staff ID →</Link>
          </div>
          <div className="space-y-2">
            {portal.events.map(ev => (
              <div key={ev.id} id={`ev-${ev.id}`} className={`rounded-2xl border p-4 card scroll-mt-24 overflow-hidden ${ev.working ? 'border-emerald-300 bg-emerald-50/60' : 'border-gray-200 bg-white'} ${flash === ev.id ? 'ring-2 ring-teal-500 ring-offset-2' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{ev.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><CalendarDays size={12} /> {fmtRange(ev.startDate, ev.endDate)}{ev.location ? ` · ${ev.location}` : ''}</p>
                    {ev.working && ev.assignedGames > 0 && <p className="text-[11px] text-emerald-700 mt-1">{ev.assignedGames} game{ev.assignedGames === 1 ? '' : 's'} assigned</p>}
                  </div>
                  {ev.working ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full"><CheckCircle2 size={12} /> Working</span>
                  ) : (
                    <button onClick={() => setWorkingEvent(ev, true)} disabled={!!eventBusy || !portal.worker}
                      className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50">
                      Sign up to work
                    </button>
                  )}
                </div>
                {ev.working && portal.worker && ev.avail && ev.avail.days.length > 0 && (
                  <div className="mt-3 -mx-4 border-t border-emerald-200 bg-white">
                    <MyAvailability eventId={ev.id} days={ev.avail.days} onChange={d => updateAvail(ev.id, d)} />
                  </div>
                )}
                {ev.working && ev.assignedGames === 0 && (
                  <p className="mt-3 text-xs text-gray-400">Can't work this event at all? <button type="button" onClick={() => setWorkingEvent(ev, false)} disabled={!!eventBusy} className="font-semibold text-gray-600 underline hover:text-gray-800">Take me off it</button></p>
                )}
              </div>
            ))}
          </div>
          {!portal.worker && <p className="text-[11px] text-gray-400 mt-2">Your login isn't linked to a staff record yet — contact your coordinator to sign up for events.</p>}
        </div>
      )}

      {/* Training videos (Oct 2026): how-tos for this person's job, with progress */}
      {training && (() => {
        const want = videosFor(training.roles)
        const done = want.filter(v => training.watched.includes(v)).length
        const all = want.length > 0 && done === want.length
        return (
          <Link href="/dashboard/staff/training" className={`mb-5 flex items-center gap-3 rounded-2xl border p-4 card ${all ? 'border-slate-200 bg-white' : 'border-teal-200 bg-teal-50/60'}`}>
            <span className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0"><GraduationCap size={20} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-gray-800">Training videos</span>
              <span className="block text-xs text-gray-500 mt-0.5">{all ? `All ${want.length} watched` : `${done} of ${want.length} watched · about a minute each`}</span>
            </span>
            <ChevronRight size={18} className="text-gray-400 shrink-0" />
          </Link>
        )
      })()}

      {/* W-9: upload it here instead of emailing it (components/StaffW9Card) */}
      {portal?.worker && <StaffW9Card />}

      {/* Time clock — hourly staff (field ops & athletic trainers) */}
      {punch?.worker && (punch.worker.defaultRole === 'field_ops' || punch.worker.defaultRole === 'athletic_trainer') && (() => {
        const open = punch.open
        const todayHrs = (punch.entries || []).filter((e: any) => e.date === todayYMD()).reduce((s: number, e: any) => s + teHours(e), 0)
        return (
          <div className="rounded-2xl border border-gray-200 bg-white card p-4 mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5"><Clock size={14} className="text-teal-600" /> Time clock</span>
              {todayHrs > 0 && <span className="text-xs text-gray-500">{todayHrs.toFixed(2)}h today</span>}
            </div>
            {open ? (
              <>
                <p className="text-sm text-gray-600 mb-2">Clocked in at <span className="font-semibold text-gray-800">{open.clockIn}</span> · <span className="text-emerald-600 font-semibold">{elapsedLabel(open.clockIn)}</span></p>
                <button onClick={() => punchAction('out')} disabled={punchBusy} className="w-full py-3 rounded-xl text-base font-bold bg-red-600 hover:bg-red-500 text-white disabled:opacity-60 inline-flex items-center justify-center gap-2"><Square size={16} /> Clock Out</button>
              </>
            ) : (
              <button onClick={() => punchAction('in')} disabled={punchBusy} className="w-full py-3 rounded-xl text-base font-bold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60 inline-flex items-center justify-center gap-2"><Play size={16} /> Clock In</button>
            )}
          </div>
        )
      })()}

      {/* Game day tools */}
      {selTournament && (
        <div className="mb-5">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Game day</p>
          <div className="grid grid-cols-2 gap-2">
            {visibleTools.map(tool => {
              const Icon = tool.icon
              return (
                <Link key={tool.href} href={`/tournaments/${selTournament}/${tool.href}`} className="flex items-center gap-2 bg-white border border-gray-200 card rounded-2xl p-3 text-sm font-semibold text-gray-700 hover:border-teal-300"><Icon size={18} className="text-teal-600" /> {tool.label}</Link>
              )
            })}
          </div>
        </div>
      )}

      {/* Up next */}
      {upNext ? (
        <div className="rounded-2xl border border-gray-200 bg-white card p-4 mb-5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">● Up next</span>
            <span className="text-xs font-semibold text-emerald-700">{startsIn(upNext) || dayLabel(upNext.date)}</span>
          </div>
          <p className="text-base font-bold text-gray-800">{upNext.team1} vs {upNext.team2}</p>
          <p className="text-xs text-gray-500">{time12(upNext.startTime)} · {upNext.location || 'Field TBD'} · {slotLabel(upNext.role)}</p>
          <Coaches g={upNext} />
          <p className="text-xs text-gray-400 mb-3">{upNext.division}{upNext.crew?.length ? ` · with ${upNext.crew.map((c: Crew) => c.name.split(' ')[0]).join(', ')}` : ''}</p>
          <div className="flex gap-2">
            <button onClick={() => checkIn(upNext.id)} aria-pressed={checkedIn.has(upNext.id)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-1.5 ${checkedIn.has(upNext.id) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {checkedIn.has(upNext.id) ? <><CheckCircle2 size={15} /> Checked in</> : <><MapPin size={15} /> Check in</>}
            </button>
            {upNext.role === 'scorekeeper' && (
              <a href={`/tournaments/${upNext.tournamentId}/games/${upNext.id}/scorekeeper`}
                className="flex-1 text-center py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 text-white">Open scorer →</a>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white card p-5 mb-5 text-center text-sm text-gray-400">No upcoming games yet. Your assigner puts you on games; you'll see them here.</div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-white border border-gray-200 card rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-800">{assignments.length}</div>
          <div className="text-[11px] text-gray-500">Assignments</div>
        </div>
        <div className="bg-white border border-gray-200 card rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-gray-800">{assignments.filter(a => !a.game.isCanceled).length}</div>
          <div className="text-[11px] text-gray-500">Active</div>
        </div>
        <div className="bg-white border border-gray-200 card rounded-2xl p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600">${assignments.reduce((s, a) => s + (a.payRate || 0), 0).toFixed(0)}</div>
          <div className="text-[11px] text-gray-500">Pay</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setView('mine')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === 'mine' ? 'bg-emerald-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>
          My games ({upcoming.length})
        </button>
        <button onClick={() => setView('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === 'all' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-600'}`}>
          All games
        </button>
        {view === 'all' && tournaments.length > 1 && (
          <select value={selTournament} onChange={e => { setSelTournament(e.target.value); loadAllGames(e.target.value) }}
            className="ml-auto select border border-gray-300 rounded-lg px-2 py-1.5 text-xs max-w-[45%]">
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      {view === 'all' && (
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-3 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a name, team or field" aria-label="Find a name, team or field"
            className="w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 py-2.5 text-sm" />
          {myName && !q && <button type="button" onClick={() => setQ(portal?.worker?.name || session?.user?.name || '')} className="mt-1.5 text-xs font-semibold text-teal-700">Find my name</button>}
        </div>
      )}

      <div className="pb-8">
        {view === 'mine' ? (
          mine.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">No games yet.</div> :
          byDay(mine).map(([d, list]) => (
            <div key={d} className="mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{dayLabel(d)} · {list.length} game{list.length === 1 ? '' : 's'}</p>
              <div className="space-y-2">{list.map((g: any) => <MyGame key={g.id} g={g} />)}</div>
            </div>
          ))
        ) : (
          allShown.length === 0 ? <div className="text-center py-10 text-gray-400 text-sm">{q ? 'No games match.' : 'No games posted yet.'}</div> :
          byDay(allShown).map(([d, list]) => (
            <div key={d} className="mb-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{dayLabel(d)} · {list.length} game{list.length === 1 ? '' : 's'}</p>
              <div className="space-y-2">{list.map(g => <AnyGame key={g.id} g={g} />)}</div>
            </div>
          ))
        )}
        {view === 'mine' && past.length > 0 && (
          <button type="button" onClick={() => setShowPast(v => !v)} className="w-full text-center text-xs font-semibold text-gray-500 hover:text-gray-800 py-2">
            {showPast ? 'Hide past games' : `Show past games (${past.length})`}
          </button>
        )}
      </div>
    </div>
  )
}
