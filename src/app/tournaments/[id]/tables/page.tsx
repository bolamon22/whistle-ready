'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import EventBackLink from '@/components/EventBackLink'
import { ClipboardList, Phone, MessageSquare, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'

// Score tables (Bo, Oct 14 2026): which tables have their scorekeeper, from the Check in
// button on the staff app. For the field director walking the park: an empty table
// coming up shows red with the scorekeeper's phone, so it's a call or a text.
// Data: api/tournaments/[id]/tables.

type G = { id: string; gameNumber: string; date: string; startTime: string; location: string; division: string; team1: string; team2: string
  scorekeeper: { name: string; phone: string; checkedInAt: string | null } | null }

const toMin = (t: string) => { const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(t || ''); if (!m) return 0; let h = Number(m[1]) % 12; if ((m[3] || '').toLowerCase() === 'pm') h += 12; else if (!m[3]) h = Number(m[1]); return h * 60 + Number(m[2]) }
const time12 = (t: string) => { const v = toMin(t); const h = Math.floor(v / 60); return `${h % 12 || 12}:${String(v % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const tel = (p: string) => p.replace(/[^\d+]/g, '')
const field = (loc: string) => (loc.split(' - ').pop() || loc).trim()
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export default function ScoreTablesPage() {
  const { id } = useParams()
  const tid = Array.isArray(id) ? id[0] : String(id)
  const [games, setGames] = useState<G[]>([])
  const [dates, setDates] = useState<string[]>([])
  const [day, setDay] = useState('')
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [err, setErr] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [, tick] = useState(0)

  function load() {
    fetch(`/api/tournaments/${encodeURIComponent(tid)}/tables`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Could not load the score tables'); return }
      setGames(d.games || []); setDates(d.dates || [])
      setDay(cur => cur || ((d.dates || []).includes(todayISO()) ? todayISO() : (d.dates || [])[0] || ''))
      setErr('')
    }).catch(() => setErr('Could not load the score tables')).finally(() => setLoaded(true))
  }
  useEffect(() => { load(); const a = setInterval(load, 60000); const b = setInterval(() => tick(n => n + 1), 30000); return () => { clearInterval(a); clearInterval(b) } }, [tid])

  const isToday = day === todayISO()
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const state = (g: G): 'in' | 'none' | 'late' | 'soon' | 'later' | 'past' => {
    if (!g.scorekeeper) return 'none'
    if (g.scorekeeper.checkedInAt) return 'in'
    if (!isToday) return 'later'
    const s = toMin(g.startTime)
    if (nowMin > s + 60) return 'past'
    if (nowMin >= s - 10) return 'late'
    if (nowMin >= s - 30) return 'soon'
    return 'later'
  }
  const dayGames = games.filter(g => g.date === day).sort((a, b) => toMin(a.startTime) - toMin(b.startTime) || a.location.localeCompare(b.location, undefined, { numeric: true }))
  const problem = (g: G) => ['none', 'late', 'soon'].includes(state(g))
  const shown = onlyProblems ? dayGames.filter(problem) : dayGames
  const slots = Array.from(new Set(shown.map(g => g.startTime)))
  const counts = { in: dayGames.filter(g => state(g) === 'in').length, none: dayGames.filter(g => state(g) === 'none').length, late: dayGames.filter(g => state(g) === 'late').length }

  const pill = (g: G) => {
    const s = state(g)
    if (s === 'in') return <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><CheckCircle2 size={12} /> In {new Date(g.scorekeeper!.checkedInAt!).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
    if (s === 'none') return <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">No scorekeeper</span>
    if (s === 'late') return <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">Not in yet</span>
    if (s === 'soon') return <span className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Not in yet</span>
    return <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">{s === 'past' ? 'Didn’t check in' : 'Not in yet'}</span>
  }

  return (
    <div className="max-w-2xl mx-auto">
      <EventBackLink id={tid} />
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={22} className="text-teal-600" /> Score tables</h1>
        <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 px-2 py-1"><RefreshCw size={14} /> Refresh</button>
      </div>
      <p className="text-sm text-slate-500 mb-4">Who&apos;s at each table, from the Check in button on their staff app. Red means a game is about to start without its scorekeeper: call or text them, or send a sub.</p>

      {err && <p className="text-sm text-red-600 mb-3">{err}</p>}
      {loaded && !err && dates.length === 0 && <p className="text-sm text-slate-400">No games have a time and field yet.</p>}

      {dates.length > 0 && (
        <>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-3">
            {dates.map(d => <button key={d} type="button" onClick={() => setDay(d)} className={`flex-1 py-1.5 rounded-lg text-sm font-semibold ${d === day ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'}`}>{dayLabel(d)}</button>)}
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-center"><p className="text-xl font-extrabold text-emerald-700">{counts.in}</p><p className="text-[11px] text-slate-500">checked in</p></div>
            <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-center"><p className={`text-xl font-extrabold ${counts.late ? 'text-red-600' : 'text-slate-700'}`}>{counts.late}</p><p className="text-[11px] text-slate-500">starting, not in</p></div>
            <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-center"><p className={`text-xl font-extrabold ${counts.none ? 'text-red-600' : 'text-slate-700'}`}>{counts.none}</p><p className="text-[11px] text-slate-500">no scorekeeper</p></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 mb-3"><input type="checkbox" checked={onlyProblems} onChange={e => setOnlyProblems(e.target.checked)} /> Only tables that need someone</label>

          {shown.length === 0 && <p className="text-sm text-slate-400">{onlyProblems ? 'Every table is covered right now.' : 'No games this day.'}</p>}
          <div className="space-y-4">
            {slots.map(t => (
              <section key={t}>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5">{time12(t)}</h2>
                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {shown.filter(g => g.startTime === t).map(g => {
                    const s = state(g)
                    return (
                      <div key={g.id} className={`flex items-center gap-3 px-3 py-2.5 ${s === 'late' || s === 'none' ? 'bg-red-50/60' : ''}`}>
                        <div className="w-16 shrink-0 text-sm font-bold text-slate-800">{field(g.location)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">{g.scorekeeper?.name || '—'}</p>
                          <p className="text-[11px] text-slate-500 truncate">#{g.gameNumber} · {g.team1} vs {g.team2}</p>
                          <div className="mt-1">{pill(g)}</div>
                        </div>
                        {g.scorekeeper?.phone && s !== 'in' && <>
                          <a href={`tel:${tel(g.scorekeeper.phone)}`} aria-label={`Call ${g.scorekeeper.name}`} className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-teal-50"><Phone size={15} /></a>
                          <a href={`sms:${tel(g.scorekeeper.phone)}`} aria-label={`Text ${g.scorekeeper.name}`} className="p-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-teal-50"><MessageSquare size={15} /></a>
                        </>}
                        {s === 'none' && <AlertTriangle size={16} className="text-red-500 shrink-0" />}
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
