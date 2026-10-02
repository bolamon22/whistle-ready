'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Trophy, LayoutGrid, Settings, Globe, Search, ChevronDown, ChevronRight } from 'lucide-react'

interface Tournament {
  id: string; name: string; startDate: string; endDate?: string; location?: string; logoUrl: string
  _count: { games: number; placedGames?: number }
}

type Filter = 'upcoming' | 'past' | 'all'

// Local calendar day as YYYY-MM-DD, matching how tournament dates are stored.
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const noon = (d: string) => new Date(d + 'T12:00:00')
const fmtDay = (d: string) => noon(d).toLocaleDateString([], { month: 'short', day: 'numeric' })
const daysBetween = (a: string, b: string) => Math.round((noon(b).getTime() - noon(a).getTime()) / 86400000)

// "Oct 24–25" when both days share a month, "Dec 19–Jan 2" otherwise, and the year
// only when it isn't this one (next summer's events read as "May 22–23, 2027").
function fmtRange(start: string, end?: string) {
  const s = noon(start), e = end ? noon(end) : s
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  const range = !end || end === start ? fmtDay(start) : sameMonth ? `${fmtDay(start)}–${e.getDate()}` : `${fmtDay(start)}–${fmtDay(end)}`
  return s.getFullYear() === new Date().getFullYear() ? range : `${range}, ${s.getFullYear()}`
}

// Where the event sits relative to today: how soon, or how long ago.
function when(t: Tournament, today: string): { text: string; tone: 'live' | 'soon' | 'later' | 'past' } {
  const end = t.endDate || t.startDate
  if (t.startDate <= today && end >= today) return { text: 'Happening now', tone: 'live' }
  const d = daysBetween(today, t.startDate)
  if (d > 0) return { text: d === 1 ? 'Tomorrow' : d < 14 ? `In ${d} days` : d < 60 ? `In ${Math.round(d / 7)} weeks` : `In ${Math.round(d / 30)} months`, tone: d <= 30 ? 'soon' : 'later' }
  const ago = -daysBetween(today, end)
  return { text: ago === 0 ? 'Ended today' : ago < 14 ? `${ago} days ago` : ago < 60 ? `${Math.round(ago / 7)} weeks ago` : `${Math.round(ago / 30)} months ago`, tone: 'past' }
}

const TONE = {
  live:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  soon:  'bg-amber-50 text-amber-700 border-amber-200',
  later: 'bg-slate-50 text-slate-500 border-slate-200',
  past:  'bg-slate-50 text-slate-400 border-slate-200',
}

const actionsFor = (id: string) => [
  { href: `/tournaments/${id}/scheduler`, Icon: Calendar,   label: 'Schedule' },
  { href: `/tournaments/${id}/divisions`, Icon: Trophy,     label: 'Divisions' },
  { href: `/tournaments/${id}/dashboard`, Icon: LayoutGrid, label: 'Manage' },
  // Setup, not Field Req: field requests sit with game-day ops, which the
  // scheduler role does not open (Oct 2026 permissions).
  { href: `/tournaments/${id}/builder`,   Icon: Settings,   label: 'Setup' },
]

function Logo({ t, size }: { t: Tournament; size: 'lg' | 'sm' }) {
  const cls = size === 'lg' ? 'w-14 h-14 rounded-2xl text-lg' : 'w-9 h-9 rounded-lg text-sm'
  return t.logoUrl
    ? <img src={t.logoUrl} alt="" className={`${cls} object-contain border border-slate-100 bg-white flex-shrink-0`} />
    : <div className={`${cls} bg-teal-50 text-teal-700 font-bold flex items-center justify-center flex-shrink-0`}>{t.name?.[0] || 'T'}</div>
}

