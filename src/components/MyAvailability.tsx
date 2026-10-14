'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { eventDayList } from '@/lib/eventDays'
import { formatTime } from '@/lib/utils'

// "Set my availability" for one event, on the staff home page (Oct 13 2026). Staff
// logins can't open the director's Unavailability grid, so the old link went nowhere.
// Everyone is available by default; a day is either all day, out all day, or out for
// some game times. Same storage as that grid (api/availability: [] = out all day,
// ['08:00', ...] = out at those start times, no record = available), and the API only
// lets a staff login change their own days.

type Ev = { id: string; startDate: string; endDate: string }
const dayLabel = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, 12).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }

export default function MyAvailability({ ev, workerId }: { ev: Ev; workerId: string }) {
  const [out, setOut] = useState<Record<string, string[] | undefined>>({})
  const [times, setTimes] = useState<Record<string, string[]>>({})
  const [part, setPart] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/availability?tournamentId=${encodeURIComponent(ev.id)}`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/tournaments/${encodeURIComponent(ev.id)}/games`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([a, g]) => {
      const o: Record<string, string[]> = {}
      for (const r of Array.isArray(a) ? a : []) if (r.workerId === workerId) { try { o[r.date] = JSON.parse(r.timeSlots) } catch {} }
      const t: Record<string, Set<string>> = {}
      for (const x of Array.isArray(g) ? g : []) if (x.date && x.startTime && !x.isCanceled) (t[x.date] ||= new Set()).add(x.startTime)
      setOut(o); setTimes(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Array.from(v).sort()])))
      setPart(Object.fromEntries(Object.entries(o).filter(([, v]) => v && v.length > 0).map(([k]) => [k, true])))
      setReady(true)
    })
  }, [ev.id, workerId])

  async function save(date: string, slots: string[] | null) {
    setBusy(date)
    const res = slots === null
      ? await fetch(`/api/availability?workerId=${encodeURIComponent(workerId)}&tournamentId=${encodeURIComponent(ev.id)}&date=${date}`, { method: 'DELETE' }).catch(() => null)
      : await fetch('/api/availability', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workerId, tournamentId: ev.id, date, timeSlots: slots }) }).catch(() => null)
    setBusy('')
    if (!res?.ok) { toast.error('Could not save. Try again.'); return false }
    setOut(o => ({ ...o, [date]: slots === null ? undefined : slots }))
    return true
  }
  async function pick(date: string, mode: 'all' | 'out' | 'part') {
    if (mode === 'part') { setPart(p => ({ ...p, [date]: true })); return }
    setPart(p => ({ ...p, [date]: false }))
    if (await save(date, mode === 'out' ? [] : null)) toast.success(mode === 'out' ? `Marked out for ${dayLabel(date)}` : `Available all day ${dayLabel(date)}`)
  }
  async function toggleTime(date: string, time: string) {
    const cur = out[date] && out[date]!.length > 0 ? out[date]! : []
    const next = cur.includes(time) ? cur.filter(x => x !== time) : [...cur, time].sort()
    await save(date, next.length ? next : null)
  }

  const days = eventDayList(ev)
  if (!ready) return <p className="text-xs text-gray-400 mt-3">Loading your days…</p>
  return (
    <div className="mt-3 space-y-2.5">
      <p className="text-[11px] text-gray-500">You&apos;re available all day unless you say otherwise. Changes save right away.</p>
      {days.map(d => {
        const o = out[d]; const isOut = Array.isArray(o) && o.length === 0; const isPart = !!part[d] && !isOut
        const mode = isOut ? 'out' : isPart ? 'part' : 'all'
        const seg = (m: 'all' | 'out' | 'part', label: string) => (
          <button type="button" onClick={() => pick(d, m)} disabled={busy === d} aria-pressed={mode === m}
            className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg ${mode === m ? (m === 'out' ? 'bg-rose-600 text-white' : m === 'part' ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white') : 'text-gray-600'}`}>{label}</button>
        )
        return (
          <div key={d} className="rounded-xl bg-white border border-gray-200 p-2.5">
            <p className="text-sm font-bold text-gray-800 mb-1.5">{dayLabel(d)}</p>
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">{seg('all', 'All day')}{seg('part', 'Part of day')}{seg('out', "Can't work")}</div>
            {isPart && (
              (times[d] || []).length ? (
                <div className="mt-2">
                  <p className="text-[11px] text-gray-500 mb-1">Tap the game times you can&apos;t work:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(times[d] || []).map(t => { const off = (o || []).includes(t); return (
                      <button key={t} type="button" onClick={() => toggleTime(d, t)} disabled={busy === d} aria-pressed={off}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${off ? 'bg-rose-50 border-rose-300 text-rose-700 line-through' : 'bg-white border-gray-300 text-gray-700'}`}>{formatTime(t)}</button>
                    ) })}
                  </div>
                </div>
              ) : <p className="text-[11px] text-gray-500 mt-2">Game times aren&apos;t posted for this day yet. Check back once the schedule is out.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
