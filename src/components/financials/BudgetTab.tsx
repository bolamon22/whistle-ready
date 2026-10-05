'use client'

import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2 } from 'lucide-react'
import type { ContactRow } from '@/lib/contactTypes'
import { categoryForContact, costTotal, itemsTotal, lastOrder, round2, taxRate, type CostView } from '@/lib/costTypes'
import { projectPL, type Finance, type PlanLine } from '@/lib/finance'
import CostEditor, { type CostDraft } from '@/components/costs/CostEditor'
import { costLabel, type CostEvent } from '@/components/costs/useCosts'
import { SectionTitle, fmt, fmtOr, moneyInput, parseMoney, pillBtn, pillBtnTeal } from './parts'

// The Budget tab: a projected P&L for the event (Bo, Oct 5 2026: "can you show
// a projected P and L? with the number up top" ... "can I add budgeted income
// too?"). Income and cost lines each take a planned amount; a line with no plan
// projects what's billed or committed so far. Amounts save when you leave the box.

const BUDGET_CATEGORIES = new Set(['venue', 'county', 'commission', 'rentals', 'food', 'officials', 'insurance', 'housing', 'safety'])

export default function BudgetTab({ tournamentId, fin, plan, costs, costEvents, contacts, onSavePlan, onSaveCost, onRemoveCost }: {
  tournamentId: string
  fin: Finance
  plan: PlanLine[]
  costs: CostView[]
  costEvents: CostEvent[]
  contacts: ContactRow[]
  onSavePlan: (lines: PlanLine[]) => Promise<boolean>
  onSaveCost: (id: string | null, body: Record<string, unknown>) => Promise<boolean>
  onRemoveCost: (id: string) => Promise<void>
}) {
  // What's typed but not saved yet, by box: 'i:<key>', 'n:<key>' (a line's name), 'c:<costId>', 'staff'.
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<CostDraft | null>(null)

  // The plan and costs with what's being typed applied, so totals move as you type.
  const livePlan: PlanLine[] = useMemo(() => {
    const out = plan.map(p => {
      const k = p.kind === 'cost' ? 'staff' : 'i:' + p.key
      const n = draft['n:' + p.key]
      return { ...p, name: n ?? p.name, planned: k in draft ? parseMoney(draft[k]) : p.planned }
    })
    for (const [k, v] of Object.entries(draft)) {
      if (k.startsWith('i:') && !out.some(p => p.kind === 'income' && 'i:' + p.key === k)) out.push({ kind: 'income', key: k.slice(2), name: '', planned: parseMoney(v) })
      if (k === 'staff' && !out.some(p => p.kind === 'cost' && p.key === 'staff')) out.push({ kind: 'cost', key: 'staff', name: 'Referees & game staff', planned: parseMoney(v) })
    }
    return out
  }, [plan, draft])
  const liveCosts = useMemo(() => costs.map(c => 'c:' + c.id in draft ? { ...c, planned: parseMoney(draft['c:' + c.id]) ?? 0 } : c), [costs, draft])
  const pl = projectPL(fin, livePlan, liveCosts, tournamentId)

  const setD = (k: string, v: string) => setDraft(d => ({ ...d, [k]: v }))
  // Saved boxes drop out of the draft; a box still being typed in keeps its text.
  const forget = (keys: string[]) => setDraft(d => { const n = { ...d }; for (const k of keys) delete n[k]; return n })
  async function commitPlan(next: PlanLine[]) {
    const sent = Object.keys(draft).filter(k => k.startsWith('i:') || k.startsWith('n:') || k === 'staff')
    const ok = await onSavePlan(next)
    if (!ok) toast.error('Could not save the budget')
    else forget(sent)
  }
  /** Leaving an income or staff box saves the plan with it. */
  function blurPlan() { void commitPlan(livePlan) }
  async function blurCost(live: CostView) {
    const k = 'c:' + live.id
    if (!(k in draft)) return
    // Compare with the saved line, not the live one (which already shows the draft).
    const c = costs.find(x => x.id === live.id) || live
    const v = parseMoney(draft[k]) ?? 0
    if (v === c.planned || await onSaveCost(c.id, { planned: v })) forget([k])
  }
  function addIncome() {
    const key = 'x' + Date.now().toString(36)
    void commitPlan([...livePlan, { kind: 'income', key, name: '', planned: null }])
  }
  function removeIncome(key: string) { void commitPlan(livePlan.filter(p => !(p.kind === 'income' && p.key === key))) }

  // Event vendors with no line yet: budget them from last time, or add one.
  const mine = costs.filter(c => c.tournamentId === tournamentId)
  const unbudgeted = contacts
    .filter(k => BUDGET_CATEGORIES.has(k.category) && !mine.some(c => c.contactId === k.id))
    .map(k => ({ k, last: lastOrder(costs, k.id, tournamentId) }))

  async function fromLast(last: CostView) {
    const sub = itemsTotal(last.items), rate = taxRate(last)
    await onSaveCost(null, {
      tournamentId, contactId: last.contactId, vendor: last.vendor, category: last.category, status: 'budget',
      items: last.items, tax: rate ? round2(sub * rate / 100) : 0, planned: costTotal(last),
      notes: `Budgeted from ${costLabel(last, costEvents)}${last.quoteRef ? ` (#${last.quoteRef})` : ''}.`,
    })
  }
  async function startFromLastYear() {
    let n = 0
    for (const c of mine) {
      const last = c.planned > 0 || !c.contactId ? null : lastOrder(costs, c.contactId, tournamentId)
      if (last) { await onSaveCost(c.id, { planned: costTotal(last) }); n++ }
    }
    for (const u of unbudgeted) if (u.last) { await fromLast(u.last); n++ }
    toast(n ? `Planned ${n} line${n === 1 ? '' : 's'} from last time` : 'Nothing from last time to copy yet', { icon: n ? '✓' : 'ℹ︎' })
  }

  const grid = 'grid grid-cols-[minmax(0,1fr)_auto_36px] sm:grid-cols-[minmax(0,2.4fr)_repeat(3,minmax(0,1fr))_36px] gap-2'
  const cgrid = 'grid grid-cols-[minmax(0,1fr)_auto_36px] sm:grid-cols-[minmax(0,2.4fr)_repeat(4,minmax(0,1fr))_36px] gap-2'
  const unplannedNote = pl.unplanned ? `${pl.unplanned} cost line${pl.unplanned === 1 ? ' has' : 's have'} no amount yet` : 'Every cost line has an amount'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <div className="flex-[2_1_420px] min-w-0 bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Projected profit</div>
          <div className={`text-5xl font-extrabold tabular-nums mt-1 ${pl.profit < 0 ? 'text-red-700' : 'text-teal-700'}`}>{fmt(pl.profit)}</div>
          <div className="text-sm text-slate-600 mt-1">{fmt(pl.incomeTotal)} projected income − {fmt(pl.costTotal)} projected costs{pl.margin !== null ? ` · ${pl.margin}% margin` : ''}</div>
        </div>
        <div className="flex-[1_1_200px] min-w-0 bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-col justify-center">
          <div className="text-2xl font-extrabold tabular-nums">{fmt(pl.incomeTotal)}</div>
          <div className="text-sm text-slate-600">Projected income</div>
        </div>
        <div className="flex-[1_1_200px] min-w-0 bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-col justify-center">
          <div className="text-2xl font-extrabold tabular-nums">{fmt(pl.costTotal)}</div>
          <div className="text-sm text-slate-600">Projected costs · {unplannedNote}</div>
        </div>
      </div>

      {/* ── Income ── */}
      <section aria-labelledby="bud-income" className="space-y-3">
        <SectionTitle id="bud-income" right={<button type="button" onClick={addIncome} className={pillBtnTeal}><Plus size={15} />Add an income line</button>}>Projected income</SectionTitle>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="sm:overflow-x-auto"><div className="sm:min-w-[640px]">
            <div className={`hidden sm:grid ${grid} px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600`}>
              <span>Source</span><span className="text-right">Projected</span><span className="text-right">Billed so far</span><span className="text-right">Collected</span><span />
            </div>
            {pl.income.map(i => {
              const k = 'i:' + i.key
              const value = k in draft ? draft[k] : i.planned === null ? '' : String(i.planned)
              return (
                <div key={i.key} className={`${grid} px-4 py-2.5 border-b border-slate-200 items-center`}>
                  <div className="min-w-0">
                    {i.custom
                      ? <input value={draft['n:' + i.key] ?? i.name} onChange={e => setD('n:' + i.key, e.target.value)} onBlur={blurPlan} aria-label="Income line name" placeholder="What is it? (sponsor, merch, gate…)" className="w-full border border-slate-300 rounded-lg px-2.5 py-2 text-sm" />
                      : <div className="font-bold">{i.name}</div>}
                    {i.note && <div className="text-sm text-slate-600 truncate">{i.note}</div>}
                    {i.billed !== null && <div className="sm:hidden text-xs text-slate-600 mt-0.5 tabular-nums">Billed {fmt(i.billed)} · Collected {fmtOr(i.collected)}</div>}
                  </div>
                  <span className="flex justify-end">
                    {i.key === 'other'
                      ? <span className="font-semibold tabular-nums py-2">{fmt(i.projected)}</span>
                      : <input inputMode="decimal" value={value} onChange={e => setD(k, e.target.value)} onBlur={blurPlan} aria-label={`Projected ${i.name || 'income'}`}
                          placeholder={i.billed ? fmt(i.billed) : '$ amount'} className={moneyInput} />}
                  </span>
                  <span className="hidden sm:block text-right tabular-nums">{fmtOr(i.billed)}</span>
                  <span className="hidden sm:block text-right tabular-nums text-teal-700">{fmtOr(i.collected)}</span>
                  <span>{i.custom && <button type="button" onClick={() => removeIncome(i.key)} aria-label={`Remove ${i.name || 'this line'}`} className="p-2 rounded text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>}</span>
                </div>
              )
            })}
            <div className={`${grid} px-4 py-3 bg-slate-50 font-extrabold tabular-nums`}>
              <span>Total income</span><span className="text-right">{fmt(pl.incomeTotal)}</span><span className="hidden sm:block text-right">{fmt(fin.income.billed)}</span><span className="hidden sm:block text-right text-teal-700">{fmt(fin.income.collected)}</span><span />
            </div>
          </div></div>
        </div>
        <p className="text-sm text-slate-600">A blank box projects what’s billed so far.</p>
      </section>

      {/* ── Costs ── */}
      <section aria-labelledby="bud-costs" className="space-y-3">
        <SectionTitle id="bud-costs" right={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={startFromLastYear} className={pillBtn}>Start from last year</button>
            <button type="button" onClick={() => setEditing({ tournamentId, status: 'budget' })} className={pillBtnTeal}><Plus size={15} />Add a cost line</button>
          </div>
        }>Planned costs</SectionTitle>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="sm:overflow-x-auto"><div className="sm:min-w-[760px]">
            <div className={`hidden sm:grid ${cgrid} px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600`}>
              <span>Line</span><span className="text-right">Planned</span><span className="text-right">Committed</span><span className="text-right">Paid</span><span className="text-right">Left in budget</span><span />
            </div>
            {pl.costs.map(r => {
              const k = r.staff ? 'staff' : 'c:' + r.id
              const value = k in draft ? draft[k] : r.planned === null ? '' : String(r.planned)
              const editable = r.staff || !!r.cost
              return (
                <div key={r.id} className={`${cgrid} px-4 py-2.5 border-b border-slate-200 items-center`}>
                  <div className="min-w-0">
                    {r.cost ? <button type="button" onClick={() => setEditing(r.cost!)} className="font-bold text-left hover:text-teal-700 hover:underline">{r.name}</button> : <div className="font-bold">{r.name}</div>}
                    <div className="text-sm text-slate-600 truncate">{r.sub}</div>
                    <div className="sm:hidden text-xs text-slate-600 mt-0.5 tabular-nums">Committed {r.committed ? fmt(r.committed) : '—'} · Paid {r.paid ? fmt(r.paid) : '—'}{r.left !== null ? ` · ${r.left < 0 ? 'over by ' + fmt(-r.left) : fmt(r.left) + ' left'}` : ''}</div>
                  </div>
                  <span className="flex justify-end">
                    {editable
                      ? <input inputMode="decimal" value={value} onChange={e => setD(k, e.target.value)} onBlur={() => r.staff ? blurPlan() : blurCost(r.cost!)}
                          aria-label={`Planned for ${r.name}`} placeholder={r.committed ? fmt(r.committed) : r.projected ? fmt(r.projected) : '$ amount'} className={moneyInput} />
                      : <span className="font-semibold tabular-nums py-2">{fmt(r.projected)}</span>}
                  </span>
                  <span className="hidden sm:block text-right tabular-nums">{r.committed ? fmt(r.committed) : '—'}</span>
                  <span className="hidden sm:block text-right tabular-nums text-teal-700">{r.paid ? fmt(r.paid) : '—'}</span>
                  <span className={`hidden sm:block text-right font-bold tabular-nums ${r.left === null ? 'text-slate-500 font-normal text-sm' : r.left < 0 ? 'text-red-700' : ''}`}>
                    {r.left === null ? (r.projected > 0 ? 'No plan' : 'Not planned') : r.left < 0 ? `Over by ${fmt(-r.left)}` : fmt(r.left)}
                  </span>
                  <span>{r.cost && r.cost.status === 'budget' && !r.cost.transactionId && <button type="button" onClick={() => onRemoveCost(r.cost!.id)} aria-label={`Remove ${r.name}`} className="p-2 rounded text-slate-400 hover:text-red-600"><Trash2 size={15} /></button>}</span>
                </div>
              )
            })}
            {!pl.costs.length && <p className="px-4 py-6 text-center text-sm text-slate-600">No cost lines yet. Add one, or start from last year.</p>}
            <div className={`${cgrid} px-4 py-3 bg-slate-50 font-extrabold tabular-nums`}>
              <span>Total costs</span><span className="text-right">{fmt(pl.costTotal)}</span><span className="hidden sm:block text-right">{fmt(fin.committed)}</span><span className="hidden sm:block text-right text-teal-700">{fmt(fin.paid)}</span><span className="hidden sm:block" /><span />
            </div>
          </div></div>
        </div>
        <p className="text-sm text-slate-600">Planned is what you expect to spend. A blank box projects what’s committed (or the line’s items). {unplannedNote}.</p>

        {unbudgeted.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <h3 className="px-4 py-3 border-b border-slate-100 font-bold">This event’s vendors with no cost line</h3>
            <ul className="divide-y divide-slate-100">
              {unbudgeted.map(({ k, last }) => (
                <li key={k.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold truncate">{k.company || k.name}</span>
                    <span className="block text-sm text-slate-600 truncate">{last ? `Last time ${fmt(costTotal(last))} (${costLabel(last, costEvents)})` : 'No past order in Costs'}</span>
                  </span>
                  {last
                    ? <button type="button" onClick={() => fromLast(last)} className={pillBtnTeal}>Plan from last time</button>
                    : <button type="button" onClick={() => setEditing({ tournamentId, contactId: k.id, vendor: k.company || k.name, category: categoryForContact(k.category), status: 'budget' })} className={pillBtn}><Plus size={14} />Add</button>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0B1F3A] text-white rounded-2xl px-5 py-4">
        <span className="font-bold">Projected profit <span className="font-normal text-slate-300">({fmt(pl.incomeTotal)} income − {fmt(pl.costTotal)} costs)</span></span>
        <span className="text-2xl font-extrabold tabular-nums">{fmt(pl.profit)}</span>
      </div>

      {editing && (
        <CostEditor initial={editing} contacts={contacts} tournaments={costEvents}
          onSave={async body => onSaveCost(editing.id || null, body as Record<string, unknown>)}
          onDelete={editing.id ? async () => { await onRemoveCost(editing.id!); setEditing(null) } : undefined}
          onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
