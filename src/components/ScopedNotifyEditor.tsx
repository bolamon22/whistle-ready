'use client'
import { X, Plus } from 'lucide-react'
import type { ScopedRecipient } from '@/lib/scopedNotify'

// Reusable "notify these people for only some events" editor. Shared by the
// registration, vendor and staff cards in the org Forms library. Each row is one
// person and the set of EVENTS (not dated tournaments) they're CC'd on — see
// src/lib/eventSeries.ts for why scoping is by event, not tournament id.
const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400'
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mt-3 mb-1'

export default function ScopedNotifyEditor({ value, onChange, seriesOptions, label, help }: {
  value?: ScopedRecipient[]
  onChange: (next: ScopedRecipient[]) => void
  seriesOptions: string[]
  label?: string
  help?: string
}) {
  const rows: ScopedRecipient[] = Array.isArray(value) ? value : []
  const set = (i: number, patch: Partial<ScopedRecipient>) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r))
  const toggle = (i: number, s: string) => { const r = rows[i]; const has = r.series.includes(s); set(i, { series: has ? r.series.filter(x => x !== s) : [...r.series, s] }) }
  const add = () => onChange([...rows, { email: '', series: [] }])
  const remove = (i: number) => onChange(rows.filter((_, j) => j !== i))

  // No recurring events yet (a brand-new org) — nothing to scope by, so the plain
  // "notify" field above is all that's needed.
  if (!seriesOptions.length) return null

  return (
    <div className="mt-3">
      <div className={labelCls}>{label || 'Notify specific people by event'}</div>
      <p className="text-xs text-slate-400 mb-2">{help || 'Add someone and tick which events they should be notified for. New yearly editions of an event are included automatically — nothing to update after an event ends.'}</p>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <input className={inputCls} type="email" placeholder="name@email.com" value={r.email} onChange={e => set(i, { email: e.target.value })} />
              <button type="button" onClick={() => remove(i)} aria-label="Remove person" className="flex-none w-9 h-9 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {seriesOptions.map(s => {
                const on = r.series.includes(s)
                return (
                  <button type="button" key={s} onClick={() => toggle(i, s)} aria-pressed={on}
                    className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors ${on ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-teal-400'}`}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:text-teal-800"><Plus size={15} /> Add person</button>
    </div>
  )
}
