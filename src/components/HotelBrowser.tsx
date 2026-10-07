'use client'

import { useMemo, useState } from 'react'
import HotelCards from '@/components/HotelCards'
import { hotelChain, milesNumber, rateNumber, type EventHotel } from '@/lib/eventHotels'

// The hotels page's list with the families' filters (Bo, Oct 7: "at least list
// the closest ones ... filter by price and distance ... search by hotel chain").
//   Sort: Recommended (event-rate hotels first in staff's order, then the rest by
//   distance), Closest, Lowest price.
//   Filter: chain, a top price, a top distance, event rate only.
// Sold-out hotels stay last whatever the sort. With three hotels or fewer there is
// nothing to sift, so the controls stay out of the way.

type Sort = 'recommended' | 'distance' | 'price'
const SORTS: { key: Sort; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'distance', label: 'Closest' },
  { key: 'price', label: 'Lowest price' },
]
const PRICE_STEPS = [100, 125, 150, 175, 200, 250, 300, 400]
const MILE_STEPS = [2, 5, 10, 15, 20, 30]
const FAR = 1e9

export default function HotelBrowser({ hotels, today, fallbackUrl = '' }: { hotels: EventHotel[]; today: string; fallbackUrl?: string }) {
  const [sort, setSort] = useState<Sort>('recommended')
  const [chain, setChain] = useState('all')
  const [maxPrice, setMaxPrice] = useState(0)
  const [maxMiles, setMaxMiles] = useState(0)
  const [eventOnly, setEventOnly] = useState(false)

  const chains = useMemo(() => {
    const n = new Map<string, number>()
    for (const h of hotels) n.set(hotelChain(h), (n.get(hotelChain(h)) || 0) + 1)
    return Array.from(n.entries()).sort((a, b) => Number(a[0] === 'Other') - Number(b[0] === 'Other') || b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [hotels])
  const rates = hotels.map(h => rateNumber(h.rate)).filter((n): n is number => n !== null)
  const miles = hotels.map(h => milesNumber(h.miles)).filter((n): n is number => n !== null)
  // Only limits that would leave some hotels out and keep some in.
  const priceSteps = PRICE_STEPS.filter(p => rates.some(r => r <= p) && rates.some(r => r > p))
  const mileSteps = MILE_STEPS.filter(m => miles.some(x => x <= m) && miles.some(x => x > m))
  const mixedRates = hotels.some(h => h.eventRate) && hotels.some(h => !h.eventRate)

  const shown = useMemo(() => {
    const priceOf = (h: EventHotel) => rateNumber(h.rate) ?? FAR
    const milesOf = (h: EventHotel) => milesNumber(h.miles) ?? FAR
    const list = hotels.filter(h =>
      (chain === 'all' || hotelChain(h) === chain)
      && (!maxPrice || priceOf(h) <= maxPrice)
      && (!maxMiles || milesOf(h) <= maxMiles)
      && (!eventOnly || h.eventRate))
    const by = (a: EventHotel, b: EventHotel) => {
      const sold = Number(!!a.soldOut) - Number(!!b.soldOut)
      if (sold) return sold
      if (sort === 'price') return priceOf(a) - priceOf(b) || milesOf(a) - milesOf(b)
      if (sort === 'distance') return milesOf(a) - milesOf(b) || priceOf(a) - priceOf(b)
      // Recommended: event-rate hotels first, in the order staff put them; then the rest, closest first.
      return Number(!a.eventRate) - Number(!b.eventRate)
        || (a.eventRate ? hotels.indexOf(a) - hotels.indexOf(b) : milesOf(a) - milesOf(b))
    }
    return [...list].sort(by)
  }, [hotels, sort, chain, maxPrice, maxMiles, eventOnly])

  const filtering = chain !== 'all' || !!maxPrice || !!maxMiles || eventOnly
  const clear = () => { setChain('all'); setMaxPrice(0); setMaxMiles(0); setEventOnly(false) }
  const chip = (on: boolean) => `shrink-0 inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`
  const selectCls = 'border border-slate-200 rounded-full bg-white pl-3 pr-8 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400'

  return (
    <div>
      {hotels.length > 3 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mr-1">Sort</span>
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Sort hotels">
              {SORTS.map(s => (
                <button key={s.key} type="button" onClick={() => setSort(s.key)} aria-pressed={sort === s.key}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${sort === s.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          {chains.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-0.5" role="group" aria-label="Hotel chain">
              <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400 mr-1">Chain</span>
              <button type="button" onClick={() => setChain('all')} aria-pressed={chain === 'all'} className={chip(chain === 'all')}>All</button>
              {chains.map(([name, n]) => (
                <button key={name} type="button" onClick={() => setChain(chain === name ? 'all' : name)} aria-pressed={chain === name} className={chip(chain === name)}>
                  {name} <span className="opacity-60 tabular-nums">{n}</span>
                </button>
              ))}
            </div>
          )}
          {(priceSteps.length > 0 || mileSteps.length > 0 || mixedRates) && (
            <div className="flex flex-wrap items-center gap-2">
              {priceSteps.length > 0 && (
                <select aria-label="Highest price per night" className={selectCls} value={maxPrice} onChange={e => setMaxPrice(Number(e.target.value))}>
                  <option value={0}>Any price</option>
                  {priceSteps.map(p => <option key={p} value={p}>Up to ${p} / night</option>)}
                </select>
              )}
              {mileSteps.length > 0 && (
                <select aria-label="Farthest from the fields" className={selectCls} value={maxMiles} onChange={e => setMaxMiles(Number(e.target.value))}>
                  <option value={0}>Any distance</option>
                  {mileSteps.map(m => <option key={m} value={m}>Within {m} miles</option>)}
                </select>
              )}
              {mixedRates && (
                <button type="button" onClick={() => setEventOnly(v => !v)} aria-pressed={eventOnly} className={chip(eventOnly)}>Event rate only</button>
              )}
            </div>
          )}
        </div>
      )}

      {hotels.length > 3 && (
        <p className="text-sm text-slate-500 mb-3" aria-live="polite">
          {filtering ? `${shown.length} of ${hotels.length} hotels` : `${hotels.length} hotels`}
          {filtering && <button type="button" onClick={clear} className="ml-2 font-semibold text-teal-700 hover:text-teal-900">Clear filters</button>}
        </p>
      )}

      {shown.length
        ? <HotelCards hotels={shown} fallbackUrl={fallbackUrl} today={today} gallery />
        : (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center text-sm text-slate-500">
            No hotels match those filters. <button type="button" onClick={clear} className="font-semibold text-teal-700 hover:text-teal-900">Clear filters</button>
          </div>
        )}
    </div>
  )
}
