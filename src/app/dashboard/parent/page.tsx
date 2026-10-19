'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import toast, { Toaster } from 'react-hot-toast'
import { Bell, CalendarDays, Check, CheckCircle2, Circle, ExternalLink, Globe, Home, Map as MapIcon, MapPin, Navigation, PlayCircle, Trophy, UserPlus, Users } from 'lucide-react'
import ParentWaiverList, { type ParentWaiver } from '@/components/ParentWaiverList'
import FollowAlertsSheet from '@/components/FollowAlertsSheet'
import { teamRefKey } from '@/lib/names'
import { deviceId as getDeviceId } from '@/lib/pushClient'
import { DOMAIN_BY_SLUG } from '@/lib/orgDomains'
import { hasHowTo } from '@/lib/howToVideos'
import { time12 } from '@/lib/time12'

// The parent dashboard, redesigned for phones (Bo approved the mockup, Oct 13 2026:
// "Parent Dashboard Redesign" canvas). Four tabs along the bottom on a phone, along
// the top from sm up: Home (next game, live score, what's left, players, events),
// Schedule (the event's games with live scores, Follow for phone alerts), Players
// (their waivers, editable) and Events (upcoming events to open or follow).
//
// Follow here is the SAME follow as the public schedule's: device-keyed
// (lib/pushClient deviceId -> /api/tournaments/[id]/follows), so the phone gets the
// schedule, change and final alerts (lib/finalAlerts, lib/scheduleDigest). The
// account's own teams come from its waivers (keyed (division, team), never the name
// alone) and are always shown, followed or not.

interface Tournament { id: string; name: string; startDate: string; endDate?: string; logoUrl: string | null; location: string | null }
interface Game {
  id: string; gameNumber?: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean
}
interface PlayerReg { id: string; playerName: string; teamClubName: string; tournamentId: string }
type Live = { score1?: number; score2?: number; periodLabel?: string; live?: boolean; updatedAt?: string }
type Venue = { name: string; address: string; mapUrl: string; fieldMapUrl: string }
type EventInfo = { venues: Venue[]; orgSlug: string }
type FollowRef = { division: string; team: string }
type Tab = 'home' | 'schedule' | 'players' | 'events'

/** A team one of this parent's players is on, from the waivers in their account. */
type MyTeam = { key: string; tournamentId: string; eventName: string; eventDates: string; startDate: string; division: string; team: string; clubName: string; players: string[] }

const firstName = (n: string) => n.trim().split(/\s+/)[0] || n
const joinNames = (xs: string[]) => xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
/** Minutes since midnight from "9:40 AM" or "09:40" (games sort by this, never the clock text). */
const minutes = (time: string) => {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(String(time || '').trim())
  if (!m) return 0
  let h = Number(m[1]); const ap = (m[3] || '').toLowerCase()
  if (ap === 'pm' && h < 12) h += 12
  if (ap === 'am' && h === 12) h = 0
  return h * 60 + Number(m[2])
}
/** YYYY-MM-DD split by hand: new Date('2026-10-24') is UTC midnight and prints Friday in US zones. */
const localDate = (s: string) => { const [y, mo, d] = String(s || '').slice(0, 10).split('-').map(Number); return y && mo && d ? new Date(y, mo - 1, d) : null }
const dayLabel = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) => localDate(s)?.toLocaleDateString('en-US', opts) || s
const eventDates = (a: string, b?: string) => {
  const s = localDate(a); const e = localDate(b || '')
  if (!s) return ''
  const mo = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' })
  if (!e || e.getTime() === s.getTime()) return `${mo(s)} ${s.getDate()}`
  return mo(s) === mo(e) ? `${mo(s)} ${s.getDate()}–${e.getDate()}` : `${mo(s)} ${s.getDate()} – ${mo(e)} ${e.getDate()}`
}
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() }
const byTime = (a: Game, b: Game) => a.date !== b.date ? (a.date < b.date ? -1 : 1) : minutes(a.startTime) - minutes(b.startTime)
/** "Village Park, 11700 Pierson Rd, Wellington, FL 33414" -> "Wellington": the last part that isn't a state or ZIP. */
const cityOf = (loc: string | null) => {
  const parts = String(loc || '').split(',').map(x => x.trim()).filter(Boolean)
  while (parts.length > 1 && /^([A-Z]{2})?\s*(\d{5}(-\d{4})?)?$/.test(parts[parts.length - 1])) parts.pop()
  return parts[parts.length - 1] || ''
}
const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
const orgSite = (slug: string) => DOMAIN_BY_SLUG[slug] ? `https://${DOMAIN_BY_SLUG[slug]}` : `/o/${slug}`

function EventLogo({ t, size = 'w-12 h-12' }: { t: Pick<Tournament, 'name' | 'logoUrl'>; size?: string }) {
  return t.logoUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={t.logoUrl} alt="" className={`${size} object-contain rounded-xl border border-slate-200 bg-white shrink-0`} />
    : <span aria-hidden className={`${size} rounded-xl bg-teal-50 text-teal-700 font-bold flex items-center justify-center shrink-0`}>{(t.name || '?')[0]}</span>
}

