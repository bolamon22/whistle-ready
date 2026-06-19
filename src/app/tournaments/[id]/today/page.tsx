'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Star, Clock, MapPin, Navigation, AlertTriangle, Megaphone, Map, ParkingCircle, Trophy, ListOrdered, Calendar, Phone, ChevronRight, CalendarDays } from 'lucide-react'
import { Game } from '@/lib/standings'

type T = { id: string; name: string; startDate: string; endDate: string; location: string; logoUrl: string }

function startMs(date: string, t: string): number | null {
  if (!date || !t) return null
  let str = t.trim().toUpperCase(); let ap: string | null = null
  if (str.endsWith('AM')) { ap = 'AM'; str = str.slice(0, -2).trim() } else if (str.endsWith('PM')) { ap = 'PM'; str = str.slice(0, -2).trim() }
  const p = str.split(':'); let h = parseInt(p[0]) || 0; const m = parseInt(p[1]) || 0
  if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0
  const dt = new Date(date + 'T00:00:00'); dt.setHours(h, m, 0, 0); return dt.getTime()
}
const fmtDay = (d: string) => { if (!d) return ''; const dt = new Date(d + 'T12:00:00'); return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }
function countdownLabel(ms: number | null, nowMs: number): string {
  if (ms === null) return ''
  const diff = ms - nowMs
  if (diff <= 0 && diff > -2.5 * 3600 * 1000) return 'Live now'
  if (diff <= 0) return ''
  const mins = Math.round(diff / 60000)
  if (mins < 60) return `in ${mins} min`
  const h = Math.floor(mins / 60), m = mins % 60
  if (h < 24) return `in ${h}h${m ? ` ${m}m` : ''}`
  const days = Math.round(h / 24)
  return `in ${days} day${days > 1 ? 's' : ''}`
}

