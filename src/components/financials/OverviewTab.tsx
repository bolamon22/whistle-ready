'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, Mail, Pencil, Plus, X } from 'lucide-react'
import type { ContactRow } from '@/lib/contactTypes'
import type { TaskTournament } from '@/lib/taskTemplate'
import { costTotal, itemsTotal, taxRate, type CostView } from '@/lib/costTypes'
import { docsFor, paymentsOf, type BillRow, type Finance, type FinDoc } from '@/lib/finance'
import PriceHistory from '@/components/costs/PriceHistory'
import CostEditor, { type CostDraft } from '@/components/costs/CostEditor'
import VendorEmailDialog from '@/components/contacts/VendorEmailDialog'
import type { CostEvent } from '@/components/costs/useCosts'
import { Expander, SectionTitle, StatusPill, fmt, pct, pillBtn, pillBtnSolid, pillBtnTeal, showDay } from './parts'

// The Overview tab of a tournament's Financials (Bo, Oct 5 2026): two profit
// numbers that don't mix rules, then Income and Bills & expenses, every row
// opening to its detail -- a bill's items, payments and documents, the clubs
// that still owe, each person on staff pay.

const METHOD: Record<string, string> = { check: 'Check', zelle: 'Zelle', credit_card: 'Credit card', cash: 'Cash', venmo: 'Venmo', wire: 'Wire', ach: 'ACH' }
const method = (m: string) => METHOD[m] || m || '—'
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

type Filter = 'all' | 'owed' | 'waiting' | 'paid'