export default function ParentDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [allTournaments, setAllTournaments] = useState<Tournament[]>([])
  const [followed, setFollowed] = useState<string[]>([])            // events followed from Events
  const [linkedPlayers, setLinkedPlayers] = useState<PlayerReg[]>([])
  const [waivers, setWaivers] = useState<ParentWaiver[]>([])
  const [games, setGames] = useState<Record<string, Game[]>>({})
  const [live, setLive] = useState<Record<string, Record<string, Live>>>({})
  const [info, setInfo] = useState<Record<string, EventInfo>>({})
  const [device, setDevice] = useState('')
  const [devFollows, setDevFollows] = useState<Record<string, FollowRef[]>>({})
  const [alertsOn, setAlertsOn] = useState<boolean | null>(null)
  const [askAlertsFor, setAskAlertsFor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('home')
  const [selTournament, setSelTournament] = useState('')
  const [selDay, setSelDay] = useState('')
  const [onlyMine, setOnlyMine] = useState(true)

  const loadEvent = useCallback(async (id: string, dev: string) => {
    if (!id) return
    const [g, ls, fo] = await Promise.all([
      fetch(`/api/tournaments/${id}/games?view=public`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/tournaments/${id}/live-scores`).then(r => r.ok ? r.json() : null).catch(() => null),
      dev ? fetch(`/api/tournaments/${id}/follows?device=${encodeURIComponent(dev)}`).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
    ])
    setGames(prev => ({ ...prev, [id]: Array.isArray(g) ? g : [] }))
    setLive(prev => ({ ...prev, [id]: ls?.scores && typeof ls.scores === 'object' ? ls.scores : {} }))
    if (fo && Array.isArray(fo.following)) setDevFollows(prev => ({ ...prev, [id]: fo.following.map((f: any) => ({ division: String(f.division || ''), team: String(f.team || '') })) }))
  }, [])

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    const dev = getDeviceId(); setDevice(dev)
    Promise.all([
      // The public event list (/find's): /api/tournaments lists nothing for logins with no org, i.e. every parent.
      fetch('/api/public/tournaments').then(r => r.ok ? r.json() : []).catch(() => []),
      fetch('/api/parent/follows').then(r => r.ok ? r.json() : null).catch(() => null) as Promise<{ tournaments?: string[]; players?: PlayerReg[] } | null>,
      fetch('/api/parent/waivers').then(r => r.ok ? r.json() : { waivers: [] }).catch(() => ({ waivers: [] })),
      dev ? fetch(`/api/follows/device?device=${encodeURIComponent(dev)}`).then(r => r.ok ? r.json() : null).catch(() => null) : Promise.resolve(null),
    ]).then(([t, f, w, dv]) => {
      const tours: Tournament[] = Array.isArray(t) ? t : []
      setAllTournaments(tours)
      const fol: string[] = Array.isArray(f?.tournaments) ? f.tournaments : []
      setFollowed(fol)
      setLinkedPlayers(Array.isArray(f?.players) ? f.players : [])
      const mine: ParentWaiver[] = Array.isArray(w?.waivers) ? w.waivers : []
      setWaivers(mine)
      setAlertsOn(!!dv?.enabled)
      // Old links: ?tab=teams|discover still land somewhere sensible.
      let asked = ''
      try { asked = new URLSearchParams(window.location.search).get('tab') || '' } catch {}
      const map: Record<string, Tab> = { home: 'home', schedule: 'schedule', teams: 'schedule', players: 'players', discover: 'events', events: 'events' }
      if (map[asked]) setTab(map[asked])
      // The soonest event one of their players is in, else the first one they follow.
      const today = todayIso()
      const upcomingMine = mine.filter(x => !x.past && x.tournamentId).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
      const first = upcomingMine[0]?.tournamentId || fol.find(id => tours.some(x => x.id === id && String(x.endDate || x.startDate || '').slice(0, 10) >= today)) || ''
      const ids = Array.from(new Set([...upcomingMine.map(x => x.tournamentId), ...fol])).filter(Boolean)
      if (ids.length) fetch(`/api/public/event-info?ids=${ids.map(encodeURIComponent).join(',')}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.events) setInfo(d.events) }).catch(() => {})
      if (first) { setSelTournament(first); loadEvent(first, dev) }
      setLoading(false)
    })
  }, [status, router, loadEvent])

  // Live scores move every 20-30s on game day; the rest of the page doesn't.
  useEffect(() => {
    if (!selTournament) return
    const tick = () => {
      if (document.visibilityState !== 'visible') return
      fetch(`/api/tournaments/${selTournament}/live-scores`).then(r => r.ok ? r.json() : null)
        .then(ls => { if (ls?.scores) setLive(prev => ({ ...prev, [selTournament]: ls.scores })) }).catch(() => {})
    }
    const h = setInterval(tick, 30000)
    return () => clearInterval(h)
  }, [selTournament])

  if (status === 'loading' || loading) return <div className="p-10 text-center text-slate-400">Loading…</div>

  // ---- Their teams, events and games ----
  const teamMap = new Map<string, MyTeam>()
  for (const w of waivers) {
    if (w.past || !w.tournamentId || !w.division || !w.team) continue
    const key = `${w.tournamentId}|${teamRefKey(w.division, w.team)}`
    const cur = teamMap.get(key)
    if (cur) { if (!cur.players.includes(w.playerName)) cur.players.push(w.playerName); continue }
    teamMap.set(key, { key, tournamentId: w.tournamentId, eventName: w.eventName, eventDates: w.eventDates, startDate: w.startDate, division: w.division, team: w.team, clubName: w.clubName, players: [w.playerName] })
  }
  const myTeams = Array.from(teamMap.values())
  const byId = new Map(allTournaments.map(t => [t.id, t]))
  const today = todayIso()
  const isUpcoming = (t: Tournament) => String(t.endDate || t.startDate || '').slice(0, 10) >= today
  const myEventIds = Array.from(new Set(myTeams.map(m => m.tournamentId)))
  const scheduleEvents: Tournament[] = []
  for (const id of Array.from(new Set([...myEventIds, ...followed]))) {
    const t = byId.get(id)
    if (t) { if (isUpcoming(t) || myEventIds.includes(id)) scheduleEvents.push(t); continue }
    const m = myTeams.find(x => x.tournamentId === id)
    if (m) scheduleEvents.push({ id, name: m.eventName, startDate: m.startDate, logoUrl: null, location: null })
  }
  scheduleEvents.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))

  const ev = byId.get(selTournament) || scheduleEvents.find(e => e.id === selTournament) || null
  const evInfo = info[selTournament]
  const orgSlug = evInfo?.orgSlug || Object.values(info).find(i => i.orgSlug)?.orgSlug || ''
  const mineHere = myTeams.filter(m => m.tournamentId === selTournament)
  const mineByKey = new Map(mineHere.map(m => [teamRefKey(m.division, m.team), m]))
  const whose = (g: Game) => mineByKey.get(teamRefKey(g.division, g.team1)) || mineByKey.get(teamRefKey(g.division, g.team2))
  const isMineTeam = (g: Game, team: string) => mineByKey.has(teamRefKey(g.division, team))
  const loaded = games[selTournament]
  const allGames = (loaded || []).filter(g => !g.isCanceled).sort(byTime)
  const myGames = allGames.filter(g => whose(g))
  const liveHere = live[selTournament] || {}
  const state = (g: Game): 'live' | 'final' | 'upcoming' => {
    const l = liveHere[g.id]
    if (l?.live) return 'live'
    return g.score1 !== null && g.score2 !== null ? 'final' : 'upcoming'
  }
  const scoreOf = (g: Game) => {
    const l = liveHere[g.id]
    if (l?.live) return [l.score1 ?? 0, l.score2 ?? 0] as const
    return [g.score1, g.score2] as const
  }
  const nowM = nowMinutes()
  const nextGame = myGames.find(g => state(g) === 'upcoming' && (g.date > today || (g.date === today && minutes(g.startTime) + 15 >= nowM)))
  const liveMine = myGames.filter(g => state(g) === 'live')
  const venueFor = (loc: string): Venue | null => {
    const vs = evInfo?.venues || []
    const l = String(loc || '').toLowerCase()
    return vs.find(v => v.name && l.startsWith(v.name.toLowerCase())) || vs[0] || null
  }
  const directionsFor = (loc: string) => {
    const v = venueFor(loc)
    if (v?.mapUrl) return v.mapUrl
    if (v?.address) return mapsUrl(v.address)
    return ev?.location ? mapsUrl(ev.location) : ''
  }
  const fieldMap = (evInfo?.venues || []).find(v => v.fieldMapUrl)?.fieldMapUrl || ''

  // ---- Follows (phone alerts) ----
  const followsHere = devFollows[selTournament] || []
  const isFollowed = (division: string, team: string) => followsHere.some(f => teamRefKey(f.division, f.team) === teamRefKey(division, team))
  const toggleFollow = async (division: string, team: string) => {
    const tid = selTournament
    const key = teamRefKey(division, team)
    const was = isFollowed(division, team)
    const firstEver = !was && Object.values(devFollows).every(l => !l.length)
    const without = (list: FollowRef[]) => list.filter(f => teamRefKey(f.division, f.team) !== key)
    setDevFollows(prev => ({ ...prev, [tid]: was ? without(prev[tid] || []) : [...without(prev[tid] || []), { division, team }] }))
    if (!device) return   // storage blocked: works for this visit only
    try {
      const r = await fetch(`/api/tournaments/${tid}/follows`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: device, division, teamName: team, follow: !was }) })
      const d = r.ok ? await r.json() : null
      if (d && Array.isArray(d.following)) setDevFollows(prev => ({ ...prev, [tid]: d.following.map((f: any) => ({ division: String(f.division || ''), team: String(f.team || '') })) }))
      else if (!r.ok) { setDevFollows(prev => ({ ...prev, [tid]: was ? [...without(prev[tid] || []), { division, team }] : without(prev[tid] || []) })); toast.error('That didn’t save. Try again.'); return }
      let asked = false; try { asked = localStorage.getItem('wr-alerts-asked') === '1' } catch {}
      if (firstEver && !asked && alertsOn !== true) setAskAlertsFor(team)
    } catch {
      setDevFollows(prev => ({ ...prev, [tid]: was ? [...without(prev[tid] || []), { division, team }] : without(prev[tid] || []) }))
    }
  }
  const closeAlertsAsk = (enabled: boolean) => {
    setAskAlertsFor(null)
    if (enabled) setAlertsOn(true)
    try { localStorage.setItem('wr-alerts-asked', '1') } catch {}
  }
  const allMineFollowed = mineHere.length > 0 && mineHere.every(m => isFollowed(m.division, m.team))

  const followEvent = async (id: string, on: boolean) => {
    await fetch('/api/parent/follows', { method: on ? 'POST' : 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'tournament', tournamentId: id }) }).catch(() => {})
    setFollowed(prev => on ? [...prev, id] : prev.filter(x => x !== id))
    toast.success(on ? 'Following. It’s on your Schedule now.' : 'Unfollowed.')
  }
  const openSchedule = (id: string) => {
    setSelTournament(id); setSelDay(''); setOnlyMine(true); setTab('schedule')
    if (!games[id]) loadEvent(id, device)
    if (!info[id]) fetch(`/api/public/event-info?ids=${encodeURIComponent(id)}`).then(r => r.ok ? r.json() : null).then(d => { if (d?.events) setInfo(prev => ({ ...prev, ...d.events })) }).catch(() => {})
  }

  // ---- Players ----
  const upcomingWaivers = waivers.filter(w => !w.past)
  const pastWaivers = waivers.filter(w => w.past)
  const playerTiles: { name: string; jersey: string; team: string }[] = []
  for (const w of upcomingWaivers) if (!playerTiles.some(p => p.name === w.playerName)) playerTiles.push({ name: w.playerName, jersey: String(w.fields?.jerseyNumber || ''), team: w.team })
  const playersAt = (id: string) => Array.from(new Set(waivers.filter(w => w.tournamentId === id).map(w => firstName(w.playerName))))
  const siblingEvents: { id: string; name: string }[] = []
  for (const w of upcomingWaivers) if (w.tournamentId && !siblingEvents.some(e => e.id === w.tournamentId)) siblingEvents.push({ id: w.tournamentId, name: w.eventName })
  const pastEvents: { id: string; name: string; dates: string; players: string[] }[] = []
  for (const w of pastWaivers) {
    const cur = pastEvents.find(e => e.id === w.tournamentId)
    if (cur) { if (!cur.players.includes(firstName(w.playerName))) cur.players.push(firstName(w.playerName)) } else pastEvents.push({ id: w.tournamentId, name: w.eventName, dates: w.eventDates, players: [firstName(w.playerName)] })
  }

  const upcoming = allTournaments.filter(isUpcoming).sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')))
  const nextUpId = scheduleEvents.find(isUpcoming)?.id || ''

  // ---- Header ----
  const fullName = String(session?.user?.name || '').trim()
  const parts = fullName.split(/\s+/).filter(Boolean)
  const familyTitle = parts.length > 1 ? `${parts[parts.length - 1]} family` : (fullName || 'My account')
  const initials = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '?'
  const segLogo = orgSlug === 'sunshine-events-group' ? '/org-icons/sunshine-events-group/icon-512.png' : ''

  const days = Array.from(new Set(allGames.map(g => g.date))).sort()
  const day = days.includes(selDay) ? selDay : (days.includes(today) ? today : days[0] || '')
  const showingMine = onlyMine && mineHere.length > 0
  const shown = (showingMine ? myGames : allGames).filter(g => !day || g.date === day)

  const TABS: [Tab, string, typeof Home][] = [['home', 'Home', Home], ['schedule', 'Schedule', CalendarDays], ['players', 'Players', Users], ['events', 'Events', Trophy]]
  const card = 'bg-white border border-slate-200 rounded-2xl'

  const gameCard = (g: Game) => {
    const st = state(g); const [s1, s2] = scoreOf(g); const m = whose(g)
    const badge = st === 'live' ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700">Live{liveHere[g.id]?.periodLabel ? ` · ${liveHere[g.id]?.periodLabel}` : ''}</span>
      : st === 'final' ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Final</span>
      : nextGame?.id === g.id ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">Next up</span> : null
    return (
      <div key={g.id} data-testid="parent-game" className={`bg-white border rounded-2xl p-3.5 flex gap-3 items-start ${m ? 'border-teal-200' : 'border-slate-200'}`}>
        <div className="w-[76px] shrink-0">
          <div className="text-[15px] font-bold text-slate-900 whitespace-nowrap">{time12(g.startTime)}</div>
          <div className="text-xs text-slate-500 leading-snug">{String(g.location || '').replace(/^.*?(Field\s*\S+)$/i, '$1')}</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-[15px]">
            <span className={`truncate ${isMineTeam(g, g.team1) ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{g.team1}</span><span className="font-extrabold text-slate-900">{s1 ?? ''}</span>
            <span className={`truncate ${isMineTeam(g, g.team2) ? 'font-bold text-slate-900' : 'text-slate-700'}`}>{g.team2}</span><span className="font-extrabold text-slate-900">{s2 ?? ''}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            {badge}
            <span className="text-xs text-slate-500">{g.division}</span>
            {m && <span className="text-xs font-bold text-teal-700">{m.players.map(firstName).join(' & ')}</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-xl -mx-3 -mt-3 pb-28 sm:mx-auto sm:mt-0 sm:pb-10" data-testid="parent-dashboard">
      <Toaster />
      {askAlertsFor && device && <FollowAlertsSheet team={askAlertsFor} deviceId={device} onDone={closeAlertsAsk} />}

      <header className="flex items-center gap-3 px-4 pt-4 pb-3 bg-white border-b border-slate-200 sm:rounded-2xl sm:border sm:mt-4">
        {segLogo && (
          <a href={orgSite(orgSlug)} aria-label="Sunshine Events Group website" className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={segLogo} alt="Sunshine Events Group" className="h-9 w-auto" />
          </a>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold tracking-[0.08em] text-slate-400">PARENT</div>
          <h1 className="text-[17px] font-extrabold text-slate-900 truncate">{familyTitle}</h1>
        </div>
        <a href="/profile" aria-label="Your account" className="w-11 h-11 rounded-full border border-slate-200 bg-teal-50 text-teal-700 font-bold text-sm flex items-center justify-center shrink-0">{initials}</a>
      </header>

      {/* Tabs: a bottom bar on a phone, a row on top from sm up. */}
      <nav aria-label="Parent dashboard" className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 grid grid-cols-4 px-1 pt-1.5 pb-[max(14px,env(safe-area-inset-bottom))] sm:static sm:z-auto sm:mt-4 sm:rounded-2xl sm:border sm:pb-1.5">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} type="button" onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined}
            className={`min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 text-[11px] sm:text-sm ${tab === key ? 'font-bold text-teal-700' : 'font-semibold text-slate-500 hover:text-slate-800'}`}>
            <Icon size={22} className="sm:w-4 sm:h-4" strokeWidth={2} />{label}
          </button>
        ))}
      </nav>

      <main className="px-4 pt-4 space-y-4">
        {/* ================= HOME ================= */}
        {tab === 'home' && (
          <>
            {!waivers.length && !scheduleEvents.length && (
              <section className={`${card} p-5`}>
                <h2 className="font-bold text-slate-900">Welcome!</h2>
                <p className="text-sm text-slate-600 mt-1 leading-relaxed">When you fill out a player waiver, create a password at the end. Your player, their team and their games show up here. You can also follow any event.</p>
                <button type="button" onClick={() => setTab('events')} className="mt-3 text-sm font-bold text-teal-700">See upcoming events →</button>
              </section>
            )}

            {ev && (nextGame ? (
              <section aria-label="Next game" className="rounded-2xl p-5 text-white space-y-3.5 bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a]" data-testid="next-game">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-[0.08em] text-teal-200">NEXT GAME · {dayLabel(nextGame.date).toUpperCase()}</span>
                  {whose(nextGame) && <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-400/15 border border-teal-300/40 text-teal-100">{whose(nextGame)!.players.map(p => firstName(p)).join(' & ')}</span>}
                </div>
                <div className="text-4xl font-extrabold tracking-tight">{time12(nextGame.startTime)}</div>
                <div className="text-xl font-bold leading-snug">{nextGame.team1} <span className="text-teal-200 font-medium">vs</span> {nextGame.team2}</div>
                <div className="flex items-center gap-1.5 text-sm text-teal-100"><MapPin size={16} aria-hidden /> {nextGame.location || ev.location}</div>
                <div className="flex gap-2.5 flex-wrap">
                  {directionsFor(nextGame.location) && (
                    <a href={directionsFor(nextGame.location)} target="_blank" rel="noopener" className="flex-1 basis-36 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-full bg-white text-[#0b1f3a] font-bold text-[15px]"><Navigation size={18} aria-hidden /> Directions</a>
                  )}
                  <button type="button" onClick={() => openSchedule(selTournament)} className="flex-1 basis-36 inline-flex items-center justify-center min-h-[44px] rounded-full border border-white/50 text-white font-bold text-[15px]">Full schedule</button>
                </div>
              </section>
            ) : (
              <section aria-label="Next event" className="rounded-2xl p-5 text-white space-y-3 bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a]">
                <span className="text-[11px] font-bold tracking-[0.08em] text-teal-200">{loaded && myGames.length ? 'ALL DONE FOR NOW' : 'UP NEXT'}</span>
                <div className="flex items-center gap-3">
                  <EventLogo t={ev} />
                  <div className="min-w-0">
                    <div className="text-xl font-bold leading-snug">{ev.name}</div>
                    <div className="text-sm text-teal-100">{[eventDates(ev.startDate, ev.endDate), ev.location].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
                <p className="text-sm text-teal-100">{loaded && myGames.length ? 'No more games on the schedule for your teams.' : 'The schedule isn’t posted yet. Follow your teams and we’ll alert your phone when it is.'}</p>
                <div className="flex gap-2.5 flex-wrap">
                  {ev.location && <a href={mapsUrl(ev.location)} target="_blank" rel="noopener" className="flex-1 basis-36 inline-flex items-center justify-center gap-2 min-h-[44px] rounded-full bg-white text-[#0b1f3a] font-bold text-[15px]"><Navigation size={18} aria-hidden /> Directions</a>}
                  <button type="button" onClick={() => openSchedule(selTournament)} className="flex-1 basis-36 inline-flex items-center justify-center min-h-[44px] rounded-full border border-white/50 text-white font-bold text-[15px]">Schedule</button>
                </div>
              </section>
            ))}

            {liveMine.map(g => {
              const [s1, s2] = scoreOf(g); const m = whose(g); const l = liveHere[g.id]
              return (
                <section key={g.id} aria-label="Live now" className={`${card} p-4 space-y-2.5`} data-testid="live-now">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden />
                    <span className="text-[11px] font-bold tracking-[0.08em] text-slate-600">LIVE NOW{l?.periodLabel ? ` · ${String(l.periodLabel).toUpperCase()}` : ''}</span>
                    <span className="ml-auto text-xs text-slate-400">{String(g.location || '').replace(/^.*?(Field\s*\S+)$/i, '$1')}</span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-1 items-center">
                    <div className={`text-base truncate ${isMineTeam(g, g.team1) ? 'font-bold' : 'text-slate-600'}`}>{g.team1}</div><div className="text-2xl font-extrabold">{s1}</div>
                    <div className={`text-base truncate ${isMineTeam(g, g.team2) ? 'font-bold' : 'text-slate-600'}`}>{g.team2}</div><div className="text-2xl font-extrabold">{s2}</div>
                  </div>
                  {m && <div className="text-[13px] text-slate-600">{m.players.map(firstName).join(' & ')} · {g.division}</div>}
                </section>
              )
            })}

            {ev && mineHere.length > 0 && (
              <section aria-label="Before game day" className={`${card} p-4 space-y-3`}>
                <h2 className="text-[17px] font-bold text-slate-900">Before game day</h2>
                {Array.from(new Set(mineHere.flatMap(m => m.players))).map(p => (
                  <div key={p} className="flex items-center gap-2.5 text-[15px] text-slate-800"><CheckCircle2 size={20} className="text-teal-600 shrink-0" aria-hidden /> {firstName(p)}&rsquo;s waiver is on file</div>
                ))}
                <div className="flex items-center gap-2.5 text-[15px] text-slate-800">
                  {allMineFollowed && alertsOn ? <CheckCircle2 size={20} className="text-teal-600 shrink-0" aria-hidden /> : <Circle size={20} className="text-slate-400 shrink-0" aria-hidden />}
                  <span className="flex-1">Phone alerts for your teams</span>
                  {!(allMineFollowed && alertsOn) && <button type="button" onClick={() => openSchedule(selTournament)} className="text-sm font-bold text-teal-700">Turn on</button>}
                </div>
              </section>
            )}

            {playerTiles.length > 0 && (
              <section aria-label="Your players" className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-[17px] font-bold text-slate-900">Your players</h2>
                  <button type="button" onClick={() => setTab('players')} className="text-sm font-semibold text-teal-700">See all</button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {playerTiles.map(p => (
                    <button key={p.name} type="button" onClick={() => setTab('players')} className={`${card} p-3.5 text-left flex flex-col gap-1.5`}>
                      <span className="w-10 h-10 rounded-full bg-[#0b1f3a] text-white font-bold flex items-center justify-center">{p.jersey || firstName(p.name)[0]}</span>
                      <span className="font-bold text-[15px] text-slate-900">{firstName(p.name)}</span>
                      <span className="text-[13px] text-slate-600 truncate">{p.team}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {upcoming.length > 0 && (
              <section aria-label="Upcoming events" className={`${card} p-4 divide-y divide-slate-200`}>
                {upcoming.slice(0, 3).map(t => {
                  const mine = scheduleEvents.some(e => e.id === t.id)
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 py-3 first:pt-0 last:pb-0">
                      <EventLogo t={t} size="w-10 h-10" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[15px] text-slate-900 truncate">{t.name}</div>
                        <div className="text-[13px] text-slate-600">{[eventDates(t.startDate, t.endDate), cityOf(t.location)].filter(Boolean).join(' · ')}</div>
                      </div>
                      {t.id === nextUpId
                        ? <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 whitespace-nowrap">Next up</span>
                        : <button type="button" onClick={() => mine ? openSchedule(t.id) : setTab('events')} className="text-sm font-bold text-teal-700 whitespace-nowrap">{mine ? 'Schedule' : 'Details'}</button>}
                    </div>
                  )
                })}
              </section>
            )}

            {orgSlug && (
              <section aria-label="More" className="grid grid-cols-2 gap-2.5">
                <a href={orgSite(orgSlug)} className={`${card} min-h-[48px] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-900`}><Globe size={16} aria-hidden /> Our website</a>
                {hasHowTo(orgSlug)
                  ? <a href={`${orgSite(orgSlug)}/how-to`} className={`${card} min-h-[48px] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-900`}><PlayCircle size={16} aria-hidden /> How-to videos</a>
                  : <button type="button" onClick={() => setTab('events')} className={`${card} min-h-[48px] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-900`}><Trophy size={16} aria-hidden /> All events</button>}
              </section>
            )}
          </>
        )}

        {/* ================= SCHEDULE ================= */}
        {tab === 'schedule' && (
          <div data-testid="parent-schedule" className="space-y-4">
            {!ev ? (
              <div className={`${card} p-6 text-center text-slate-500`}>
                <CalendarDays size={32} className="mx-auto mb-2 text-slate-300" aria-hidden />
                <p>No events here yet.</p>
                <p className="text-xs mt-1 leading-relaxed">Your player&rsquo;s events show up once their waiver is in your account. You can also follow any event.</p>
                <button type="button" onClick={() => setTab('events')} className="mt-3 text-teal-700 font-semibold text-sm">See upcoming events →</button>
              </div>
            ) : (
              <>
                <section className={`${card} p-4 space-y-3`}>
                  <div className="flex items-center gap-3">
                    <EventLogo t={ev} size="w-14 h-14" />
                    <div className="min-w-0 flex-1">
                      <h2 className="text-xl font-extrabold text-slate-900 leading-tight">{ev.name}</h2>
                      <div className="text-[13px] text-slate-600">{[eventDates(ev.startDate, ev.endDate), ev.location].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  {scheduleEvents.length > 1 && (
                    <div className="flex gap-2 flex-wrap">
                      {scheduleEvents.map(t => (
                        <button key={t.id} type="button" onClick={() => openSchedule(t.id)} aria-pressed={t.id === selTournament}
                          className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${t.id === selTournament ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{t.name}</button>
                      ))}
                    </div>
                  )}
                  {days.length > 1 && (
                    <div className="flex gap-2 flex-wrap" role="group" aria-label="Day">
                      {days.map(d => (
                        <button key={d} type="button" onClick={() => setSelDay(d)} aria-pressed={d === day}
                          className={`text-sm font-semibold px-3.5 py-1.5 rounded-full border ${d === day ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600'}`}>{dayLabel(d)}</button>
                      ))}
                    </div>
                  )}
                  {mineHere.length > 0 && (
                    <div role="group" aria-label="Which games" className="grid grid-cols-2 bg-slate-100 rounded-full p-1">
                      {([[true, 'My teams'], [false, 'All games']] as const).map(([v, label]) => (
                        <button key={label} type="button" onClick={() => setOnlyMine(v)} aria-pressed={showingMine === v}
                          className={`min-h-[40px] rounded-full text-sm font-bold ${showingMine === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{label}</button>
                      ))}
                    </div>
                  )}
                </section>

                {mineHere.length > 0 && (
                  <section aria-label="Alerts for your teams" className={`${card} p-4 space-y-2.5`}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold tracking-[0.08em] text-slate-600 flex-1">ALERTS FOR YOUR TEAMS</span>
                      {alertsOn
                        ? <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full inline-flex items-center gap-1"><Bell size={12} aria-hidden /> Alerts on</span>
                        : device && followsHere.length > 0 && <button type="button" onClick={() => setAskAlertsFor(followsHere[0].team)} className="text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full inline-flex items-center gap-1"><Bell size={12} aria-hidden /> Turn on alerts</button>}
                    </div>
                    {mineHere.map(m => {
                      const on = isFollowed(m.division, m.team)
                      return (
                        <div key={m.key} className="flex items-center gap-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-[15px] text-slate-900 truncate">{m.team}</div>
                            <div className="text-[13px] text-slate-600">{m.players.map(firstName).join(' & ')} · {m.division}</div>
                          </div>
                          <button type="button" onClick={() => toggleFollow(m.division, m.team)} aria-pressed={on}
                            className={`min-h-[40px] px-4 rounded-full text-sm font-bold border inline-flex items-center gap-1.5 ${on ? 'bg-teal-50 border-teal-200 text-teal-700' : 'bg-teal-600 border-teal-600 text-white'}`}>
                            {on ? <><Check size={14} aria-hidden /> Following</> : 'Follow'}
                          </button>
                        </div>
                      )
                    })}
                    <p className="text-xs text-slate-600">Get a phone alert when the schedule posts, a game moves, or a game goes final.</p>
                  </section>
                )}

                <section aria-label="Games" className="space-y-2.5">
                  {!loaded && <div className="text-center py-8 text-slate-400">Loading games…</div>}
                  {loaded && allGames.length === 0 && <div className={`${card} p-6 text-center text-slate-500`}>No games posted for this event yet.</div>}
                  {loaded && showingMine && allGames.length > 0 && myGames.length === 0 && (
                    <div className={`${card} p-6 text-center text-slate-500`}>
                      None of the posted games list your team yet.
                      <button type="button" onClick={() => setOnlyMine(false)} className="block mx-auto mt-2 text-teal-700 font-semibold text-sm">Show all games</button>
                    </div>
                  )}
                  {shown.map(gameCard)}
                </section>

                {(fieldMap || directionsFor('')) && (
                  <div className="grid grid-cols-2 gap-2.5">
                    {directionsFor('') && <a href={directionsFor('')} target="_blank" rel="noopener" className={`${card} min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-900`}><MapPin size={16} aria-hidden /> Directions</a>}
                    {fieldMap
                      ? <a href={fieldMap} target="_blank" rel="noopener" className={`${card} min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-900`}><MapIcon size={16} aria-hidden /> Field map</a>
                      : <a href={`/tournaments/${selTournament}/event`} className={`${card} min-h-[44px] flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-900`}><ExternalLink size={16} aria-hidden /> Event info</a>}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ================= PLAYERS ================= */}
        {tab === 'players' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">My players</h2>
              <p className="text-sm text-slate-600 mt-1">Fix a jersey number, phone or emergency contact any time before the event.</p>
            </div>
            {waivers.length === 0 && linkedPlayers.length === 0 ? (
              <div className={`${card} p-6 text-center text-slate-500`}>
                <Users size={32} className="mx-auto mb-2 text-slate-300" aria-hidden />
                <p>No players in your account yet.</p>
                <p className="text-xs mt-1 leading-relaxed">When you fill out a player waiver, create a password at the end. Your player shows up here, and you can update their details any time.</p>
              </div>
            ) : (
              <>
                {upcomingWaivers.length > 0 && <ParentWaiverList waivers={upcomingWaivers} onChange={next => setWaivers([...next, ...pastWaivers])} />}
                {siblingEvents.length > 0 && (
                  <section className="rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50 p-4 space-y-2.5" data-testid="add-sibling">
                    <h3 className="text-[17px] font-bold text-slate-900 flex items-center gap-2"><UserPlus size={18} className="text-teal-700" aria-hidden /> Signing up a brother or sister?</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">Their waiver opens with your family&rsquo;s details already filled in. Just add the player.</p>
                    <div className="flex flex-wrap gap-2">
                      {siblingEvents.map(e => (
                        <a key={e.id} href={`/tournaments/${e.id}/player-waiver?sibling=1`} className="inline-flex items-center min-h-[40px] px-4 rounded-full bg-teal-600 text-white text-sm font-bold">{siblingEvents.length > 1 ? e.name : 'Add a player'}</a>
                      ))}
                    </div>
                  </section>
                )}
                {pastEvents.length > 0 && (
                  <section aria-label="Past events" className="space-y-2">
                    <h3 className="text-[13px] font-bold tracking-[0.08em] text-slate-600">PAST EVENTS</h3>
                    {pastEvents.map(e => (
                      <div key={e.id} className={`${card} px-4 py-3`}>
                        <div className="font-semibold text-[15px] text-slate-900">{e.name}</div>
                        <div className="text-[13px] text-slate-600">{[joinNames(e.players), e.dates].filter(Boolean).join(' · ')}</div>
                      </div>
                    ))}
                  </section>
                )}
                {linkedPlayers.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-[13px] font-bold tracking-[0.08em] text-slate-600">LINKED REGISTRATIONS</h3>
                    {linkedPlayers.map(p => (
                      <div key={p.id} className={`${card} px-4 py-3`}>
                        <div className="font-semibold text-slate-900">{p.playerName}</div>
                        <div className="text-xs text-slate-500">{p.teamClubName}</div>
                      </div>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>
        )}

        {/* ================= EVENTS ================= */}
        {tab === 'events' && (
          <div data-testid="parent-discover" className="space-y-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-900">Events</h2>
              <p className="text-sm text-slate-600 mt-1">Tournaments coming up. Follow one to see its schedule here.</p>
            </div>
            {upcoming.length === 0 && <div className={`${card} p-6 text-center text-slate-500`}>No upcoming events listed yet.</div>}
            {upcoming.map(t => {
              const players = playersAt(t.id)
              const mine = players.length > 0
              const isFol = followed.includes(t.id)
              return (
                <article key={t.id} className={`bg-white border rounded-2xl p-4 space-y-3 ${t.id === nextUpId ? 'border-teal-200' : 'border-slate-200'}`}>
                  <div className="flex items-start gap-2.5">
                    <EventLogo t={t} />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-bold text-slate-900 leading-snug">{t.name}</h3>
                      <div className="text-[13px] text-slate-600">{[eventDates(t.startDate, t.endDate), t.location].filter(Boolean).join(' · ')}</div>
                    </div>
                    {t.id === nextUpId && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 whitespace-nowrap">Next up</span>}
                  </div>
                  {mine && <div className="text-sm font-semibold text-teal-700">{joinNames(players)} {players.length > 1 ? 'are' : 'is'} playing</div>}
                  <div className="grid grid-cols-2 gap-2">
                    {mine || isFol
                      ? <button type="button" onClick={() => openSchedule(t.id)} className="min-h-[44px] rounded-full bg-teal-600 text-white font-bold text-sm">Schedule</button>
                      : <button type="button" onClick={() => followEvent(t.id, true)} className="min-h-[44px] rounded-full bg-teal-50 border border-teal-200 text-teal-700 font-bold text-sm">Follow</button>}
                    <a href={`/tournaments/${t.id}/event`} className="min-h-[44px] rounded-full border border-slate-300 text-slate-900 font-bold text-sm flex items-center justify-center">Event info</a>
                  </div>
                  {isFol && !mine && <button type="button" onClick={() => followEvent(t.id, false)} className="text-xs text-slate-500 hover:text-slate-800">Unfollow</button>}
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
