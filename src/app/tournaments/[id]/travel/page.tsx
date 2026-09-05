'use client'
// Travel & hotels report — room-night tracking for sports-tourism grants.
// Reads each club's hotel answers from registration (needsHotel + hotelName/
// hotelRooms/hotelNights raw columns), lets staff update them with actuals
// (post-event room-block reports), and totals room nights by hotel — the exact
// table the grant Post-Event Report wants. Edits go through the travel-only
// PATCH branch so the team list is never touched.
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { BedDouble, Printer, Building2 } from 'lucide-react'

interface Reg {
  id: string; clubName: string; clubContact: string; clubBasedIn: string
  numTeams: number; needsHotel: string
  hotelName?: string; hotelRooms?: number; hotelNights?: number
  teams?: any[]
}

export default function TravelPage({ params }: { params: { id: string } }) {
  const [tournament, setTournament] = useState<any>(null)
  const [regs, setRegs] = useState<Reg[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  async function load() {
    const [tR, rR] = await Promise.all([
      fetch(`/api/tournaments/${params.id}`),
      fetch(`/api/registrations?tournamentId=${params.id}`),
    ])
    setTournament(await tR.json())
    const r = await rR.json()
    setRegs(Array.isArray(r) ? r : [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function patchLocal(id: string, patch: Partial<Reg>) {
    setRegs(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r))
  }
  async function save(reg: Reg) {
    setSavingId(reg.id)
    await fetch(`/api/registrations/${reg.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        travel: true, needsHotel: reg.needsHotel,
        hotelName: reg.hotelName || '', hotelRooms: reg.hotelRooms || 0, hotelNights: reg.hotelNights || 0,
      }),
    })
    setSavingId(null)
  }

  const nights = (r: Reg) => (Number(r.hotelRooms) || 0) * (Number(r.hotelNights) || 0)
  const totals = useMemo(() => {
    const staying = regs.filter(r => r.needsHotel === 'Yes' || nights(r) > 0)
    const roomNights = regs.reduce((s, r) => s + nights(r), 0)
    const rooms = regs.reduce((s, r) => s + (Number(r.hotelRooms) || 0), 0)
    const byHotel = new Map<string, number>()
    for (const r of regs) {
      const n = nights(r); if (!n) continue
      const key = (r.hotelName || '').trim() || 'Hotel TBD'
      byHotel.set(key, (byHotel.get(key) || 0) + n)
    }
    return { staying: staying.length, roomNights, rooms, byHotel: Array.from(byHotel.entries()).sort((a, b) => b[1] - a[1]) }
  }, [regs])

  const inputCls = 'border border-slate-300 rounded px-2 py-1 text-sm w-full'

  if (loading) return <div className="p-8 text-slate-400">Loading…</div>

  return (
    <div className="max-w-5xl mx-auto px-0 sm:px-4 py-4 sm:py-6">
      <div className="page-header print:hidden">
        <div>
          <h1 className="section-title flex items-center gap-2"><BedDouble size={20} className="text-teal-600" />Travel &amp; hotels</h1>
          <p className="text-sm text-slate-500 mt-1">
            Room-night tracking for {tournament?.name || 'this tournament'} — clubs answer at registration;
            update with actuals after the event. Totals feed sports-tourism grant applications and the post-event report.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/staff/housing" className="btn-secondary btn-sm flex items-center gap-2"><Building2 size={15} />Housing company</Link>
          <button onClick={() => window.print()} className="btn-primary btn-sm flex items-center gap-2"><Printer size={15} />Print</button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          ['Clubs registered', regs.length],
          ['Clubs staying overnight', totals.staying],
          ['Rooms / night (est.)', totals.rooms],
          ['Total room nights', totals.roomNights],
        ].map(([label, val]) => (
          <div key={String(label)} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <div className="text-2xl font-bold text-slate-800">{val}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Per-club — cards on phones, editable table on desktop */}
      <div className="sm:hidden space-y-2 mb-6">
        {regs.map(r => (
          <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 truncate">{r.clubName || r.clubContact}</div>
                <div className="text-xs text-slate-500 truncate">{r.numTeams ?? r.teams?.length ?? ''} team{(r.numTeams ?? r.teams?.length ?? 0) === 1 ? '' : 's'}{r.clubBasedIn ? ` · ${r.clubBasedIn}` : ''}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-lg font-bold text-slate-800 leading-tight">{nights(r) || 0}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">room nights</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2.5">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Hotel?</label>
                <select value={r.needsHotel || 'No'} onChange={e => patchLocal(r.id, { needsHotel: e.target.value })} onBlur={() => save(r)}
                  className="w-full border border-slate-300 rounded px-1.5 py-1.5 text-sm bg-white">
                  <option>Yes</option><option>No</option><option>Maybe</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Hotel</label>
                <input className={inputCls} value={r.hotelName || ''} placeholder="TBD" onChange={e => patchLocal(r.id, { hotelName: e.target.value })} onBlur={() => save(r)} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Rooms/night</label>
                <input type="number" inputMode="numeric" min="0" className={inputCls} value={r.hotelRooms || ''} onChange={e => patchLocal(r.id, { hotelRooms: Number(e.target.value) })} onBlur={() => save(r)} />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">Nights</label>
                <input type="number" inputMode="numeric" min="0" className={inputCls} value={r.hotelNights || ''} onChange={e => patchLocal(r.id, { hotelNights: Number(e.target.value) })} onBlur={() => save(r)} />
              </div>
              <div className="flex items-end pb-2 text-xs text-slate-400">{savingId === r.id ? 'Saving…' : ''}</div>
            </div>
          </div>
        ))}
        {regs.length === 0 && <div className="bg-white border border-slate-200 rounded-xl px-3 py-8 text-center text-slate-400">No registrations yet.</div>}
        {regs.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 flex items-center justify-between text-sm font-semibold text-slate-800">
            <span>Totals</span><span>{totals.rooms} rooms/night · {totals.roomNights} room nights</span>
          </div>
        )}
      </div>

      <div className="hidden sm:block bg-white border border-slate-200 rounded-xl overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              {['Club', 'Teams', 'Based in', 'Hotel?', 'Hotel', 'Rooms/night', 'Nights', 'Room nights', ''].map((h, i) => (
                <th key={i} className="px-3 py-2.5 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regs.map(r => (
              <tr key={r.id} className="border-t border-slate-100 align-middle">
                <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{r.clubName || r.clubContact}</td>
                <td className="px-3 py-2 text-slate-500">{r.numTeams ?? r.teams?.length ?? ''}</td>
                <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{r.clubBasedIn}</td>
                <td className="px-3 py-2">
                  <select value={r.needsHotel || 'No'} onChange={e => patchLocal(r.id, { needsHotel: e.target.value })} onBlur={() => save(r)}
                    className="border border-slate-300 rounded px-1.5 py-1 text-sm print:appearance-none">
                    <option>Yes</option><option>No</option><option>Maybe</option>
                  </select>
                </td>
                <td className="px-3 py-2 min-w-[140px]"><input className={inputCls} value={r.hotelName || ''} placeholder="TBD"
                  onChange={e => patchLocal(r.id, { hotelName: e.target.value })} onBlur={() => save(r)} /></td>
                <td className="px-3 py-2 w-24"><input type="number" min="0" className={inputCls} value={r.hotelRooms || ''}
                  onChange={e => patchLocal(r.id, { hotelRooms: Number(e.target.value) })} onBlur={() => save(r)} /></td>
                <td className="px-3 py-2 w-20"><input type="number" min="0" className={inputCls} value={r.hotelNights || ''}
                  onChange={e => patchLocal(r.id, { hotelNights: Number(e.target.value) })} onBlur={() => save(r)} /></td>
                <td className="px-3 py-2 font-semibold text-slate-800">{nights(r) || ''}</td>
                <td className="px-3 py-2 text-xs text-slate-400">{savingId === r.id ? 'Saving…' : ''}</td>
              </tr>
            ))}
            {regs.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">No registrations yet.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
              <td className="px-3 py-2.5" colSpan={5}>Totals</td>
              <td className="px-3 py-2.5">{totals.rooms}</td>
              <td className="px-3 py-2.5"></td>
              <td className="px-3 py-2.5">{totals.roomNights}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* By-hotel summary — mirrors the grant Post-Event Report "Hotel Information" table */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2 mb-3">
          <Building2 size={16} className="text-teal-600" />Room nights by hotel
          <span className="text-xs font-normal text-slate-400">— matches the grant post-event report table</span>
        </h2>
        {totals.byHotel.length === 0
          ? <p className="text-sm text-slate-400">No room nights recorded yet.</p>
          : (
            <table className="w-full text-sm max-w-md">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-4 font-semibold">Name of hotel</th><th className="py-1.5 font-semibold">Total room nights</th>
              </tr></thead>
              <tbody>
                {totals.byHotel.map(([hotel, n]) => (
                  <tr key={hotel} className="border-t border-slate-100">
                    <td className="py-1.5 pr-4 text-slate-700">{hotel}</td><td className="py-1.5 font-medium">{n}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 font-semibold text-slate-800">
                  <td className="py-1.5 pr-4">Total</td><td className="py-1.5">{totals.roomNights}</td>
                </tr>
              </tbody>
            </table>
          )}
        <p className="text-xs text-slate-400 mt-3">
          Reminder: hotels must send room-block confirmation letters (or a booking-agent report) with the post-event report — counties verify by calling the hotels.
        </p>
      </div>
    </div>
  )
}
