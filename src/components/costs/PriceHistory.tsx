'use client'

import { changeLabel, costTotal, money, priceHistory, type CostView } from '@/lib/costTypes'
import { costLabel, type CostEvent } from './useCosts'

// One vendor's prices, item by item, across events: is it the price that went
// up, or the order that got bigger? Budget lines are left out (our guesses).

export default function PriceHistory({ costs, tournaments, onOpen }: {
  costs: CostView[]
  tournaments: CostEvent[]
  onOpen?: (c: CostView) => void
}) {
  const real = costs.filter(c => c.status !== 'budget' && c.items.length)
    .sort((a, b) => (a.eventDate || a.quoteDate).localeCompare(b.eventDate || b.quoteDate))
  if (!real.length) return null
  const rows = priceHistory(real, c => costLabel(c, tournaments))
  const tone = (ch: number | null) => ch === null || Math.abs(ch) < 0.005 ? 'text-slate-500' : ch > 0 ? 'text-red-700 font-semibold' : 'text-emerald-700 font-semibold'

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left font-semibold py-1 pr-2 min-w-[8.5rem]">Price each</th>
            {real.map(c => (
              <th key={c.id} className="text-right font-semibold py-1 px-1.5 whitespace-nowrap">
                {onOpen ? <button type="button" onClick={() => onOpen(c)} className="hover:text-teal-700 hover:underline">{costLabel(c, tournaments)}</button> : costLabel(c, tournaments)}
              </th>
            ))}
            {real.length > 1 && <th className="text-right font-semibold py-1 pl-1.5">Change</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(r => (
            <tr key={r.key}>
              <td className="py-1 pr-2 text-slate-700 capitalize min-w-[8.5rem]">{r.item.toLowerCase()}</td>
              {real.map(c => {
                const p = r.points.find(x => x.costId === c.id)
                return <td key={c.id} className="py-1 px-1.5 text-right text-slate-800 whitespace-nowrap">{p ? <>{money(p.unit)}<span className="text-slate-400"> ×{p.qty}</span></> : <span className="text-slate-300">—</span>}</td>
              })}
              {real.length > 1 && <td className={`py-1 pl-1.5 text-right whitespace-nowrap ${tone(r.change)}`}>{r.points.length > 1 ? changeLabel(r.change) : <span className="text-slate-300">—</span>}</td>}
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1 pr-2 text-slate-700">Total with tax</td>
            {real.map(c => <td key={c.id} className="py-1 px-1.5 text-right text-slate-800">{money(costTotal(c))}</td>)}
            {real.length > 1 && <td />}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
