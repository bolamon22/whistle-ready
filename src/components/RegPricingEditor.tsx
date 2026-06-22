'use client'
import { X, Plus } from 'lucide-react'
import type { RegPricing, Bracket, FlatTier, DateTier } from '@/lib/regPricing'

// Dynamic registration-fee editor. Three add/remove-able sections:
//  volume tiers (auto-chaining, last is "and up"), division flat-rates, and
//  early-bird date discounts.
export default function RegPricingEditor({ value, onChange }: { value: RegPricing; onChange: (p: RegPricing) => void }) {
  const tiers = value.tiers
  const flats = value.flats || []
  const dates = value.dates || []
  const priceCls = 'border border-slate-300 rounded-lg px-3 py-1.5 w-24 text-right text-sm focus:outline-none focus:ring-2 focus:ring-teal-500'
  const maxCls = 'border border-slate-300 rounded px-1.5 py-0.5 w-14 text-center text-sm focus:outline-none focus:ring-1 focus:ring-teal-500'
  const txtCls = 'border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500'

  // ── Volume tiers ──
  const setTiers = (t: Bracket[]) => onChange({ ...value, tiers: t.length ? t : [{ max: null, price: 0 }] })
  const update = (i: number, patch: Partial<Bracket>) => setTiers(tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const removeTier = (i: number) => {
    let t = tiers.filter((_, j) => j !== i)
    if (!t.length) t = [{ max: null, price: 0 }]
    if (!t.some(x => x.max === null)) t = t.map((x, j) => (j === t.length - 1 ? { ...x, max: null } : x))
    setTiers(t)
  }
  const addTier = () => {
    const openIdx = tiers.findIndex(t => t.max === null)
    const at = openIdx === -1 ? tiers.length : openIdx
    const prevMax = at > 0 ? (tiers[at - 1].max ?? 0) : 0
    const newTier: Bracket = { max: prevMax + 1, price: tiers[at]?.price ?? tiers[at - 1]?.price ?? 0 }
    setTiers([...tiers.slice(0, at), newTier, ...tiers.slice(at)])
  }
  const startFor = (i: number) => (i === 0 ? 1 : (tiers[i - 1].max ?? 0) + 1)

  // ── Division flat-rates ──
  const setFlats = (f: FlatTier[]) => onChange({ ...value, flats: f })
  const addFlat = () => setFlats([...flats, { label: 'Flat-rate teams', match: '', price: baseFor() }])
  const baseFor = () => tiers[0]?.price ?? 0

  // ── Early-bird date discounts ──
  const setDates = (d: DateTier[]) => onChange({ ...value, dates: d })
  const addDate = () => setDates([...dates, { label: 'Early bird', until: '', kind: 'amount', value: 0 }])

  return (
    <div className="space-y-5">
      {/* Volume tiers */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Per-team rate by number of teams</p>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
              <p className="text-sm font-medium text-slate-700 flex items-center gap-1 flex-wrap">
                {t.max === null
                  ? <>{startFor(i)}+ teams</>
                  : <>{startFor(i)}–<input type="number" min={startFor(i)} className={maxCls} value={t.max} onChange={e => update(i, { max: parseInt(e.target.value) || startFor(i) })} /> teams</>}
                <span className="text-slate-400 font-normal text-xs ml-1">per team</span>
              </p>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="1" className={priceCls} value={t.price} onChange={e => update(i, { price: parseFloat(e.target.value) || 0 })} />
                <button type="button" title="Remove tier" disabled={tiers.length <= 1} onClick={() => removeTier(i)} className="text-slate-300 hover:text-red-500 disabled:opacity-0 ml-1"><X size={15} /></button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addTier} className="mt-2 text-sm text-teal-700 hover:text-teal-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> Add tier</button>
      </div>

      {/* Division flat-rates */}
      <div className="pt-3 border-t border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Division rates <span className="font-normal text-slate-400 normal-case tracking-normal">— override the per-team rate for matching divisions</span></p>
        <div className="space-y-2">
          {flats.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <input type="text" className={`${txtCls} w-40`} value={f.label} placeholder="Rate name (e.g. Youth)" onChange={e => setFlats(flats.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <span className="text-xs text-slate-400">divisions containing</span>
                <input type="text" className={`${txtCls} w-24`} value={f.match} placeholder="7v7" onChange={e => setFlats(flats.map((x, j) => j === i ? { ...x, match: e.target.value } : x))} />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-sm">$</span>
                <input type="number" min="0" step="1" className={priceCls} value={f.price} onChange={e => setFlats(flats.map((x, j) => j === i ? { ...x, price: parseFloat(e.target.value) || 0 } : x))} />
                <button type="button" title="Remove division rate" onClick={() => setFlats(flats.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500 ml-1"><X size={15} /></button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addFlat} className="mt-2 text-sm text-teal-700 hover:text-teal-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> Add division rate</button>
      </div>

      {/* Early-bird date discounts */}
      <div className="pt-3 border-t border-slate-100">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Early-bird discounts <span className="font-normal text-slate-400 normal-case tracking-normal">— per team if registered by a date</span></p>
        <div className="space-y-2">
          {dates.map((d, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-1 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <input type="text" className={`${txtCls} w-36`} value={d.label} placeholder="Label (e.g. Early bird)" onChange={e => setDates(dates.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <input type="number" min="0" step="1" className={`${txtCls} w-20 text-right`} value={d.value} onChange={e => setDates(dates.map((x, j) => j === i ? { ...x, value: parseFloat(e.target.value) || 0 } : x))} />
                <select className={txtCls} value={d.kind} onChange={e => setDates(dates.map((x, j) => j === i ? { ...x, kind: e.target.value as DateTier['kind'] } : x))}>
                  <option value="amount">$ off</option>
                  <option value="percent">% off</option>
                </select>
                <span className="text-xs text-slate-400">if registered by</span>
                <input type="date" className={txtCls} value={d.until} onChange={e => setDates(dates.map((x, j) => j === i ? { ...x, until: e.target.value } : x))} />
              </div>
              <button type="button" title="Remove discount" onClick={() => setDates(dates.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500"><X size={15} /></button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addDate} className="mt-2 text-sm text-teal-700 hover:text-teal-900 font-medium inline-flex items-center gap-1"><Plus size={14} /> Add early-bird discount</button>
      </div>
    </div>
  )
}
