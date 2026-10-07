import { Hotel, MapPin, Clock, ArrowUpRight } from 'lucide-react'
import { bookByLabel, milesLabel, rateLabel, safeUrl, type EventHotel } from '@/lib/eventHotels'
import HotelPhotos from '@/components/HotelPhotos'

// The event's block hotels, shown in Whistle Ready (lib/eventHotels says why).
// Full cards on /tournaments/<id>/hotels and the event page's Hotels section; a
// short list in the event page's side rail. Each button opens that hotel's own
// booking page on the housing company's site, in a new tab.
//
// Photos (components/HotelPhotos): a gallery on top of each card on the hotels
// page, one thumbnail on the event page, a small square in the rail. A hotel
// without photos keeps the hotel icon.
//
// Sold out (marked on the housing board or in the Builder; lib/hotelStatus): the
// pages pass the list through withSoldOut, which puts those hotels last. Their
// booking button gives way to "Sold out", so nobody clicks through to a full block.
//
// No hooks, so it renders on the server pages as they are; HotelPhotos is the
// client part.

export const todayET = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())

export default function HotelCards({ hotels, today, fallbackUrl = '', compact = false, gallery = false }: {
  hotels: EventHotel[]
  today: string
  /** The event's booking link, for a hotel listed without a link of its own. */
  fallbackUrl?: string
  compact?: boolean
  /** The hotels page: each hotel's photos as a gallery across the top of its card. */
  gallery?: boolean
}) {
  if (!hotels.length) return null
  const fallback = safeUrl(fallbackUrl)

  if (compact) {
    return (
      <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
        {hotels.map((h, i) => {
          const href = h.url || fallback
          const rate = rateLabel(h.rate)
          return (
            <li key={i} className="py-2.5 flex items-start gap-3">
              {(h.photos || []).length > 0 && <HotelPhotos photos={h.photos} name={h.name} layout="mini" />}
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold leading-snug ${h.soldOut ? 'text-slate-400' : 'text-slate-900'}`}>{h.name}</div>
                <div className="text-xs text-slate-500 mt-0.5">{[rate, milesLabel(h.miles)].filter(Boolean).join(' · ')}</div>
              </div>
              {h.soldOut
                ? <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-red-600 mt-0.5">Sold out</span>
                : href && <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-0.5 mt-0.5">Book<ArrowUpRight size={12} /></a>}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="space-y-3">
      {hotels.map((h, i) => {
        const href = h.url || fallback
        const rate = rateLabel(h.rate)
        const miles = milesLabel(h.miles)
        // A sold-out block has no deadline worth showing.
        const by = h.soldOut ? null : bookByLabel(h.bookBy, today)
        const photos = h.photos || []
        const top = gallery && photos.length > 0
        return (
          <div key={i} className={`border border-slate-200 rounded-2xl p-4 sm:p-5 ${h.soldOut ? 'bg-slate-50' : 'bg-white'}`}>
            {top && <div className="mb-4"><HotelPhotos photos={photos} name={h.name} layout="grid" /></div>}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {top ? null
                  : photos.length > 0 ? <HotelPhotos photos={photos} name={h.name} layout="thumb" />
                  : <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center shrink-0" aria-hidden><Hotel size={18} /></span>}
                <div className="min-w-0">
                  <h3 className={`font-bold text-slate-900 leading-snug ${top ? 'text-lg' : ''}`}>{h.name}</h3>
                  <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {miles && <span className="inline-flex items-center gap-1"><MapPin size={13} className="text-slate-400" />{miles}</span>}
                    {by && <span className={`inline-flex items-center gap-1 ${by.passed ? 'text-amber-700' : ''}`}><Clock size={13} className={by.passed ? 'text-amber-500' : 'text-slate-400'} />{by.text}</span>}
                  </div>
                  {h.note && <p className="text-sm text-slate-600 mt-2">{h.note}</p>}
                </div>
              </div>
              {(rate || href || h.soldOut) && (
                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 shrink-0 sm:text-right border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
                  {rate && (
                    <div>
                      <div className={`text-lg font-extrabold leading-none ${h.soldOut ? 'text-slate-400' : 'text-slate-900'}`}>{rate.replace(' / night', '')}<span className={`text-sm font-medium ${h.soldOut ? 'text-slate-400' : 'text-slate-500'}`}> / night</span></div>
                      {!h.soldOut && <div className="text-[11px] font-semibold uppercase tracking-wide text-teal-700 mt-1">Event rate</div>}
                    </div>
                  )}
                  {h.soldOut ? (
                    <span className="inline-flex items-center bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-2 rounded-full whitespace-nowrap">Sold out</span>
                  ) : href && (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-full whitespace-nowrap">
                      See rates &amp; book <ArrowUpRight size={14} />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
