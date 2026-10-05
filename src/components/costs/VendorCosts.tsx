'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { categoryForContact, costStatus, costTotal, money, type CostView } from '@/lib/costTypes'
import type { ContactRow } from '@/lib/contactTypes'
import { costLabel, useCosts } from './useCosts'
import PriceHistory from './PriceHistory'
import CostEditor, { type CostDraft } from './CostEditor'

// The Costs section of a contact's card: every quote from this vendor, and
// how their prices moved. Old quotes go in here as history.

export default function VendorCosts({ c, tournamentId }: { c: Pick<ContactRow, 'id' | 'name' | 'company' | 'category'>; tournamentId?: string }) {
  const { data, failed, save, remove } = useCosts({ contactId: c.id })
  const [editing, setEditing] = useState<CostDraft | null>(null)
  const costs = data?.costs || []
  const tournaments = data?.tournaments || []

  const open = (x: CostView) => setEditing(x)
  const add = () => setEditing({ contactId: c.id, vendor: c.company || c.name, category: categoryForContact(c.category), tournamentId: tournamentId || '', status: 'quoted' })

  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="flex items-center mb-1.5">
        <div className="flex-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Costs</div>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"><Plus size={13} />Add a quote</button>
      </div>
      {failed && <p className="text-sm text-red-600">{failed}</p>}
      {data && !costs.length && <p className="text-sm text-slate-500">No quotes yet. Add this year’s, and past ones too, to see how their prices change.</p>}
      {costs.length > 0 && (
        <div className="space-y-2.5">
          <PriceHistory costs={costs} tournaments={tournaments} onOpen={open} />
          <ul className="space-y-0.5">
            {costs.map(x => {
              const s = costStatus(x.status)
              return (
                <li key={x.id}>
                  <button type="button" onClick={() => open(x)} className="w-full flex items-center gap-2 text-sm hover:bg-slate-50 rounded-lg -mx-1.5 px-1.5 py-1 text-left">
                    <span className="flex-1 min-w-0 truncate text-slate-700">{costLabel(x, tournaments)}{x.quoteRef ? <span className="text-slate-400"> · #{x.quoteRef}</span> : null}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${s.tone}`}>{s.label}</span>
                    <span className="w-20 text-right tabular-nums font-semibold text-slate-800">{money(costTotal(x))}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {editing && (
        <CostEditor initial={editing} contacts={[{ id: c.id, name: c.name, company: c.company, category: c.category }]} tournaments={tournaments}
          onSave={async body => !!(await save(editing.id || null, body))}
          onDelete={editing.id ? async () => { await remove(editing.id!); setEditing(null) } : undefined}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