export default function TodayPage() {
  const params = useParams() as any
  const id = params?.id
  const [t, setT] = useState<T | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [ann, setAnn] = useState<any | null>(null)
  const [follows, setFollows] = useState<string[]>([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(i) }, [])
  useEffect(() => {
    if (!id) return
    try { setFollows(JSON.parse(localStorage.getItem(`follows-${id}`) || '[]')) } catch { }
    fetch(`/api/tournaments/${id}`).then(r => r.ok ? r.json() : null).then(d => d && setT(d)).catch(() => { })
    fetch(`/api/tournaments/${id}/games`).then(r => r.ok ? r.json() : []).then(g => setGames(Array.isArray(g) ? g : [])).catch(() => { })
    fetch(`/api/tournaments/${id}/announcements`).then(r => r.ok ? r.json() : null).then(d => { if (d && Array.isArray(d.announcements) && d.announcements.length) setAnn(d.announcements[0]) }).catch(() => { })
  }, [id])

  const live = games.filter(g => !g.isCanceled)
  const upcoming = live.filter(g => g.score1 == null || g.score2 == null)
    .map(g => ({ g, ms: startMs(g.date, g.startTime) }))
    .filter(x => x.ms !== null)
    .sort((a, b) => (a.ms as number) - (b.ms as number))
  const mine = follows.length ? upcoming.filter(x => follows.includes(x.g.team1) || follows.includes(x.g.team2)) : []
  const queue = mine.length ? mine : upcoming
  const next = queue[0] || null
  const after = queue[1] || null
  const venueQuery = t?.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.location)}` : null

  const tiles = [
    { icon: <Map size={21} />, label: 'Field maps', href: `/tournaments/${id}/event#locations` },
    { icon: <ParkingCircle size={21} />, label: 'Parking', href: `/tournaments/${id}/event#locations` },
    { icon: <Trophy size={21} />, label: 'Scores', href: `/tournaments/${id}/public` },
    { icon: <ListOrdered size={21} />, label: 'Standings', href: `/tournaments/${id}/public` },
    { icon: <Navigation size={21} />, label: 'Directions', href: venueQuery || `/tournaments/${id}/event#locations` },
    { icon: <Phone size={21} />, label: 'Contacts', href: `/tournaments/${id}/event#contacts` },
  ]

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-md mx-auto">
        <div className="bg-[#0b1f3a] px-5 pt-6 pb-6 text-white">
          <div className="flex items-center justify-between mb-3">
            <span className="text-teal-300 text-[11px] font-semibold tracking-[0.12em]">GAME DAY</span>
            <span className="text-slate-300 text-xs inline-flex items-center gap-1"><CalendarDays size={13} /> {t ? fmtDay(t.startDate) : ''}</span>
          </div>
          <div className="flex items-center gap-3">
            {t?.logoUrl && <img src={t.logoUrl} alt="" className="w-11 h-11 rounded-lg object-contain bg-white/95 p-1" />}
            <h1 className="text-lg font-extrabold leading-tight">{t?.name || 'Loading…'}</h1>
          </div>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            {follows.length
              ? follows.map(f => (<span key={f} className="bg-white/10 text-teal-100 text-[11px] px-2.5 py-1 rounded-full inline-flex items-center gap-1"><Star size={11} /> {f}</span>))
              : <Link href={`/tournaments/${id}/public`} className="bg-white/10 text-slate-200 text-[11px] px-2.5 py-1 rounded-full inline-flex items-center gap-1"><Star size={11} /> Follow your teams on the schedule</Link>}
          </div>
        </div>

        <div className="p-3.5 space-y-3">
          {next ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-slate-400 text-[11px] font-semibold tracking-wide">{mine.length ? 'UP NEXT · YOUR TEAM' : 'NEXT GAME'}</span>
                {countdownLabel(next.ms, now) && <span className="bg-teal-50 text-teal-700 text-xs font-medium px-2.5 py-0.5 rounded-full">{countdownLabel(next.ms, now)}</span>}
              </div>
              <div className="text-[17px] font-bold text-slate-900">{next.g.team1} <span className="text-slate-400 font-normal">vs</span> {next.g.team2}</div>
              <div className="flex gap-3.5 mt-2 text-sm text-slate-600 flex-wrap">
                <span className="inline-flex items-center gap-1"><Clock size={14} /> {fmtDay(next.g.date)} · {next.g.startTime || 'TBD'}</span>
                {next.g.location && <span className="inline-flex items-center gap-1"><MapPin size={14} /> {next.g.location}</span>}
              </div>
              {next.g.division && <div className="text-xs text-slate-400 mt-0.5">{next.g.division}</div>}
              <Link href={`/tournaments/${id}/public`} className="mt-3 w-full bg-teal-600 hover:bg-teal-700 text-white rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5"><Calendar size={15} /> View full schedule</Link>
              {after && <div className="mt-2.5 pt-2.5 border-t border-slate-100 text-xs text-slate-500">Then {after.g.startTime}{after.g.location ? ` · ${after.g.location}` : ''} · {after.g.team1} vs {after.g.team2}</div>}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 text-sm text-slate-500">{live.length ? 'No upcoming games — the tournament may be complete.' : 'The schedule hasn’t been posted yet.'}</div>
          )}

          {ann && (
            <div className={`flex gap-2.5 items-start rounded-xl px-3 py-2.5 border ${ann.urgent ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
              {ann.urgent ? <AlertTriangle size={17} className="text-amber-600 mt-0.5 shrink-0" /> : <Megaphone size={16} className="text-teal-600 mt-0.5 shrink-0" />}
              <div className={`text-[12.5px] leading-snug ${ann.urgent ? 'text-amber-800' : 'text-slate-700'}`}>{ann.text}</div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map((tile, i) => (
              <Link key={i} href={tile.href} className="bg-white border border-slate-200 rounded-2xl py-3.5 flex flex-col items-center gap-1.5 text-slate-700 hover:bg-slate-50">
                <span className="text-teal-600">{tile.icon}</span>
                <span className="text-[11.5px]">{tile.label}</span>
              </Link>
            ))}
          </div>

          <div className="text-center pt-1 pb-5">
            <Link href={`/tournaments/${id}/event`} className="text-teal-700 text-[12.5px] font-semibold inline-flex items-center gap-1">View full event page <ChevronRight size={13} /></Link>
          </div>
        </div>
      </div>
    </div>
  )
}
