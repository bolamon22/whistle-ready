'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, MapPin, Navigation, Trophy, Zap, Search } from 'lucide-react'
import { time12, dayDate } from '@/lib/time12'

interface Game {
  id: string; gameNumber: string; date: string; startTime: string
  division: string; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean
}
interface CoachTeam {
  tournamentId: string; tournamentName: string; startDate: string; endDate: string
  location: string; logoUrl: string; clubName: string; teamName: string; division: string
}
interface CoachProfile { tournamentId: string; teamName: string }

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const keyOf = (t: { tournamentId: string; teamName: string }) => `${t.tournamentId}|${t.teamName}`
// "Village Park Athletics Complex - Field 1" → the venue, for a maps search.
const venueOf = (loc: string) => String(loc || '').split(/\s+-\s+/)[0].trim()

// The coach's home (rebuilt Oct 23 2026 for phones on game day). It finds the
// coach's teams by their email (api/coach/teams) instead of asking them to pick a
// tournament and team, which a coach login could never load. Opens on the next
// game with directions, then the team's games by day with scores.
export default function CoachDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [teams, setTeams] = useState<CoachTeam[]>([])
  const [active, setActive] = useState<{ tournamentId: string; teamName: string } | null>(null)
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/coach/profile').then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/coach/teams').then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([p, t]: [CoachProfile | null, CoachTeam[]]) => {
      const today = ymd(new Date())
      const list = (Array.isArray(t) ? t : []).slice().sort((a, b) => {
        const aUp = (a.endDate || a.startDate) >= today, bUp = (b.endDate || b.startDate) >= today
        if (aUp !== bUp) return aUp ? -1 : 1
        return aUp ? a.startDate.localeCompare(b.startDate) : b.startDate.localeCompare(a.startDate)
      })
      setTeams(list)
      // Their next event's team first; a saved choice wins only while it is still one of theirs.
      const saved = p && p.tournamentId ? list.find(x => keyOf(x) === keyOf(p)) : undefined
      const pick = saved || list[0] || (p && p.tournamentId ? { tournamentId: p.tournamentId, teamName: p.teamName } : null)
      setActive(pick ? { tournamentId: pick.tournamentId, teamName: pick.teamName } : null)
      setLoading(false)
    })
  }, [status])

  useEffect(() => {
    if (!active) { setGames([]); return }
    fetch(`/api/tournaments/${active.tournamentId}/games?view=public`)
      .then(r => (r.ok ? r.json() : []))
      .then((all: Game[]) => setGames((Array.isArray(all) ? all : []).filter(g => !g.isCanceled && (g.team1 === active.teamName || g.team2 === active.teamName))))
      .catch(() => setGames([]))
  }, [active?.tournamentId, active?.teamName])

  const choose = (t: CoachTeam) => {
    setActive({ tournamentId: t.tournamentId, teamName: t.teamName })
    fetch('/api/coach/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: t.tournamentId, teamName: t.teamName }) }).catch(() => {})
  }

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  if (!active) return (
    <div className="max-w-md mx-auto py-10">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center">
        <h1 className="text-xl font-bold text-gray-800 mb-2">Hi, Coach {session?.user?.name?.split(' ')[0] || ''}</h1>
        <p className="text-gray-500 text-sm">We couldn't find a team with <b className="text-gray-700">{session?.user?.email}</b> as its coach. Ask your club director to list you as the coach with this email, and your team's games show up here.</p>
        <Link href="/find" className="mt-5 inline-flex items-center justify-center gap-2 w-full h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold"><Search size={18} /> Find your team's schedule</Link>
      </div>
    </div>
  )

  const info = teams.find(x => keyOf(x) === keyOf(active))
  const today = ymd(new Date()); const nowM = new Date().getHours() * 60 + new Date().getMinutes()
  const mins = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : 0 }
  const sorted = games.slice().sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))
  const side = (g: Game) => {
    const me1 = g.team1 === active.teamName
    const my = me1 ? g.score1 : g.score2, opp = me1 ? g.score2 : g.score1
    const has = my !== null && my !== undefined && opp !== null && opp !== undefined
    return { opponent: me1 ? g.team2 : g.team1, my, opp, has, won: has && my! > opp!, lost: has && my! < opp! }
  }
  const next = sorted.find(g => !side(g).has && (g.date > today || (g.date === today && mins(g.startTime) >= nowM - 60)))
  const wins = sorted.filter(g => side(g).won).length, losses = sorted.filter(g => side(g).lost).length
  const days: [string, Game[]][] = []
  for (const g of sorted) { const d = days.find(x => x[0] === g.date); d ? d[1].push(g) : days.push([g.date, [g]]) }
  const base = `/tournaments/${active.tournamentId}`
  const startsIn = (g: Game) => {
    if (g.date !== today) return dayDate(g.date)
    const d = mins(g.startTime) - nowM
    return d <= 0 ? 'On now' : d < 60 ? `In ${d} min` : `In ${Math.floor(d / 60)}h ${d % 60}m`
  }

  return (
    <div className="max-w-md mx-auto pb-10">
      <div className="mb-4">
        <p className="text-sm text-gray-400">Coach</p>
        <h1 className="text-2xl font-bold text-gray-800 leading-tight">{active.teamName}</h1>
        <p className="text-sm text-gray-500">{[info?.division, info?.tournamentName].filter(Boolean).join(' · ')}</p>
      </div>

      {teams.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
          {teams.map(t => {
            const on = keyOf(t) === keyOf(active)
            return (
              <button key={keyOf(t)} type="button" onClick={() => choose(t)} aria-pressed={on}
                className={`shrink-0 h-9 px-3.5 rounded-full text-sm font-semibold border ${on ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}>
                {t.teamName}<span className={`ml-1.5 font-normal ${on ? 'text-slate-300' : 'text-slate-400'}`}>{dayDate(t.startDate)}</span>
              </button>
            )
          })}
        </div>
      )}

      {next ? (
        <div className="rounded-2xl border-2 border-teal-600 bg-white p-4 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold tracking-wider uppercase text-teal-700">Next game</span>
            <span className="text-xs font-bold text-teal-700">{startsIn(next)}</span>
          </div>
          <p className="mt-1 text-lg font-extrabold text-gray-900 leading-snug">vs {side(next).opponent}</p>
          <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin size={14} className="shrink-0" /> {time12(next.startTime)} · {next.location || 'Field TBD'}</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueOf(next.location) || info?.location || '')}`} target="_blank" rel="noreferrer"
              className="h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-[15px] inline-flex items-center justify-center gap-2"><Navigation size={17} /> Directions</a>
            <Link href={`${base}/today`} className="h-12 rounded-xl bg-teal-50 border border-teal-200 text-teal-800 font-bold text-[15px] inline-flex items-center justify-center gap-2"><Zap size={17} /> Game day hub</Link>
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-5 mb-4 text-center text-sm text-gray-500">Your games show here once the schedule is posted.</div>
      ) : null}

      <div className="grid grid-cols-3 gap-2 mb-5">
        <Link href={`${base}/public`} className="h-[76px] rounded-2xl bg-white border border-gray-200 flex flex-col items-center justify-center gap-1.5 text-[13px] font-bold text-gray-800"><CalendarDays size={20} className="text-teal-600" /> Full schedule</Link>
        <Link href={`${base}/public`} className="h-[76px] rounded-2xl bg-white border border-gray-200 flex flex-col items-center justify-center gap-1.5 text-[13px] font-bold text-gray-800"><Trophy size={20} className="text-teal-600" /> Standings</Link>
        <div className="h-[76px] rounded-2xl bg-white border border-gray-200 flex flex-col items-center justify-center text-[13px] text-gray-500"><b className="text-xl text-gray-900 tabular-nums">{wins}–{losses}</b>Record</div>
      </div>

      {days.map(([d, list]) => (
        <div key={d} className="mb-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{dayDate(d)} · {list.length} game{list.length === 1 ? '' : 's'}</p>
          <div className="space-y-2">
            {list.map(g => {
              const s = side(g)
              return (
                <div key={g.id} className={`bg-white border rounded-xl px-4 py-3 ${s.won ? 'border-green-200' : s.lost ? 'border-red-200' : g.id === next?.id ? 'border-teal-300' : 'border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800 tabular-nums">{time12(g.startTime)}</span>
                    <span className="text-xs text-gray-400 truncate flex-1">{g.location}</span>
                    {s.has
                      ? <span className={`text-base font-extrabold tabular-nums ${s.won ? 'text-green-600' : s.lost ? 'text-red-600' : 'text-gray-600'}`}>{s.my}–{s.opp}</span>
                      : g.id === next?.id ? <span className="text-[11px] font-bold text-teal-800 bg-teal-100 rounded-full px-2 py-0.5">Next</span> : null}
                  </div>
                  <p className="font-semibold text-gray-800 mt-0.5">vs {s.opponent}</p>
                  <p className="text-xs text-gray-400">{g.division} · Game #{g.gameNumber}</p>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
