'use client'

// The hotel-booking board — one component, two doors: the housing company's
// magic-link page (/housing/[code], no login) and the org side (/staff/housing).
// Rows are TeamRegistration records; hotel/rooms/nights land in the same raw
// columns the /tournaments/[id]/travel grant report totals.

import { useEffect, useMemo, useState, useCallback } from 'react'

type Club = {
  regId: string; clubName: string; clubContact: string; contactEmail: string; contactPhone: string
  clubBasedIn: string; numTeams: number; status: string
  hotelName: string; hotelRooms: number; hotelNights: number; notes: string
}
type Ev = { id: string; name: string; startDate: string; endDate: string; location: string; clubs: Club[] }

export const HOUSING_STATUS_META: Record<string, { label: string; text: string; bg: string; border: string }> = {
  needs: { label: 'Needs hotels', text: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  progress: { label: 'In progress', text: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  booked: { label: 'Booked', text: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  local: { label: 'Local — not needed', text: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
}

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
      { n: c('local'), label: 'LOCAL', cls: 'border-slate-400/60 text-slate-300' },
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

  async function save(regId: string, patch: Record<string, unknown>) {
    const res = await fetch('/api/housing/board', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(code ? { code } : { viewOrgId }), regId, ...patch }),
    })
    if (res.ok) {
      const d = await res.json()
      if (d.status) patchLocal(regId, { status: d.status })
      setFlash(regId); setTimeout(() => setFlash(f => f === regId ? null : f), 1200)
    }
  }

  if (error) return <div className="max-w-xl mx-auto text-center py-16 px-4"><p className="text-slate-500 text-sm">{error}</p></div>
  if (!events) return <div className="text-center py-16 text-slate-400 text-sm">Loading…</div>
  if (!events.some(e => e.clubs.length)) return <div className="text-center py-16 text-slate-400 text-sm">No upcoming events with registered clubs yet.</div>

  const inputCls = 'border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-full focus:outline-none focus:ring-2 focus:ring-teal-500'

  return (
    <div className="flex flex-col gap-7">
      {events.filter(e => e.clubs.length).map(ev => (
        <div key={ev.id}>
          <div className="flex items-baseline gap-2.5 mb-2.5 px-1">
            <h2 className="text-base font-extrabold text-slate-900">{ev.name}</h2>
            <span className="text-xs text-slate-500">{fmtEventDates(ev.startDate, ev.endDate)}{ev.location ? ` · ${ev.location}` : ''}</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[220px_150px_150px_150px_64px_64px_1fr] gap-3 px-4 py-2 border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold tracking-wider text-slate-400">
                <div>CLUB</div><div>CONTACT</div><div>STATUS</div><div>HOTEL</div><div>ROOMS</div><div>NIGHTS</div><div>NOTES</div>
              </div>
              {ev.clubs.map(c => {
                const meta = HOUSING_STATUS_META[c.status] ?? HOUSING_STATUS_META.needs
                const muted = c.status === 'local'
                return (
                  <div key={c.regId} className={`grid grid-cols-[220px_150px_150px_150px_64px_64px_1fr] gap-3 px-4 py-2.5 border-b border-slate-100 last:border-b-0 items-center ${muted ? 'bg-slate-50/60' : ''}`}>
                    <div className="min-w-0">
                      <div className={`text-[13px] font-bold truncate ${muted ? 'text-slate-400' : 'text-slate-900'}`}>{c.clubName}</div>
                      <div className="text-[10.5px] text-slate-400 truncate">{c.numTeams} team{c.numTeams === 1 ? '' : 's'}{c.clubBasedIn ? ` · ${c.clubBasedIn}` : ''}</div>
                    </div>
                    <div className="min-w-0">
                      {(c.clubContact || c.contactPhone || c.contactEmail) ? (
                        <>
                          <div className="text-[11.5px] font-semibold text-slate-600 truncate">{c.clubContact || '—'}</div>
                          <div className="text-[10px] text-slate-400 truncate">{[c.contactPhone, c.contactEmail].filter(Boolean).join(' · ')}</div>
                        </>
                      ) : <span className="text-[10.5px] text-slate-300">—</span>}
                    </div>
                    <select
                      className="rounded-lg px-2 py-1.5 text-[11px] font-bold w-full cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500"
                      style={{ color: meta.text, background: meta.bg, border: `1px solid ${meta.border}` }}
                      value={c.status}
                      onChange={e => { patchLocal(c.regId, { status: e.target.value }); save(c.regId, { status: e.target.value }) }}>
                      {Object.entries(HOUSING_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
                    </select>
                    <input className={inputCls} value={c.hotelName} placeholder="Add hotel…"
                      onChange={e => patchLocal(c.regId, { hotelName: e.target.value })}
                      onBlur={e => save(c.regId, { hotelName: e.target.value })} />
                    <input className={`${inputCls} text-center`} inputMode="numeric" value={c.hotelRooms || ''} placeholder="—"
                      onChange={e => patchLocal(c.regId, { hotelRooms: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                      onBlur={e => save(c.regId, { hotelRooms: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                    <input className={`${inputCls} text-center`} inputMode="numeric" value={c.hotelNights || ''} placeholder="—"
                      onChange={e => patchLocal(c.regId, { hotelNights: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                      onBlur={e => save(c.regId, { hotelNights: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                    <div className="flex items-center gap-2">
                      <input className={inputCls} value={c.notes} placeholder="Notes…"
                        onChange={e => patchLocal(c.regId, { notes: e.target.value })}
                        onBlur={e => save(c.regId, { notes: e.target.value })} />
                      <span className={`text-[10px] font-bold text-emerald-600 transition-opacity ${flash === c.regId ? 'opacity-100' : 'opacity-0'}`}>Saved</span>
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
