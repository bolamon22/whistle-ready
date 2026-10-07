'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, ArrowUp, ArrowDown, Link2, ExternalLink } from 'lucide-react'
import {
  EMPTY_HOTEL, MAX_HOTELS, parseReserveTravel, reserveTravelHotelUrl, reserveTravelProperty, hotelsPath,
  type EventHotel,
} from '@/lib/eventHotels'

// Builder › Hotels: the block hotels families see on the event's own pages
// (lib/eventHotels has the why). Pasting the housing company's ReserveTravel
// search link adds one row per block hotel in it, each already pointing at that
// hotel's booking page for the event dates; staff type the name, rate, distance
// and deadline the housing company gave them.

const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1'
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'

export default function HotelListEditor({ tournamentId, hotels, onChange, bookingUrl }: {
  tournamentId: string
  hotels: EventHotel[]
  onChange: (next: EventHotel[]) => void
  /** The event's booking link, offered as the link to read hotels from. */
  bookingUrl: string
}) {
  const [link, setLink] = useState('')
  // Blank box: read the booking link above, when it is a ReserveTravel search link.
  const bookingHasHotels = !!parseReserveTravel(bookingUrl)?.properties.length
  const source = link.trim() || (bookingHasHotels ? bookingUrl : '')

  const set = (i: number, patch: Partial<EventHotel>) => onChange(hotels.map((h, j) => (j === i ? { ...h, ...patch } : h)))
  const move = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= hotels.length) return
    const next = [...hotels]; [next[i], next[j]] = [next[j], next[i]]; onChange(next)
  }

  function addFromLink() {
    const l = parseReserveTravel(source)
    if (!l || !l.properties.length) {
      toast.error('No hotels in that link. Open the booking link, then copy the address from the browser bar (it starts reservetravel.com).', { duration: 7000 })
      return
    }
    const have = new Set(hotels.map(h => reserveTravelProperty(h.url)).filter(Boolean))
    const fresh = l.properties.filter(p => !have.has(p)).slice(0, Math.max(0, MAX_HOTELS - hotels.length))
    if (!fresh.length) { toast('Those hotels are already listed'); return }
    onChange([...hotels, ...fresh.map(p => ({ ...EMPTY_HOTEL, url: reserveTravelHotelUrl(l, p) }))])
    toast.success(`Added ${fresh.length} hotel${fresh.length === 1 ? '' : 's'}. Type each one's name and rate.`, { duration: 5000 })
    setLink('')
  }

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mt-4 mb-1">Hotels to list</label>
      <p className="text-xs text-slate-500 mb-2">
        Families see these on the event page and at its hotel link, each with a button straight to that hotel&apos;s booking page.
        With hotels listed, the booking link above becomes &ldquo;See more hotels.&rdquo;
      </p>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input className={inputCls} value={link} onChange={e => setLink(e.target.value)} placeholder="Paste the housing company's reservetravel.com link to add its hotels" />
        <button type="button" onClick={addFromLink} disabled={!source}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 text-sm border border-slate-300 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Link2 size={14} /> Add from link
        </button>
      </div>
      {!link.trim() && bookingHasHotels && <p className="text-[11px] text-slate-400 -mt-2 mb-3">Leave it blank to use the booking link above.</p>}

      <div className="space-y-3">
        {hotels.map((h, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50/60">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-slate-400 w-5">{i + 1}.</span>
              <input className={`${inputCls} bg-white`} value={h.name} onChange={e => set(i, { name: e.target.value })} placeholder="Hotel name (required to show)" />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp size={15} /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === hotels.length - 1} aria-label="Move down" className="p-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown size={15} /></button>
              <button type="button" onClick={() => onChange(hotels.filter((_, j) => j !== i))} aria-label="Remove hotel" className="p-1.5 text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pl-7">
              <div>
                <label className={labelCls}>Rate / night</label>
                <input className={`${inputCls} bg-white`} value={h.rate} onChange={e => set(i, { rate: e.target.value })} placeholder="$199" inputMode="decimal" />
              </div>
              <div>
                <label className={labelCls}>Miles to fields</label>
                <input className={`${inputCls} bg-white`} value={h.miles} onChange={e => set(i, { miles: e.target.value })} placeholder="1.1" inputMode="decimal" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Book by</label>
                <input type="date" className={`${inputCls} bg-white`} value={h.bookBy} onChange={e => set(i, { bookBy: e.target.value })} />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelCls}>Booking link</label>
                <div className="flex gap-2">
                  <input className={`${inputCls} bg-white`} value={h.url} onChange={e => set(i, { url: e.target.value.trim() })} placeholder="https://… (leave blank to use the booking link above)" />
                  {/^https?:\/\//i.test(h.url) && <a href={h.url} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center px-2.5 border border-slate-300 rounded-lg text-slate-500 hover:bg-white" aria-label="Open booking link"><ExternalLink size={14} /></a>}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelCls}>Note (optional)</label>
                <input className={`${inputCls} bg-white`} value={h.note} onChange={e => set(i, { note: e.target.value })} placeholder="Breakfast included · free parking" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3">
        {hotels.length < MAX_HOTELS && (
          <button type="button" onClick={() => onChange([...hotels, { ...EMPTY_HOTEL }])}
            className="inline-flex items-center gap-1.5 text-sm border border-slate-300 rounded-lg px-3 py-1.5 text-slate-600 hover:bg-slate-50">
            <Plus size={14} /> Add a hotel
          </button>
        )}
        {hotels.some(h => h.name.trim()) && (
          <a href={hotelsPath(tournamentId)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1">
            Open the families&apos; hotel page <ExternalLink size={13} />
          </a>
        )}
      </div>
      {hotels.some(h => !h.name.trim()) && <p className="text-[11px] text-amber-700 mt-2">Hotels without a name stay hidden until you type one.</p>}
    </div>
  )
}
