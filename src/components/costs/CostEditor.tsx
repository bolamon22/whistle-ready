'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import {
  COST_CATEGORIES, COST_STATUSES, categoryForContact, costTotal, itemsTotal, money, round2, taxRate,
  type CostItem, type CostView,
} from '@/lib/costTypes'
import type { ContactRow } from '@/lib/contactTypes'
import type { CostEvent } from './useCosts'

// Add or edit one cost line: a vendor's quote for one event, item by item.
// A past event that isn't in Whistle Ready is typed in by name and date, so
// old quotes can go in as history.

const field = 'border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-800 bg-white w-full min-w-0'
const METHODS: [string, string][] = [['check', 'Check'], ['credit_card', 'Credit card'], ['zelle', 'Zelle'], ['cash', 'Cash'], ['venmo', 'Venmo'], ['wire', 'Wire']]
const blankItem = (): CostItem => ({ item: '', qty: 1, unit: 0 })

export type CostDraft = Partial<CostView>

export default function CostEditor({ initial, contacts, tournaments, onSave, onDelete, onClose }: {
  initial: CostDraft
  contacts: Pick<ContactRow, 'id' | 'name' | 'company' | 'category'>[]
  tournaments: CostEvent[]
  onSave: (body: CostDraft) => Promise<boolean>
  onDelete?: () => void
  onClose: () => void
}) {
  const [c, setC] = useState<CostDraft>(() => ({
    status: 'quoted', category: 'other_exp', items: [blankItem()], tax: 0, budget: 0, ...initial,
  }))
  const [past, setPast] = useState(!!initial.id ? !initial.tournamentId : !initial.tournamentId && !!initial.eventLabel)
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (p: CostDraft) => setC(x => ({ ...x, ...p }))
  const items = c.items || []
  const setItem = (i: number, p: Partial<CostItem>) => set({ items: items.map((x, j) => j === i ? { ...x, ...p } : x) })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const sub = itemsTotal(items)
  const total = costTotal({ items, tax: c.tax || 0, budget: c.budget || 0 })
  const rate = taxRate({ items, tax: c.tax || 0 })

  function pickContact(id: string) {
    const k = contacts.find(x => x.id === id)
    set({ contactId: id, vendor: k ? (k.company || k.name) : c.vendor, ...(k && (!c.category || c.category === 'other_exp') ? { category: categoryForContact(k.category) } : {}) })
  }

  async function save() {
    setBusy(true)
    const body: CostDraft = {
      ...c,
      items: items.filter(i => i.item.trim() || i.unit),
      tournamentId: past ? '' : c.tournamentId || '',
      eventLabel: past ? c.eventLabel || '' : '',
    }
    const ok = await onSave(body)
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => !busy && onClose()} />
      <div role="dialog" aria-modal="true" aria-labelledby="cost-title" className="relative w-full sm:max-w-2xl max-h-[94vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-200">
          <h2 id="cost-title" className="flex-1 text-lg font-bold text-slate-800">{c.id ? 'Edit cost' : 'Add a cost'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Vendor
              <select value={c.contactId || ''} onChange={e => pickContact(e.target.value)} className={field}>
                <option value="">Not in Contacts</option>
                {contacts.map(k => <option key={k.id} value={k.id}>{k.company && k.company !== k.name ? `${k.company} (${k.name})` : k.name}</option>)}
              </select>
              {!c.contactId && <input value={c.vendor || ''} onChange={e => set({ vendor: e.target.value })} placeholder="Company name" aria-label="Vendor name" className={field} />}
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Event
              <select value={past ? '__past' : c.tournamentId || ''} onChange={e => { const v = e.target.value; setPast(v === '__past'); if (v !== '__past') set({ tournamentId: v }) }} className={field}>
                <option value="" disabled>Pick the event</option>
                {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}{t.firstDay ? ` (${t.firstDay.slice(0, 4)})` : ''}</option>)}
                <option value="__past">A past event not in Whistle Ready…</option>
              </select>
              {past && (
                <span className="grid grid-cols-[1fr_auto] gap-2">
                  <input value={c.eventLabel || ''} onChange={e => set({ eventLabel: e.target.value })} placeholder="e.g. Fall Classic, Tamarac" aria-label="Past event name" className={field} />
                  <input type="date" value={c.eventDate || ''} onChange={e => set({ eventDate: e.target.value })} aria-label="Past event date" className={field} />
                </span>
              )}
            </label>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Status
              <select value={c.status} onChange={e => set({ status: e.target.value as CostView['status'] })} className={field}>
                {COST_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Category
              <select value={c.category} onChange={e => set({ category: e.target.value })} className={field}>
                {COST_CATEGORIES.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Quote / invoice #
              <input value={c.quoteRef || ''} onChange={e => set({ quoteRef: e.target.value })} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Quote date
              <input type="date" value={c.quoteDate || ''} onChange={e => set({ quoteDate: e.target.value })} className={field} />
            </label>
          </div>

          <fieldset className="min-w-0">
            <legend className="text-xs font-semibold text-slate-600 mb-1">Items, as the quote lists them (delivery and setup are items too)</legend>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_4.5rem_6rem_6rem_2rem] gap-2 px-3 py-1.5 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Item</span><span className="text-right">Qty</span><span className="text-right">Each</span><span className="text-right">Line</span><span />
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_2rem] sm:grid-cols-[1fr_4.5rem_6rem_6rem_2rem] gap-2 px-3 py-2 sm:py-1.5 border-t border-slate-100 first:border-t-0 items-center">
                  <input value={it.item} onChange={e => setItem(i, { item: e.target.value })} placeholder="10x10 tent on grass" aria-label={`Item ${i + 1}`} className={`${field} col-span-3 sm:col-span-1`} />
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 min-w-0"><span className="sm:hidden">Qty</span>
                    <input type="number" min={0} step="any" inputMode="decimal" value={it.qty} onChange={e => setItem(i, { qty: Number(e.target.value) })} aria-label={`Quantity ${i + 1}`} className={`${field} text-right`} /></label>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 min-w-0"><span className="sm:hidden whitespace-nowrap">Each $</span>
                    <input type="number" min={0} step="0.01" inputMode="decimal" value={it.unit} onChange={e => setItem(i, { unit: Number(e.target.value) })} aria-label={`Price each ${i + 1}`} className={`${field} text-right`} /></label>
                  <span className="hidden sm:block text-right text-sm text-slate-700 tabular-nums">{money(round2(it.qty * it.unit))}</span>
                  <button type="button" onClick={() => set({ items: items.filter((_, j) => j !== i) })} aria-label={`Remove item ${i + 1}`} className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 justify-self-end"><Trash2 size={15} /></button>
                </div>
              ))}
              <button type="button" onClick={() => set({ items: [...items, blankItem()] })} className="w-full flex items-center gap-1.5 px-3 py-2 border-t border-slate-100 text-sm font-semibold text-teal-700 hover:bg-teal-50"><Plus size={15} />Add an item</button>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">
              <span className="flex justify-between">Tax{rate ? <span className="font-normal text-slate-500">{rate}%</span> : null}</span>
              <span className="flex gap-1.5">
                <input type="number" min={0} step="0.01" inputMode="decimal" value={c.tax || 0} onChange={e => set({ tax: Number(e.target.value) })} className={field} />
                {sub > 0 && <button type="button" onClick={() => set({ tax: round2(sub * 0.07) })} title="7% of the items" className="px-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50">7%</button>}
              </span>
            </label>
            {sub === 0 && (
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Budget amount
                <input type="number" min={0} step="0.01" inputMode="decimal" value={c.budget || 0} onChange={e => set({ budget: Number(e.target.value) })} className={field} />
              </label>
            )}
            <div className="text-right sm:col-start-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</div>
              <div className="text-xl font-bold text-slate-800 tabular-nums">{money(total)}</div>
            </div>
          </div>

          {c.status === 'paid' && (
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Paid on
                <input type="date" value={c.paidDate || ''} onChange={e => set({ paidDate: e.target.value })} className={field} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0">Paid by
                <select value={c.method || 'check'} onChange={e => set({ method: e.target.value })} className={field}>
                  {METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              {!past && <p className="col-span-2 text-xs text-slate-500">Paid lines show up in this event’s Financials as an expense.</p>}
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Notes
            <textarea rows={2} value={c.notes || ''} onChange={e => set({ notes: e.target.value })} placeholder="Terms, what's not included, who's on site…" className={`${field} resize-y`} />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-slate-200">
          {onDelete && (confirmDel
            ? <span className="mr-auto flex items-center gap-2 text-sm"><span className="text-slate-600">Delete this cost?</span>
                <button type="button" onClick={onDelete} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold">Delete</button>
                <button type="button" onClick={() => setConfirmDel(false)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700">Keep</button></span>
            : <button type="button" onClick={() => setConfirmDel(true)} className="mr-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-sm text-red-700 hover:bg-red-50"><Trash2 size={14} />Delete</button>)}
          <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
