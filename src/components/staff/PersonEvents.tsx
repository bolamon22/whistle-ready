'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, Plus, X } from 'lucide-react'

// The events a Staff Pool person is working, in their profile on the Staff Pool and the
// Staff roster, with Add to an event and a way to take them off one (Bo, Oct 14 2026: "make
// it so this lists which tournaments they're doing ... I had to go to multiple spots to add
// someone"). Reads /api/workers/[id]/events; adds and removes through the roster route,
// the same calls the Staff roster makes.

type Ev = { id: string; name: string; startDate: string; endDate: string; games?: number; onRoster?: boolean }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Oct 24–25", "Oct 31–Nov 1", "Oct 24"; the year too when it isn't this year. */
export function eventDates(e: { startDate: string; endDate?: string }): string {
  const p = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null }
  const a = p(e.startDate), b = p(e.endDate || '') || a
  if (!a || !b) return ''
  const yr = a.y !== new Date().getFullYear() ? `, ${a.y}` : ''
  if (a.y === b.y && a.mo === b.mo && a.d === b.d) return `${MONTHS[a.mo]} ${a.d}${yr}`
  if (a.y === b.y && a.mo === b.mo) return `${MONTHS[a.mo]} ${a.d}–${b.d}${yr}`
  return `${MONTHS[a.mo]} ${a.d}–${MONTHS[b.mo]} ${b.d}${yr}`
}
const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export default function PersonEvents({ workerId, name, currentEventId, onChange }: {
  workerId: string
  name: string
  currentEventId?: string     // the Staff roster's own event, marked "this event"
  onChange?: () => void       // after an add or a removal, so the page can reload its list
}) {
  const [data, setData] = useState<{ events: Ev[]; canAdd: Ev[] } | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState('')
  const [showPast, setShowPast] = useState(false)
  const load = useCallback(() => {
    fetch(`/api/workers/${encodeURIComponent(workerId)}/events`)
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => setData({ events: Array.isArray(d.events) ? d.events : [], canAdd: Array.isArray(d.canAdd) ? d.canAdd : [] }))
      .catch(() => setFailed(true))
  }, [workerId])
  useEffect(() => { load() }, [load])
  if (failed) return null

  const first = name.trim().split(/\s+/)[0] || name
  const today = todayET()
  const ended = (e: Ev) => (e.endDate || e.startDate || '9999') < today
  const upcoming = data ? data.events.filter(e => !ended(e)) : []
  const past = data ? data.events.filter(ended).reverse() : []
  const games = (n?: number) => (n ? ` · ${n} game${n === 1 ? '' : 's'}` : '')

  async function add(id: string) {
    const t = data?.canAdd.find(x => x.id === id)
    if (!t) return
    setBusy(id)
    const r = await fetch(`/api/tournaments/${encodeURIComponent(id)}/roster`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workerId }),
    }).catch(() => null)
    setBusy('')
    if (!r?.ok) { const j = r ? await r.json().catch(() => null) : null; toast.error(j?.error || `Couldn’t add ${first} to ${t.name}`); return }
    toast.success(`Added ${first} to ${t.name}`)
    load(); onChange?.()
  }

  async function remove(e: Ev) {
    const onGames = e.games ? `\n\n${first} is on ${e.games} game${e.games === 1 ? '' : 's'} there. Those stay assigned until you change them on the schedule.` : ''
    if (!confirm(`Take ${name} off the ${e.name} staff roster?${onGames}`)) return
    setBusy(e.id)
    const r = await fetch(`/api/tournaments/${encodeURIComponent(e.id)}/roster?workerId=${encodeURIComponent(workerId)}`, { method: 'DELETE' }).catch(() => null)
    setBusy('')
    if (!r?.ok) { const j = r ? await r.json().catch(() => null) : null; toast.error(j?.error || `Couldn’t take ${first} off ${e.name}`); return }
    toast.success(`Took ${first} off ${e.name}`)
    load(); onChange?.()
  }

  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-400"><CalendarDays size={13} aria-hidden /> Events</p>
      {!data ? <p className="text-sm text-slate-400">Loading…</p> : (
        <>
          {upcoming.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {upcoming.map(e => (
                <span key={e.id} className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-white/10 bg-white/10 py-1.5 pl-3 pr-1.5 text-sm">
                  <Link href={`/tournaments/${e.id}/roster`} className="min-w-0 font-semibold text-white hover:underline">{e.name}</Link>
                  <span className="whitespace-nowrap text-xs text-slate-300">
                    {eventDates(e)}{games(e.games)}{e.id === currentEventId ? ' · this event' : ''}{e.onRoster ? '' : ' · not on the staff roster'}
                  </span>
                  {e.onRoster
                    ? <button type="button" onClick={() => remove(e)} disabled={!!busy} aria-label={`Take ${name} off ${e.name}`} title="Take off this event"
                        className="rounded p-0.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-50"><X size={14} aria-hidden /></button>
                    : <span className="w-1" />}
                </span>
              ))}
            </div>
          ) : <p className="text-sm text-slate-300">Not on an upcoming event yet.</p>}

          {data.canAdd.length > 0 && (
            <label className="mt-3 inline-flex max-w-full items-center gap-2">
              <Plus size={14} aria-hidden className="flex-shrink-0 text-teal-300" />
              <select value="" disabled={!!busy} onChange={ev => { if (ev.target.value) add(ev.target.value) }} aria-label={`Add ${name} to an event`}
                className="min-w-0 max-w-full rounded-lg border border-teal-400/40 bg-slate-800 px-2.5 py-1.5 text-sm text-teal-100 focus:outline-none focus:ring-2 focus:ring-teal-400 disabled:opacity-60">
                <option value="">{busy ? 'Saving…' : 'Add to an event…'}</option>
                {data.canAdd.map(t => <option key={t.id} value={t.id}>{t.name} · {eventDates(t)}</option>)}
              </select>
            </label>
          )}

          {past.length > 0 && (
            <div className="mt-3">
              <button type="button" onClick={() => setShowPast(v => !v)} aria-expanded={showPast} className="text-xs text-slate-400 hover:text-slate-200">
                {showPast ? 'Hide' : 'Show'} {past.length} past event{past.length === 1 ? '' : 's'}
              </button>
              {showPast && (
                <ul className="mt-1.5 space-y-1 text-sm text-slate-300">
                  {past.map(e => <li key={e.id}>{e.name} <span className="text-xs text-slate-400">{'·'} {eventDates(e)}{games(e.games)}</span></li>)}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
