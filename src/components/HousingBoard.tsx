'use client'

// The hotel-booking board — one component, two doors: the housing company's
// magic-link page (/housing/[code], no login) and the org side (/staff/housing).
// Rows are TeamRegistration records; each club can hold SEVERAL bookings (clubs
// book through the housing company's site and often split across hotels — Bo),
// and every booking lands in the same totals the /tournaments/[id]/travel grant
// report prints.

import { useEffect, useMemo, useState, useCallback } from 'react'

type Booking = { id: string; hotel: string; rooms: number; nights: number }
type Club = {
  regId: string; clubName: string; clubContact: string; contactEmail: string; contactPhone: string
  clubBasedIn: string; numTeams: number; status: string
  bookings: Booking[]; roomNights: number; notes: string
}
type Ev = { id: string; name: string; startDate: string; endDate: string; location: string; clubs: Club[] }

export const HOUSING_STATUS_META: Record<string, { label: string; text: string; bg: string; border: string }> = {
  needs: { label: 'Needs hotels', text: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  progress: { label: 'In progress', text: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  booked: { label: 'Booked', text: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  local: { label: 'Local — not needed', text: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
}

// The order the board is worked in. A club that still needs hotels is the reason
// anyone opens this page; a local club needs nothing at all and only takes up room.
// Rows sort by this even with no filter applied, so the ten clubs waiting on rooms sit
// at the top of every event rather than scattered among the ones already settled.
const STATUS_ORDER = ['needs', 'progress', 'booked', 'local']
/** A club's status, falling back the same way the row render does so counts match rows. */
const statusOf = (c: { status: string }) => (HOUSING_STATUS_META[c.status] ? c.status : 'needs')

export function fmtEventDates(a: string, b: string) {
  const f = (d: string) => { const x = new Date(d); return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  const s = f(a), e = f(b)
  return s && e && s !== e ? `${s}–${e}` : s || e
}

export function HousingCounts({ events }: { events: Ev[] }) {
  const counts = useMemo(() => {
    const all = events.flatMap(e => e.clubs)
    const c = (s: string) => all.filter(x => x.status === s).length
    return [
      { n: c('needs'), label: 'NEED HOTELS', cls: 'border-red-300/60 text-red-300' },
      { n: c('progress'), label: 'IN PROGRESS', cls: 'border-amber-300/60 text-amber-300' },
      { n: c('booked'), label: 'BOOKED', cls: 'border-emerald-300/60 text-emerald-300' },
      { n: all.reduce((s, x) => s + x.roomNights, 0), label: 'ROOM NIGHTS', cls: 'border-teal-300/60 text-teal-300' },
    ]
  }, [events])
  return (
    <div className="flex gap-2 sm:gap-2.5">
      {counts.map(c => (
        <div key={c.label} className={`bg-white/[0.07] border rounded-xl px-3 sm:px-4 py-1.5 text-center min-w-[64px] ${c.cls}`}>
          <div className="text-lg font-extrabold leading-tight">{c.n}</div>
          <div className="text-[8.5px] font-bold tracking-wider opacity-90">{c.label}</div>
        </div>
      ))}
    </div>
  )
}

export default function HousingBoard({ code, viewOrgId, onData }: {
  code?: string
  viewOrgId?: string | null
  onData?: (events: Ev[]) => void
}) {
  const [events, setEvents] = useState<Ev[] | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [error, setError] = useState('')
  const [flash, setFlash] = useState<string | null>(null)

  const apiQuery = code ? `?code=${encodeURIComponent(code)}` : viewOrgId ? `?viewOrgId=${encodeURIComponent(viewOrgId)}` : ''

  useEffect(() => {
    fetch(`/api/housing/board${apiQuery}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Failed to load'); return r.json() })
      .then(d => { setEvents(d.events); onData?.(d.events) })
      .catch(e => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiQuery])

  const patchLocal = useCallback((regId: string, patch: Partial<Club>) => {
    setEvents(evs => {
      const next = evs?.map(e => ({ ...e, clubs: e.clubs.map(c => c.regId === regId ? { ...c, ...patch } : c) })) ?? null
      if (next) onData?.(next)
      return next
    })
  }, [onData])

  const patchBookingLocal = useCallback((regId: string, bookingId: string, patch: Partial<Booking>) => {
    setEvents(evs => evs?.map(e => ({
      ...e,
      clubs: e.clubs.map(c => c.regId === regId
        ? { ...c, bookings: c.bookings.map(b => b.id === bookingId ? { ...b, ...patch } : b) }
        : c),
    })) ?? null)
  }, [])

  async function post(regId: string, payload: Record<string, unknown>) {
    const res = await fetch('/api/housing/board', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(code ? { code } : { viewOrgId }), regId, ...payload }),
    })
    if (res.ok) {
      const d = await res.json()
      const patch: Partial<Club> = {}
      if (d.status) patch.status = d.status
      if (Array.isArray(d.bookings)) { patch.bookings = d.bookings; patch.roomNights = d.roomNights ?? 0 }
      patchLocal(regId, patch)
      setFlash(regId); setTimeout(() => setFlash(f => f === regId ? null : f), 1200)
    }
  }

  if (error) return <div className="max-w-xl mx-auto text-center py-16 px-4"><p className="text-slate-500 text-sm">{error}</p></div>
  if (!events) return <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
  if (!events.some(e => e.clubs.length)) return <div className="text-center py-16 text-slate-400 text-sm">No upcoming events with registered clubs yet.</div>

  const inputCls = 'border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500'

  const everyClub = events.flatMap(e => e.clubs)
  const countOf = (s: string) => everyClub.filter(c => statusOf(c) === s).length
  const chips: { key: string; label: string; n: number }[] = [
    { key: 'all', label: 'All clubs', n: everyClub.length },
    ...STATUS_ORDER.map(k => ({ key: k, label: HOUSING_STATUS_META[k].label, n: countOf(k) })),
  ]
  // Sorted whether or not anything is filtered; filtering only removes rows.
  const shown = (ev: Ev) => ev.clubs
    .filter(c => filter === 'all' || statusOf(c) === filter)
    .slice()
    .sort((a, b) => STATUS_ORDER.indexOf(statusOf(a)) - STATUS_ORDER.indexOf(statusOf(b))
      || String(a.clubName || '').localeCompare(String(b.clubName || '')))
  const anyShown = events.some(e => shown(e).length)

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        {chips.map(ch => {
          const on = filter === ch.key
          const meta = HOUSING_STATUS_META[ch.key]
          return (
            <button key={ch.key} type="button" onClick={() => setFilter(ch.key)} aria-pressed={on}
              disabled={ch.n === 0 && ch.key !== 'all'}
              className="text-xs font-semibold rounded-full border px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={on
                ? { background: meta ? meta.bg : '#0f172a', color: meta ? meta.text : '#ffffff', borderColor: meta ? meta.border : '#0f172a' }
                : { background: '#ffffff', color: '#64748b', borderColor: '#e2e8f0' }}>
              {ch.label} <span className="tabular-nums opacity-70">{ch.n}</span>
            </button>
          )
        })}
      </div>

      {!anyShown && (
        <div className="text-center py-12 text-slate-400 text-sm">
          No clubs are {(HOUSING_STATUS_META[filter]?.label || '').toLowerCase() || 'in this state'} right now.
        </div>
      )}

      {events.filter(e => shown(e).length).map(ev => (
        <div key={ev.id}>
          <div className="flex items-baseline gap-2.5 mb-2.5 px-1">
            <h2 className="text-base font-extrabold text-slate-900">{ev.name}</h2>
            <span className="text-xs text-slate-500">{fmtEventDates(ev.startDate, ev.endDate)}{ev.location ? ` · ${ev.location}` : ''}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <div className="min-w-[950px]">
              <div className="grid grid-cols-[210px_200px_150px_1fr_170px] gap-3 px-4 py-2 border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold tracking-wider text-slate-400">
                <div>CLUB</div><div>CONTACT</div><div>STATUS</div><div>HOTELS — a club can split across several</div><div>NOTES</div>
              </div>
              {shown(ev).map(c => {
                const meta = HOUSING_STATUS_META[c.status] ?? HOUSING_STATUS_META.needs
                const muted = c.status === 'local'
                return (
                  <div key={c.regId} className={`grid grid-cols-[210px_200px_150px_1fr_170px] gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0 items-start ${muted ? 'bg-slate-50/60' : ''}`}>
                    <div className="min-w-0 pt-1">
                      <div className={`text-[13px] font-bold truncate ${muted ? 'text-slate-400' : 'text-slate-900'}`}>{c.clubName}</div>
                      <div className="text-[10.5px] text-slate-400 truncate">{c.numTeams} team{c.numTeams === 1 ? '' : 's'}{c.clubBasedIn ? ` · ${c.clubBasedIn}` : ''}</div>
                      {c.roomNights > 0 && <div className="text-[10px] font-bold text-teal-700 mt-0.5">{c.roomNights} room nights</div>}
                    </div>
                    <div className="min-w-0 pt-1">
                      {/* THE POINT OF THIS COLUMN IS TO BE USED, so nothing here truncates.
                          Phone and email shared one line and were cut off mid-address on
                          every row -- "david@flamingola..." tells you a club has an email
                          and not what it is, which is the opposite of useful to the person
                          chasing room blocks. Each on its own line now, the email wrapping
                          rather than clipping, and both tappable: on a phone that is a call
                          or a compose window instead of something to copy by hand. A local
                          club arrives here with its contact stripped by the API, so the
                          dash case stays. */}
                      {(c.clubContact || c.contactPhone || c.contactEmail) ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="text-[11.5px] font-semibold text-slate-600">{c.clubContact || '—'}</div>
                          {c.contactPhone && (
                            <a href={`tel:${String(c.contactPhone).replace(/[^\d+]/g, '')}`}
                              className="text-[10px] text-slate-400 hover:text-teal-700 tabular-nums w-fit">
                              {c.contactPhone}
                            </a>
                          )}
                          {c.contactEmail && (
                            <a href={`mailto:${c.contactEmail}`} title={c.contactEmail}
                              className="text-[10px] text-slate-400 hover:text-teal-700 leading-snug [overflow-wrap:anywhere]">
                              {c.contactEmail}
                            </a>
                          )}
                        </div>
                      ) : <span className="text-[10.5px] text-slate-300">—</span>}
                    </div>
                    <select
                      className="rounded-lg px-2 py-1.5 text-[11px] font-bold w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
                      style={{ color: meta.text, background: meta.bg, border: `1px solid ${meta.border}` }}
                      value={c.status}
                      onChange={e => { patchLocal(c.regId, { status: e.target.value }); post(c.regId, { status: e.target.value }) }}>
                      {Object.entries(HOUSING_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                    </select>
                    <div className="flex flex-col gap-1.5">
                      {c.bookings.map(b => (
                        <div key={b.id} className="flex items-center gap-1.5">
                          <input className={`${inputCls} flex-1 min-w-0`} value={b.hotel} placeholder="Hotel…"
                            onChange={e => patchBookingLocal(c.regId, b.id, { hotel: e.target.value })}
                            onBlur={e => post(c.regId, { updateBooking: { id: b.id, hotel: e.target.value } })} />
                          <input className={`${inputCls} w-[74px] text-center`} inputMode="numeric" value={b.rooms || ''} placeholder="rooms"
                            onChange={e => patchBookingLocal(c.regId, b.id, { rooms: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                            onBlur={e => post(c.regId, { updateBooking: { id: b.id, rooms: Number(e.target.value.replace(/\D/g, '')) || 0 } })} />
                          <input className={`${inputCls} w-[74px] text-center`} inputMode="numeric" value={b.nights || ''} placeholder="nights"
                            onChange={e => patchBookingLocal(c.regId, b.id, { nights: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                            onBlur={e => post(c.regId, { updateBooking: { id: b.id, nights: Number(e.target.value.replace(/\D/g, '')) || 0 } })} />
                          <span className="text-[10px] text-slate-400 w-[46px] text-right shrink-0">{b.rooms && b.nights ? `${b.rooms * b.nights} rn` : ''}</span>
                          <button type="button" aria-label="Remove this hotel" title="Remove this hotel"
                            className="text-slate-300 hover:text-red-500 shrink-0 p-0.5"
                            onClick={() => post(c.regId, { removeBooking: b.id })}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                          </button>
                        </div>
                      ))}
                      <button type="button" onClick={() => post(c.regId, { addBooking: {} })}
                        className="self-start flex items-center gap-1 text-[11px] font-bold text-teal-700 hover:text-teal-600 py-0.5">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
                        Add hotel
                      </button>
                    </div>
                    <div className="flex items-start gap-2 pt-0.5">
                      <input className={`${inputCls} w-full`} value={c.notes} placeholder="Notes…"
                        onChange={e => patchLocal(c.regId, { notes: e.target.value })}
                        onBlur={e => post(c.regId, { notes: e.target.value })} />
                      <span className={`text-[10px] font-bold text-emerald-600 transition-opacity pt-1.5 ${flash === c.regId ? 'opacity-100' : 'opacity-0'}`}>Saved</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
