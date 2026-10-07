'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ArrowUpDown, Check, ChevronDown } from 'lucide-react'
import HotelCards from '@/components/HotelCards'
import { hotelChain, milesNumber, rateNumber, type EventHotel } from '@/lib/eventHotels'

// The hotels page's list with the families' filters (Bo, Oct 7: "at least list
// the closest ones ... filter by price and distance ... search by hotel chain").
//   Sort: Recommended (event-rate hotels first in staff's order, then the rest by
//   distance), Closest, Lowest price.
//   Filter: chain, a top price, a top distance, event rate only.
// Sold-out hotels stay last whatever the sort. With three hotels or fewer there is
// nothing to sift, so the controls stay out of the way.
// The controls are one row of matching dropdowns with the count at the end (Bo,
// Oct 7: the boxed Sort / Chain / dropdown rows looked "kind of weird ... like all
// in one line"). On a phone the dropdowns sit two to a row.

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

  return (
    <div>
      {hotels.length > 3 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center [&>*:last-child:nth-child(odd)]:col-span-2">
            {/* "Sort:" on wider screens; on a phone an icon, so the choice fits half the row. */}
            <Pick label="Sort hotels" value={sort} onChange={v => setSort(v as Sort)}
              prefix={<><ArrowUpDown size={14} className="shrink-0 text-slate-400 sm:hidden" /><span className="hidden font-normal text-slate-400 sm:inline">Sort:</span></>}
              options={SORTS.map(s => ({ value: s.key, label: s.label }))} />
            {chains.length > 1 && (
              <Pick label="Hotel chain" value={chain} active={chain !== 'all'} onChange={setChain}
                options={[{ value: 'all', label: 'All chains' }, ...chains.map(([name, n]) => ({ value: name, label: `${name} (${n})` }))]} />
            )}
            {priceSteps.length > 0 && (
              <Pick label="Highest price per night" value={String(maxPrice)} active={!!maxPrice} onChange={v => setMaxPrice(Number(v))}
                options={[{ value: '0', label: 'Any price' }, ...priceSteps.map(p => ({ value: String(p), label: `Up to $${p}/night` }))]} />
            )}
            {mileSteps.length > 0 && (
              <Pick label="Farthest from the fields" value={String(maxMiles)} active={!!maxMiles} onChange={v => setMaxMiles(Number(v))}
                options={[{ value: '0', label: 'Any distance' }, ...mileSteps.map(m => ({ value: String(m), label: `Within ${m} miles` }))]} />
            )}
          </div>
          {mixedRates && (
            <button type="button" onClick={() => setEventOnly(v => !v)} aria-pressed={eventOnly} className={`${pill(eventOnly)} px-3.5`}>
              {eventOnly && <Check size={15} aria-hidden />}Event rate only
            </button>
          )}
          <p className="ml-auto whitespace-nowrap text-sm text-slate-500" aria-live="polite">
            {filtering ? `${shown.length} of ${hotels.length} hotels` : `${hotels.length} hotels`}
            {filtering && <button type="button" onClick={clear} className="ml-2 font-semibold text-teal-700 hover:text-teal-900">Clear</button>}
          </p>
        </div>
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

const pill = (on: boolean) => `inline-flex h-10 sm:h-9 items-center gap-1.5 rounded-full border text-sm font-medium transition-colors ${on ? 'border-teal-700 bg-teal-700 text-white hover:bg-teal-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`

/** A dropdown that looks like the other pills: the picked option shows, the phone's own picker opens. */
function Pick({ label, prefix, value, options, onChange, active = false }: {
  label: string
  prefix?: ReactNode
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  /** A filter that's narrowing the list right now. */
  active?: boolean
}) {
  const shown = options.find(o => o.value === value)?.label ?? options[0]?.label ?? ''
  return (
    <div className={`${pill(active)} relative min-w-0 pl-3.5 pr-8 focus-within:ring-2 focus-within:ring-teal-400`}>
      <span aria-hidden className="flex min-w-0 items-center gap-1.5">
        {prefix}<span className="truncate">{shown}</span>
      </span>
      <ChevronDown size={15} aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60" />
      <select aria-label={label} value={value} onChange={e => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}
