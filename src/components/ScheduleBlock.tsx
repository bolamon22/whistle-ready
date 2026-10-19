'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Clock, MapPin, ArrowRight } from 'lucide-react'
import { Game } from '@/lib/standings'
import { time12 } from '@/lib/time12'

function startMs(date: string, t: string): number | null {
  if (!date || !t) return null
  let str = t.trim().toUpperCase(); let ap: string | null = null
  if (str.endsWith('AM')) { ap = 'AM'; str = str.slice(0, -2).trim() } else if (str.endsWith('PM')) { ap = 'PM'; str = str.slice(0, -2).trim() }
  const p = str.split(':'); let h = parseInt(p[0]) || 0; const m = parseInt(p[1]) || 0
  if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0
  const dt = new Date(date + 'T00:00:00'); dt.setHours(h, m, 0, 0); return dt.getTime()
}
const fmtDay = (d: string) => { if (!d) return ''; const dt = new Date(d + 'T12:00:00'); return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) }

// Live "up next" schedule snippet — links to the full public schedule page.
export default function ScheduleBlock() {
  const params = useParams() as any
  const id = params?.id
  const [games, setGames] = useState<Game[] | null>(null)
  useEffect(() => {
    if (!id) return
    fetch(`/api/tournaments/${id}/games`).then(r => r.ok ? r.json() : []).then(g => setGames(Array.isArray(g) ? g : [])).catch(() => setGames([]))
  }, [id])

  if (games === null) return <p className="text-sm text-slate-400">Loading schedule…</p>
  const live = games.filter(g => !g.isCanceled)
  if (!live.length) return <p className="text-sm text-slate-500">The schedule hasn&apos;t been posted yet.</p>

  const upcoming = live.filter(g => g.score1 === null || g.score2 === null)
    .map(g => ({ g, ms: startMs(g.date, g.startTime) }))
    .filter(x => x.ms !== null)
    .sort((a, b) => (a.ms as number) - (b.ms as number))
  const now = Date.now()
  const fromNow = upcoming.filter(x => (x.ms as number) >= now - 3 * 3600 * 1000)
  const list = (fromNow.length ? fromNow : upcoming).slice(0, 6)

  return (
    <div>
      {list.length ? (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Up next</div>
          <div className="space-y-1.5">
            {list.map(({ g }) => (
              <div key={g.id} className="flex items-center gap-3 text-sm border border-slate-100 rounded-lg px-3 py-2">
                <div className="w-24 shrink-0">
                  <div className="font-medium text-slate-700">{fmtDay(g.date)}</div>
                  <div className="text-xs text-slate-400 inline-flex items-center gap-1"><Clock size={11} /> {time12(g.startTime)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-slate-800">{g.team1} <span className="text-slate-400">vs</span> {g.team2}</div>
                  <div className="text-xs text-slate-400 truncate">{g.division}{g.location ? ` · ${g.location}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-500">All games are complete — see final results.</p>
      )}
      <Link href={`/tournaments/${id}/public`} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-teal-700 hover:text-teal-900">Full schedule &amp; standings <ArrowRight size={14} /></Link>
    </div>
  )
}