// "198 games · 11 placed" with a thin bar; "No games yet" before the schedule exists.
function Progress({ t, wide }: { t: Tournament; wide?: boolean }) {
  const total = t._count?.games ?? 0, placed = t._count?.placedGames ?? 0
  if (!total) return <span className="text-xs text-slate-400">No games yet</span>
  const pct = Math.round(placed / total * 100)
  const done = placed >= total
  return (
    <div className={`flex items-center gap-2 ${wide ? '' : 'min-w-0'}`} title={`${placed} of ${total} games have a time and field`}>
      <span className={`text-xs whitespace-nowrap ${done ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>{total} games · {done ? 'all placed' : `${placed} placed`}</span>
      <span className={`${wide ? 'w-40' : 'w-16'} h-1.5 rounded-full bg-slate-100 overflow-hidden flex-shrink-0`}>
        <span className={`block h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

export default function SchedulerDashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [q, setQ] = useState('')
  const [pastOpen, setPastOpen] = useState(false)
  const today = todayKey()

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return }
    if (status !== 'authenticated') return
    fetch('/api/tournaments').then(r => r.json()).then(d => { setTournaments(Array.isArray(d) ? d : []); setLoading(false) })
  }, [status])

  // Soonest first for what's ahead, most recent first for what's done. Anything
  // still running today counts as upcoming, so a live weekend stays on top.
  const { upcoming, past } = useMemo(() => {
    const ql = q.trim().toLowerCase()
    const list = ql ? tournaments.filter(t => t.name.toLowerCase().includes(ql)) : tournaments
    const up = list.filter(t => (t.endDate || t.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))
    const pa = list.filter(t => (t.endDate || t.startDate) < today).sort((a, b) => b.startDate.localeCompare(a.startDate))
    return { upcoming: up, past: pa }
  }, [tournaments, q, today])

  if (status === 'loading' || loading) return <div className="p-10 text-center text-gray-400">Loading…</div>

  const next = filter !== 'past' && !q ? upcoming[0] : null
  const rest = filter === 'past' ? [] : upcoming.filter(t => t !== next)
  const showPast = filter !== 'upcoming' || q
  const pastList = showPast ? past : []

  const pastExpanded = pastOpen || filter === 'past' || !!q

  // plain render function, not a nested component: a nested component is a new type
  // every render and remounts its rows on each keystroke in the search box
  const row = (t: Tournament) => {
    const w = when(t, today)
    return (
      <div key={t.id} className="group flex items-center gap-3 px-3 py-2.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all">
        <Logo t={t} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <Link href={`/tournaments/${t.id}/dashboard`} className="font-semibold text-sm text-slate-800 hover:text-teal-700 truncate">{t.name}</Link>
            <span className={`hidden sm:inline text-[10px] font-semibold px-1.5 py-px rounded-full border whitespace-nowrap ${TONE[w.tone]}`}>{w.text}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 min-w-0">
            <span className="whitespace-nowrap">{fmtRange(t.startDate, t.endDate)}</span>
            <span className="text-slate-300">·</span>
            <Progress t={t} />
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {actionsFor(t.id).map(a => (
            <Link key={a.label} href={a.href} title={a.label}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <a.Icon size={14} className="text-teal-600" /><span className="hidden md:inline">{a.label}</span>
            </Link>
          ))}
          <Link href={`/tournaments/${t.id}/public`} title="Public view" className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-slate-100"><Globe size={14} /></Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <p className="text-sm text-slate-400">Scheduler</p>
          <h1 className="text-2xl font-bold text-slate-800">Hi, {session?.user?.name?.split(' ')[0] || 'there'}</h1>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a tournament" aria-label="Find a tournament"
              className="pl-8 pr-3 py-1.5 text-sm w-48 rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500" />
          </label>
          <div className="inline-flex p-0.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold">
            {(['upcoming', 'past', 'all'] as Filter[]).map(f => (
              <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f}
                className={`px-2.5 py-1 rounded-md capitalize ${filter === f ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>{f}</button>
            ))}
          </div>
        </div>
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-20 text-slate-400">No tournaments yet.</div>
      ) : upcoming.length + pastList.length === 0 ? (
        <div className="text-center py-20 text-slate-400">{q ? `Nothing matches “${q}”.` : filter === 'upcoming' ? 'Nothing coming up.' : 'Nothing here.'}</div>
      ) : (
        <div className="space-y-6">
          {next && (() => {
            const w = when(next, today)
            return (
              <section>
                <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Up next</h2>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start gap-4">
                    <Logo t={next} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/tournaments/${next.id}/dashboard`} className="text-lg font-bold text-slate-900 hover:text-teal-700 truncate">{next.name}</Link>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TONE[w.tone]}`}>{w.text}</span>
                      </div>
                      <p className="text-sm text-slate-500 mt-0.5">{fmtRange(next.startDate, next.endDate)}{next.location ? ` · ${next.location}` : ''}</p>
                      <div className="mt-2"><Progress t={next} wide /></div>
                    </div>
                    <Link href={`/tournaments/${next.id}/public`} title="Public view" className="text-slate-400 hover:text-teal-600 flex-shrink-0"><Globe size={16} /></Link>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {actionsFor(next.id).map((a, i) => (
                      <Link key={a.label} href={a.href}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${i === 0 ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                        <a.Icon size={16} className={i === 0 ? 'text-white' : 'text-teal-600'} />{a.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            )
          })()}

          {rest.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{next ? 'Coming up' : 'Upcoming'} <span className="font-medium text-slate-300">{rest.length}</span></h2>
              <div className="space-y-2">{rest.map(row)}</div>
            </section>
          )}

          {pastList.length > 0 && (
            <section>
              <button onClick={() => setPastOpen(o => !o)} className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 hover:text-slate-600" aria-expanded={pastExpanded}>
                {pastExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Past <span className="font-medium text-slate-300">{pastList.length}</span>
              </button>
              {pastExpanded && <div className="space-y-2">{pastList.map(row)}</div>}
            </section>
          )}

          {filter === 'upcoming' && !q && past.length > 0 && (
            <button onClick={() => setFilter('all')} className="text-xs text-slate-400 hover:text-teal-700">Show {past.length} past tournament{past.length === 1 ? '' : 's'}</button>
          )}
        </div>
      )}
    </div>
  )
}
