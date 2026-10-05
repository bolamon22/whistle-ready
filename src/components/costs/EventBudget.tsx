'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Plus } from 'lucide-react'
import {
  categoryForContact, changeLabel, costStatus, costTotal, itemsTotal, lastOrder, money, paidSoFar, round2, taxRate,
  type CostView,
} from '@/lib/costTypes'
import { useContacts } from '@/components/contacts/useContacts'
import { costLabel, useCosts } from './useCosts'
import PriceHistory from './PriceHistory'
import CostEditor, { type CostDraft } from './CostEditor'

// The Budget tab on a tournament's Financials: each vendor's line for this
// event (budgeted, quoted, booked, paid) next to what the same vendor charged
// last time, and one click to budget a vendor from last time's order. Paid
// lines become expenses on the P&L, so nothing is counted twice.

const BUDGET_CATEGORIES = new Set(['venue', 'county', 'commission', 'rentals', 'food', 'officials', 'insurance', 'housing'])

export default function EventBudget({ tournamentId }: { tournamentId: string }) {
  const { data, failed, save, remove } = useCosts({ tournamentId })
  const { data: cdata } = useContacts(tournamentId)
  const [editing, setEditing] = useState<CostDraft | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const costs = useMemo(() => data?.costs || [], [data])
  const tournaments = data?.tournaments || []
  const contacts = cdata?.contacts || []
  const mine = costs.filter(c => c.tournamentId === tournamentId)

  const sum = (pred: (c: CostView) => boolean) => round2(mine.filter(pred).reduce((s, c) => s + costTotal(c), 0))
  const planned = sum(() => true)
  const committed = sum(c => c.status === 'booked' || c.status === 'paid')
  const paid = round2(mine.reduce((s, c) => s + paidSoFar(c), 0))
  const lastFor = (c: CostView) => c.contactId ? lastOrder(costs, c.contactId, tournamentId) : null
  const lastTotal = round2(mine.reduce((s, c) => { const l = lastFor(c); return s + (l ? costTotal(l) : 0) }, 0))

  // Event vendors with a past order and no line here yet: budget them from last time.
  const unbudgeted = contacts
    .filter(k => BUDGET_CATEGORIES.has(k.category) && !mine.some(c => c.contactId === k.id))
    .map(k => ({ k, last: lastOrder(costs, k.id, tournamentId) }))

  async function fromLast(last: CostView) {
    const sub = itemsTotal(last.items)
    const rate = taxRate(last)
    await save(null, {
      tournamentId, contactId: last.contactId, vendor: last.vendor, category: last.category, status: 'budget',
      items: last.items, tax: rate ? round2(sub * rate / 100) : 0,
      notes: `Budgeted from ${costLabel(last, tournaments)}${last.quoteRef ? ` (#${last.quoteRef})` : ''}.`,
    })
  }

  if (failed) return <p className="text-sm text-red-600">{failed}</p>
  if (!data) return <div className="text-center py-16 text-slate-400">Loading…</div>

  const tile = (label: string, value: number, note = '') => (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 min-w-0">
      <div className="text-lg font-bold text-slate-800 tabular-nums">{money(value)}</div>
      <div className="text-xs text-slate-500">{label}{note ? <span className="block">{note}</span> : null}</div>
    </div>
  )
  const diff = lastTotal > 0 ? (planned - lastTotal) / lastTotal : null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tile('This event', planned, `${mine.length} line${mine.length === 1 ? '' : 's'}`)}
        {tile('Booked', committed)}
        {tile('Paid', paid, 'on the P&L')}
        {tile('Same vendors last time', lastTotal, diff === null ? '' : `${changeLabel(diff) === 'same' ? 'same as' : changeLabel(diff)} this year`)}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
          <h2 className="flex-1 font-semibold text-slate-800">This event’s costs</h2>
          <button type="button" onClick={() => setEditing({ tournamentId, status: 'quoted' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold"><Plus size={15} />Add a cost</button>
        </div>
        {!mine.length && <p className="px-4 py-6 text-sm text-slate-500 text-center">Nothing budgeted yet. Add a quote, or budget a vendor from last time below.</p>}
        <ul className="divide-y divide-slate-100">
          {mine.map(c => {
            const s = costStatus(c.status)
            const last = lastFor(c)
            const t = costTotal(c), lt = last ? costTotal(last) : 0
            const ch = lt > 0 ? (t - lt) / lt : null
            const history = c.contactId ? costs.filter(x => x.contactId === c.contactId) : [c]
            const isOpen = open === c.id
            return (
              <li key={c.id}>
                <div className="flex items-center gap-2 px-4 py-2.5">
                  <button type="button" onClick={() => setOpen(isOpen ? null : c.id)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Hide' : 'Show'} price history`} className="p-0.5 rounded text-slate-400 hover:text-slate-700">
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <button type="button" onClick={() => setEditing(c)} className="flex-1 min-w-0 text-left">
                    <span className="block text-sm font-semibold text-slate-800 truncate">{c.vendor}{c.quoteRef ? <span className="font-normal text-slate-400"> · #{c.quoteRef}</span> : null}</span>
                    <span className="block text-xs text-slate-500 truncate">{last ? `Last time ${money(lt)} (${costLabel(last, tournaments)})` : 'No past order'}</span>
                  </button>
                  <span className={`hidden sm:inline px-1.5 py-0.5 rounded text-[11px] font-semibold ${s.tone}`}>{s.label}</span>
                  <span className="text-right">
                    <span className="block text-sm font-bold text-slate-800 tabular-nums">{money(t)}</span>
                    {c.status === 'booked' && c.paid > 0 && <span className="block text-[11px] text-sky-700">{money(c.paid)} paid</span>}
                    {ch !== null && <span className={`block text-[11px] ${Math.abs(ch) < 0.005 ? 'text-slate-500' : ch > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{changeLabel(ch)}</span>}
                  </span>
                </div>
                {isOpen && (
                  <div className="px-4 pb-3 pl-10">
                    {history.some(x => x.status !== 'budget' && x.items.length)
                      ? <PriceHistory costs={history} tournaments={tournaments} onOpen={x => setEditing(x)} />
                      : <p className="text-xs text-slate-500">No quotes with items yet.</p>}
                    {c.notes && <p className="mt-2 text-xs text-slate-500 whitespace-pre-line">{c.notes}</p>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      {unbudgeted.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <h2 className="px-4 py-3 border-b border-slate-100 font-semibold text-slate-800">This event’s vendors with no cost yet</h2>
          <ul className="divide-y divide-slate-100">
            {unbudgeted.map(({ k, last }) => (
              <li key={k.id} className="flex items-center gap-2 px-4 py-2.5">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">{k.company || k.name}</span>
                  <span className="block text-xs text-slate-500 truncate">{last ? `Last time ${money(costTotal(last))} (${costLabel(last, tournaments)})` : 'No past order in Costs'}</span>
                </span>
                {last
                  ? <button type="button" onClick={() => fromLast(last)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-300 bg-teal-50 text-sm font-semibold text-teal-800 hover:bg-teal-100"><Copy size={14} />Budget from last time</button>
                  : <button type="button" onClick={() => setEditing({ tournamentId, contactId: k.id, vendor: k.company || k.name, category: categoryForContact(k.category), status: 'budget' })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus size={14} />Add</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-slate-500">Budget lines copy last time’s items at last time’s prices. When the new quote comes in, update the prices and set it to Quoted; the arrow on a line shows each item’s price over the years. Mark it Paid and it’s added to the P&amp;L as an expense.</p>

      {editing && (
        <CostEditor initial={editing} contacts={contacts} tournaments={tournaments}
          onSave={async body => !!(await save(editing.id || null, body))}
          onDelete={editing.id ? async () => { await remove(editing.id!); setEditing(null) } : undefined}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