export default function OverviewTab({ tournamentId, fin, docs, costs, costEvents, contacts, taskTournaments, contactsToday, onSaveCost, onRemoveCost, onAddIncome, onOpenOther, onPatchContact }: {
  tournamentId: string
  fin: Finance
  docs: FinDoc[]
  costs: CostView[]
  costEvents: CostEvent[]
  contacts: ContactRow[]
  taskTournaments: TaskTournament[]
  contactsToday: string
  onSaveCost: (id: string | null, body: Record<string, unknown>) => Promise<boolean>
  onRemoveCost: (id: string) => Promise<void>
  onAddIncome: () => void
  onOpenOther: () => void
  onPatchContact: (c: ContactRow, body: Record<string, unknown>) => void
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<CostDraft | null>(null)
  const [emailing, setEmailing] = useState<ContactRow | null>(null)
  const toggle = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }))

  const inc = fin.income
  const matches = (b: BillRow) => filter === 'all'
    || (filter === 'owed' && b.owed > 0.005)
    || (filter === 'waiting' && b.tone === 'waiting')
    || (filter === 'paid' && b.tone === 'paid' && b.committed > 0)
  const counts: Record<Filter, number> = {
    all: fin.bills.length,
    owed: fin.bills.filter(b => b.owed > 0.005).length,
    waiting: fin.bills.filter(b => b.tone === 'waiting').length,
    paid: fin.bills.filter(b => b.tone === 'paid' && b.committed > 0).length,
  }
  const bills = fin.bills.filter(matches)
  const waitingNames = fin.bills.filter(b => b.tone === 'waiting').map(b => b.name)

  const incomeRows: { id: string; name: string; sub: string; billed: number; collected: number; body: JSX.Element }[] = [
    {
      id: 'teams', name: 'Team fees', sub: `${inc.teams.regs} registration${inc.teams.regs === 1 ? '' : 's'} · ${inc.teams.teamCount} teams`,
      billed: inc.teams.billed, collected: inc.teams.collected,
      body: (
        <div className="space-y-3">
          {inc.teams.owing.length > 0 ? (
            <div className="border border-slate-200 rounded-xl overflow-hidden max-w-xl">
              <div className="px-3 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">{inc.teams.owing.length} club{inc.teams.owing.length === 1 ? '' : 's'} still owe</div>
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                {inc.teams.owing.map(c => (
                  <div key={c.id} className="flex justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate">{c.club}<span className="text-slate-500"> · {c.teams} team{c.teams === 1 ? '' : 's'} · {method(c.method)}{c.paid > 0 ? ` · ${fmt(c.paid)} paid` : ''}</span></span>
                    <span className="font-semibold tabular-nums">{fmt(c.owed)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-slate-600">Every club is paid up.</p>}
          {(inc.teams.zero.length > 0 || inc.teams.dups.length > 0) && (
            <p className="text-sm text-slate-700 max-w-2xl">
              <b>Check:</b>{' '}
              {inc.teams.zero.length > 0 && <>{inc.teams.zero.length} registration{inc.teams.zero.length === 1 ? ' is' : 's are'} billed $0 ({inc.teams.zero.join(', ')}). </>}
              {inc.teams.dups.length > 0 && <>These look entered twice: {inc.teams.dups.map(g => g.join(' / ')).join('; ')}. </>}
              <Link href={`/tournaments/${tournamentId}/registrations`} className="font-semibold text-teal-700 hover:underline">Open Team Fees</Link>
            </p>
          )}
        </div>
      ),
    },
  ]
  if (inc.players.count > 0) incomeRows.push({
    id: 'players', name: 'Individual players', sub: `${inc.players.count} player${inc.players.count === 1 ? '' : 's'}`,
    billed: inc.players.billed, collected: inc.players.collected,
    body: <p className="text-sm text-slate-600">Paid players count as collected.</p>,
  })
  if (inc.booths.rows.length > 0) incomeRows.push({
    id: 'booths', name: 'Vendor booths', sub: `${inc.booths.rows.filter(b => b.status === 'approved').length} approved · ${inc.booths.rows.filter(b => b.status !== 'approved').length} not approved yet`,
    billed: inc.booths.billed, collected: inc.booths.collected,
    body: (
      <div className="border border-slate-200 rounded-xl overflow-hidden max-w-xl divide-y divide-slate-100">
        {inc.booths.rows.map((b, i) => (
          <div key={i} className="flex justify-between gap-3 px-3 py-2 text-sm">
            <span className="min-w-0 truncate">{b.name}<span className="text-slate-500"> · {b.status === 'approved' ? (b.paid ? 'approved, paid' : 'approved, unpaid') : 'not approved or priced yet'}</span></span>
            <span className="font-semibold tabular-nums">{b.status === 'approved' ? fmt(b.amount) : '—'}</span>
          </div>
        ))}
        <div className="px-3 py-2 text-sm"><Link href={`/tournaments/${tournamentId}/vendor-requests`} className="font-semibold text-teal-700 hover:underline">Open Vendors</Link></div>
      </div>
    ),
  })
  if (inc.other.rows.length > 0) incomeRows.push({
    id: 'other', name: 'Other income', sub: `${inc.other.rows.length} entr${inc.other.rows.length === 1 ? 'y' : 'ies'} on Other entries`,
    billed: inc.other.billed, collected: inc.other.billed,
    body: (
      <div className="border border-slate-200 rounded-xl overflow-hidden max-w-xl divide-y divide-slate-100">
        {inc.other.rows.map(t => (
          <div key={t.id} className="flex justify-between gap-3 px-3 py-2 text-sm"><span className="min-w-0 truncate">{t.description}<span className="text-slate-500"> · {showDay(t.date)} · {method(t.method)}</span></span><span className="font-semibold tabular-nums">{fmt(t.amount)}</span></div>
        ))}
        <div className="px-3 py-2 text-sm"><button type="button" onClick={onOpenOther} className="font-semibold text-teal-700 hover:underline">Edit on Other entries</button></div>
      </div>
    ),
  })

  const grid = 'grid grid-cols-[44px_minmax(0,2.4fr)_repeat(3,minmax(0,1fr))] gap-2'
  const billGrid = 'grid grid-cols-[44px_minmax(0,2.4fr)_repeat(4,minmax(0,1fr))] gap-2'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => setEditing({ tournamentId, status: 'quoted' })} className={pillBtn}><Plus size={15} />Add a bill</button>
        <button type="button" onClick={onAddIncome} className={pillBtn}><Plus size={15} />Add income</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Profit when everything is collected and paid</div>
          <div className={`text-4xl font-extrabold tabular-nums mt-1 ${fin.profitAll < 0 ? 'text-red-700' : 'text-teal-700'}`}>{fmt(fin.profitAll)}</div>
          <div className="text-sm text-slate-600 mt-1">
            {fmt(inc.billed)} billed − {fmt(fin.committed)} committed.
            {waitingNames.length > 0 && <> {waitingNames.length === 1 ? 'One bill isn’t' : `${waitingNames.length} bills aren’t`} in yet ({waitingNames.join(', ')}), so this will come down.</>}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Cash in hand today</div>
          <div className={`text-4xl font-extrabold tabular-nums mt-1 ${fin.cash < 0 ? 'text-red-700' : 'text-slate-900'}`}>{fmt(fin.cash)}</div>
          <div className="text-sm text-slate-600 mt-1">{fmt(inc.collected)} collected − {fmt(fin.paid)} paid out.</div>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <div className="text-xl font-extrabold tabular-nums">{fmt(inc.outstanding)}</div>
          <div className="text-sm text-slate-600">Still to collect{inc.teams.owing.length ? ` (${inc.teams.owing.length} club${inc.teams.owing.length === 1 ? '' : 's'})` : ''}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <div className="text-xl font-extrabold tabular-nums text-amber-700">{fmt(fin.owed)}</div>
          <div className="text-sm text-slate-600">Still to pay</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
          <div className="text-xl font-extrabold tabular-nums">{fin.waiting}</div>
          <div className="text-sm text-slate-600">Bill{fin.waiting === 1 ? '' : 's'} waiting to come in</div>
        </div>
      </div>

      {/* ── Income ── */}
      <section aria-labelledby="fin-income" className="space-y-3">
        <SectionTitle id="fin-income">Income</SectionTitle>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="sm:overflow-x-auto"><div className="sm:min-w-[640px]">
            <div className={`hidden sm:grid ${grid} px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600`}>
              <span /><span>Source</span><span className="text-right">Billed</span><span className="text-right">Collected</span><span className="text-right">Outstanding</span>
            </div>
            {incomeRows.map(r => (
              <div key={r.id} className="border-b border-slate-200">
                <div className="sm:hidden px-3 py-3 flex gap-3">
                  <Expander open={!!open['i:' + r.id]} onClick={() => toggle('i:' + r.id)} label={`${open['i:' + r.id] ? 'Hide' : 'Show'} ${r.name} detail`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold">{r.name}</div><div className="text-sm text-slate-600">{r.sub}</div>
                    <MiniAmounts items={[['Billed', fmt(r.billed), ''], ['Collected', fmt(r.collected), 'text-teal-700'], ['Owed', fmt(r.billed - r.collected), 'text-amber-700 font-bold']]} />
                  </div>
                </div>
                <div className={`hidden sm:grid ${grid} px-4 py-3 items-center`}>
                  <Expander open={!!open['i:' + r.id]} onClick={() => toggle('i:' + r.id)} label={`${open['i:' + r.id] ? 'Hide' : 'Show'} ${r.name} detail`} />
                  <div className="min-w-0"><div className="font-bold">{r.name}</div><div className="text-sm text-slate-600 truncate">{r.sub}</div></div>
                  <span className="text-right font-semibold tabular-nums">{fmt(r.billed)}</span>
                  <span className="text-right tabular-nums text-teal-700">{fmt(r.collected)}</span>
                  <span className="text-right font-bold tabular-nums text-amber-700">{fmt(r.billed - r.collected)}</span>
                </div>
                {open['i:' + r.id] && <div className="px-3 sm:pl-[68px] sm:pr-4 pb-4">{r.body}</div>}
              </div>
            ))}
            <div className="sm:hidden px-3 py-3 bg-slate-50"><div className="font-extrabold">Total</div>
              <MiniAmounts items={[['Billed', fmt(inc.billed), 'font-extrabold'], ['Collected', fmt(inc.collected), 'text-teal-700 font-extrabold'], ['Owed', fmt(inc.outstanding), 'text-amber-700 font-extrabold']]} /></div>
            <div className={`hidden sm:grid ${grid} px-4 py-3 bg-slate-50 font-extrabold tabular-nums`}>
              <span /><span>Total</span><span className="text-right">{fmt(inc.billed)}</span><span className="text-right text-teal-700">{fmt(inc.collected)}</span><span className="text-right text-amber-700">{fmt(inc.outstanding)}</span>
            </div>
          </div></div>
        </div>
      </section>

      {/* ── Bills & expenses ── */}
      <section aria-labelledby="fin-bills" className="space-y-3">
        <SectionTitle id="fin-bills" right={
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
            {([['all', 'All'], ['owed', 'Owed'], ['waiting', 'Waiting on a bill'], ['paid', 'Paid in full']] as [Filter, string][]).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                className={`min-h-[40px] px-3.5 rounded-full text-sm font-semibold border ${filter === k ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{l} ({counts[k]})</button>
            ))}
          </div>
        }>Bills &amp; expenses</SectionTitle>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="sm:overflow-x-auto"><div className="sm:min-w-[720px]">
            <div className={`hidden sm:grid ${billGrid} px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-600`}>
              <span /><span>Vendor</span><span className="text-right">Committed</span><span className="text-right">Paid</span><span className="text-right">Owed</span><span className="text-right">vs last time</span>
            </div>
            {bills.map(b => (
              <div key={b.id} className="border-b border-slate-200">
                <div className="sm:hidden px-3 py-3 flex gap-3">
                  <Expander open={!!open[b.id]} onClick={() => toggle(b.id)} label={`${open[b.id] ? 'Hide' : 'Show'} ${b.name} detail`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{b.name}</span><StatusPill tone={b.tone}>{b.status}</StatusPill></div>
                    <div className="text-sm text-slate-600">{b.sub}</div>
                    <MiniAmounts items={[['Committed', b.committed ? fmt(b.committed) : '—', ''], ['Paid', b.paid ? fmt(b.paid) : '—', 'text-teal-700'], ['Owed', b.owed ? fmt(b.owed) : '—', 'text-amber-700 font-bold']]} />
                    {b.last && <div className="text-xs text-slate-600 mt-1">{pct(b.last.change)}{b.last.change !== null ? ' · ' : ''}{fmt(b.last.total)} last time</div>}
                  </div>
                </div>
                <div className={`hidden sm:grid ${billGrid} px-4 py-3 items-center`}>
                  <Expander open={!!open[b.id]} onClick={() => toggle(b.id)} label={`${open[b.id] ? 'Hide' : 'Show'} ${b.name} detail`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-bold">{b.name}</span><StatusPill tone={b.tone}>{b.status}</StatusPill></div>
                    <div className="text-sm text-slate-600 truncate">{b.sub}</div>
                  </div>
                  <span className="text-right font-semibold tabular-nums">{b.committed ? fmt(b.committed) : '—'}</span>
                  <span className="text-right tabular-nums text-teal-700">{b.paid ? fmt(b.paid) : '—'}</span>
                  <span className="text-right font-bold tabular-nums text-amber-700">{b.owed ? fmt(b.owed) : '—'}</span>
                  <span className="text-right text-sm text-slate-600">{b.last ? `${pct(b.last.change)}${b.last.change !== null ? ' · ' : ''}${fmt(b.last.total)} last time` : b.kind === 'vendor' ? 'No history yet' : ''}</span>
                </div>
                {open[b.id] && (
                  <div className="px-3 sm:pl-[68px] sm:pr-4 pb-5">
                    {b.kind === 'vendor' && b.cost && (
                      <VendorDetail c={b.cost} bill={b} tournamentId={tournamentId} docs={docsFor(b.cost, docs)}
                        history={b.cost.contactId ? costs.filter(x => x.contactId === b.cost!.contactId) : [b.cost]} costEvents={costEvents}
                        contact={contacts.find(k => k.id === b.cost!.contactId) || null}
                        onSave={body => onSaveCost(b.cost!.id, body)} onEdit={() => setEditing(b.cost!)}
                        onEmail={k => setEmailing(k)} />
                    )}
                    {b.kind === 'staff' && <StaffDetail fin={fin} tournamentId={tournamentId} />}
                    {b.kind === 'manual' && b.tx && (
                      <p className="text-sm text-slate-700">{showDay(b.tx.date)} · {method(b.tx.method)}{b.tx.notes ? ` · ${b.tx.notes}` : ''} · <button type="button" onClick={onOpenOther} className="font-semibold text-teal-700 hover:underline">Edit on Other entries</button></p>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!bills.length && <p className="px-4 py-6 text-center text-sm text-slate-600">{fin.bills.length ? 'Nothing here.' : 'No bills yet. Add a vendor’s quote or invoice with Add a bill.'}</p>}
            <div className="sm:hidden px-3 py-3 bg-slate-50"><div className="font-extrabold">Total (all bills)</div>
              <MiniAmounts items={[['Committed', fmt(fin.committed), 'font-extrabold'], ['Paid', fmt(fin.paid), 'text-teal-700 font-extrabold'], ['Owed', fmt(fin.owed), 'text-amber-700 font-extrabold']]} /></div>
            <div className={`hidden sm:grid ${billGrid} px-4 py-3 bg-slate-50 font-extrabold tabular-nums`}>
              <span /><span>Total (all bills)</span><span className="text-right">{fmt(fin.committed)}</span><span className="text-right text-teal-700">{fmt(fin.paid)}</span><span className="text-right text-amber-700">{fmt(fin.owed)}</span><span />
            </div>
          </div></div>
        </div>
      </section>

      {editing && (
        <CostEditor initial={editing} contacts={contacts} tournaments={costEvents}
          onSave={async body => onSaveCost(editing.id || null, body as Record<string, unknown>)}
          onDelete={editing.id ? async () => { await onRemoveCost(editing.id!); setEditing(null) } : undefined}
          onClose={() => setEditing(null)} />
      )}
      {emailing && (
        <VendorEmailDialog contact={emailing} tournaments={taskTournaments} today={contactsToday} tournamentId={tournamentId}
          onClose={() => setEmailing(null)} onPatch={body => onPatchContact(emailing, body)} />
      )}
    </div>
  )
}

function VendorDetail({ c, bill, tournamentId, docs, history, costEvents, contact, onSave, onEdit, onEmail }: {
  c: CostView; bill: BillRow; tournamentId: string; docs: FinDoc[]; history: CostView[]; costEvents: CostEvent[]
  contact: ContactRow | null
  onSave: (body: Record<string, unknown>) => Promise<boolean>
  onEdit: () => void; onEmail: (k: ContactRow) => void
}) {
  const [paying, setPaying] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [pay, setPay] = useState({ amount: '', date: today(), method: c.method || 'check', ref: '' })
  const [busy, setBusy] = useState(false)
  const payments = paymentsOf(c)
  const total = costTotal(c)
  const sub = itemsTotal(c.items)
  const balance = Math.max(0, Math.round((total - bill.paid) * 100) / 100)
  const field = 'border border-slate-300 rounded-lg px-2.5 py-2 text-sm min-w-0 w-full'

  async function save() {
    const amount = parseFloat(pay.amount.replace(/[$,\s]/g, ''))
    if (!(amount > 0)) return
    setBusy(true)
    const ok = await onSave({ addPayment: { amount, date: pay.date, method: pay.method, ref: pay.ref } })
    setBusy(false)
    if (ok) { setPaying(false); setPay(p => ({ ...p, amount: '', ref: '' })) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-start">
        {c.items.length > 0 ? (
          <div className="flex-[2_1_380px] min-w-0 border border-slate-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_56px_84px_100px] gap-2 px-3 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
              <span className="truncate">{c.quoteRef ? `Quote #${c.quoteRef}` : 'Items'}{c.quoteDate ? ` · ${showDay(c.quoteDate)}` : ''}</span><span className="text-right">Qty</span><span className="text-right">Each</span><span className="text-right">Line</span>
            </div>
            {c.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_56px_84px_100px] gap-2 px-3 py-2 border-t border-slate-100 text-sm tabular-nums">
                <span className="min-w-0">{it.item}</span><span className="text-right">{it.qty}</span><span className="text-right">{fmt(it.unit)}</span><span className="text-right">{fmt(it.qty * it.unit)}</span>
              </div>
            ))}
            {c.tax > 0 && (
              <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2 px-3 py-1.5 border-t border-slate-200 text-sm text-slate-600 tabular-nums">
                <span>Subtotal</span><span className="text-right">{fmt(sub)}</span>
                <span>Sales tax{taxRate(c) ? ` (${taxRate(c)}%)` : ''}</span><span className="text-right">{fmt(c.tax)}</span>
              </div>
            )}
            <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2 px-3 py-2 border-t border-slate-200 font-extrabold tabular-nums"><span>Total</span><span className="text-right">{fmt(total)}</span></div>
          </div>
        ) : (
          <div className="flex-[2_1_380px] min-w-0 border border-dashed border-slate-300 rounded-xl px-4 py-5 text-sm text-slate-600">
            {c.status === 'budget' ? 'No bill yet. When the quote or invoice comes in, add its items and set it to Quoted or Booked.' : `Total ${fmt(total)}. Add the items from the bill to compare prices next year.`}
          </div>
        )}

        <div className="flex-[1_1_260px] min-w-0 space-y-3">
          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Payments</div>
            {payments.length === 0 && <p className="text-sm text-slate-600">None yet.</p>}
            {payments.map((p, i) => (
              <div key={i} className="flex justify-between items-start gap-2 text-sm">
                <span className="min-w-0">{showDay(p.date) || 'No date'} · {method(p.method)}{p.ref ? <span className="block text-xs text-slate-500">Ref {p.ref}</span> : null}</span>
                <span className="flex items-center gap-1">
                  <span className="font-bold text-teal-700 tabular-nums">{fmt(p.amount)}</span>
                  {c.payments.length > 0 && <button type="button" onClick={() => onSave({ removePayment: i })} aria-label={`Remove the ${fmt(p.amount)} payment`} className="p-1 rounded text-slate-400 hover:text-red-600"><X size={14} /></button>}
                </span>
              </div>
            ))}
            {bill.committed > 0 && (
              <div className="flex justify-between gap-2 text-sm border-t border-slate-100 pt-2">
                <span>Balance</span><span className="font-extrabold text-amber-700 tabular-nums">{fmt(balance)}</span>
              </div>
            )}
            {bill.committed > 0 && balance > 0 && !paying && (
              <button type="button" onClick={() => { setPaying(true); setPay(p => ({ ...p, amount: balance.toFixed(2) })) }} className={`${pillBtnSolid} w-full`}>Record a payment</button>
            )}
            {paying && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Amount<input inputMode="decimal" value={pay.amount} onChange={e => setPay(p => ({ ...p, amount: e.target.value }))} className={field} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Date<input type="date" value={pay.date} onChange={e => setPay(p => ({ ...p, date: e.target.value }))} className={field} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Method
                  <select value={pay.method} onChange={e => setPay(p => ({ ...p, method: e.target.value }))} className={`${field} bg-white`}>
                    {['zelle', 'check', 'credit_card', 'cash', 'venmo', 'wire'].map(m => <option key={m} value={m}>{method(m)}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Reference #<input value={pay.ref} onChange={e => setPay(p => ({ ...p, ref: e.target.value }))} placeholder="Zelle or check #" className={field} /></label>
                <div className="col-span-2 flex gap-2">
                  <button type="button" onClick={save} disabled={busy} className={`${pillBtnSolid} flex-1 disabled:opacity-60`}>{busy ? 'Saving…' : 'Save payment'}</button>
                  <button type="button" onClick={() => setPaying(false)} className={pillBtn}>Cancel</button>
                </div>
              </div>
            )}
          </div>
          <div className="border border-slate-200 rounded-xl p-3 space-y-1.5">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-600">Documents</div>
            {docs.length ? docs.map(d => (
              <a key={d.id} href={`/api/tournaments/${tournamentId}/documents/${d.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-semibold text-teal-700 hover:underline min-w-0"><FileText size={14} className="flex-shrink-0" /><span className="truncate">{d.name}</span></a>
            )) : <p className="text-sm text-slate-600">None filed. <Link href={`/tournaments/${tournamentId}/documents`} className="font-semibold text-teal-700 hover:underline">Add one in Documents</Link></p>}
          </div>
        </div>
      </div>
      {c.notes && <p className="text-sm text-slate-700 whitespace-pre-line max-w-3xl">{c.notes}</p>}
      {bill.last && <p className="text-sm text-slate-700"><b>Last time:</b> {fmt(bill.last.total)} ({bill.last.label}).</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onEdit} className={pillBtn}><Pencil size={14} />Edit bill</button>
        {contact?.email && <button type="button" onClick={() => onEmail(contact)} className={pillBtn}><Mail size={14} />Email {contact.name.split(/\s+/)[0]}</button>}
        {history.filter(h => h.status !== 'budget' && h.items.length).length > 1 && <button type="button" onClick={() => setShowHistory(s => !s)} aria-expanded={showHistory} className={pillBtnTeal}>{showHistory ? 'Hide price history' : 'Price history'}</button>}
      </div>
      {showHistory && <div className="max-w-3xl"><PriceHistory costs={history} tournaments={costEvents} /></div>}
    </div>
  )
}

function StaffDetail({ fin, tournamentId }: { fin: Finance; tournamentId: string }) {
  const [show, setShow] = useState(false)
  const s = fin.staff
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-700 max-w-3xl">
        {s.refs > 0 && <>{s.refs} referee line{s.refs === 1 ? '' : 's'} ({fmt(s.refsPay)})</>}{s.refs > 0 && s.others > 0 && ' and '}{s.others > 0 && <>{s.others} other ({fmt(s.othersPay)})</>}, paid after the event by each person’s own method.
        {s.dups.length > 0 && <> <b className="text-amber-800">Heads up:</b> {s.dups.map(g => Array.from(new Set(g)).join(' / ')).join(', ')} {s.dups.length === 1 ? 'shows' : 'show'} up more than once. Check they’re the same person and merge them in Staff Pool before paying, so each gets one payment.</>}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setShow(v => !v)} aria-expanded={show} className={pillBtnTeal}>{show ? 'Hide each person' : `Show each person (${s.rows.length})`}</button>
        <Link href={`/tournaments/${tournamentId}/pay-summary`} className={pillBtn}>Open Staff Pay</Link>
      </div>
      {show && (
        <div className="border border-slate-200 rounded-xl overflow-hidden max-w-3xl">
          <div className="overflow-x-auto"><div className="min-w-[560px]">
            <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_64px_90px_100px] gap-2 px-3 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-600">
              <span>Name</span><span>Role</span><span className="text-right">Games</span><span>Pay by</span><span className="text-right">Owed</span>
            </div>
            {s.rows.map((r, i) => (
              <div key={r.id + i} className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_64px_90px_100px] gap-2 px-3 py-1.5 border-t border-slate-100 text-sm tabular-nums">
                <span className={`min-w-0 truncate ${r.dup ? 'font-bold text-amber-800' : 'font-semibold'}`}>{r.name}</span>
                <span className="text-slate-600 truncate">{r.role}</span>
                <span className="text-right">{r.games}</span>
                <span className="text-slate-600">{method(r.method)}</span>
                <span className={`text-right font-semibold ${r.paid ? 'text-teal-700' : ''}`}>{r.paid ? 'Paid' : fmt(r.pay)}</span>
              </div>
            ))}
          </div></div>
        </div>
      )}
    </div>
  )
}

/** Three labelled amounts in a row: a table row's numbers on a phone. */
function MiniAmounts({ items }: { items: [string, string, string][] }) {
  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {items.map(([label, value, cls]) => (
        <div key={label} className="min-w-0"><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className={`text-sm tabular-nums truncate ${cls}`}>{value}</div></div>
      ))}
    </div>
  )
}
