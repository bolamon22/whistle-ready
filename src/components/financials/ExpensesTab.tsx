'use client'

import { Fragment, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Check, Download, FileText, Pencil, Phone, Plus, Receipt, TriangleAlert, X } from 'lucide-react'
import ExpenseForm, { payoutLine, type FormPerson } from '@/components/expenses/ExpenseForm'
import {
  byCategory, categoryLabel, expensesCsv, expenseState, expenseTotals, isPayBackMethod, owedByPerson, paidWithLabel, PAY_BACK_METHODS,
  possibleDuplicates, receiptMismatch, STATE_LABEL, STATE_TONE, type ExpenseState, type ExpenseView, type OwedPerson,
} from '@/lib/expenseTypes'
import { patchExpense, receiptUrl, shortDay, usd } from '@/lib/receiptClient'
import { SectionTitle, pillBtn } from './parts'

// The Expenses tab of a tournament's Financials (Bo, Oct 20 2026): the receipts staff
// turned in from their phones and the ones the office adds, what is waiting for
// approval, who is owed and how they get paid, and every receipt with its photo.
// Data: /api/expenses (lib/eventExpenses). An approved receipt is a cost on the
// Overview (lib/finance, "Receipts & purchases").

type Filter = 'all' | ExpenseState
const FILTERS: [Filter, string][] = [['all', 'All'], ['waiting', 'Waiting'], ['owed', 'To pay back'], ['paid_back', 'Paid back'], ['company', 'Company paid'], ['declined', 'Not approved']]

export default function ExpensesTab({ tournamentId, eventName, expenses, people, today, onChanged }: {
  tournamentId: string
  eventName: string
  expenses: ExpenseView[]
  people: FormPerson[]
  today: string
  onChanged: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<ExpenseView | 'new' | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [paying, setPaying] = useState<string | null>(null)   // an OwedPerson key

  const totals = useMemo(() => expenseTotals(expenses), [expenses])
  const owed = useMemo(() => owedByPerson(expenses), [expenses])
  const dups = useMemo(() => possibleDuplicates(expenses), [expenses])
  const cats = useMemo(() => byCategory(expenses), [expenses])
  const waiting = expenses.filter(e => expenseState(e) === 'waiting')
  const shown = expenses.filter(e => filter === 'all' || expenseState(e) === filter)
  const count = (f: Filter) => (f === 'all' ? expenses.length : expenses.filter(e => expenseState(e) === f).length)
  const open = expenses.find(e => e.id === openId) || null
  const personOf = (e: { workerId: string }) => people.find(p => p.id === e.workerId) || null

  async function act(e: ExpenseView, body: Record<string, unknown>, done: string): Promise<boolean> {
    try { await patchExpense(e.id, body); toast.success(done); onChanged(); return true } catch (x) { toast.error(x instanceof Error ? x.message : 'Couldn’t save that'); return false }
  }
  async function payBack(p: OwedPerson, method: string, on: string, note: string) {
    try {
      const res = await fetch('/api/expenses/pay-back', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: p.ids, method, on, note }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || 'Couldn’t save that')
      toast.success(`${p.personName} marked paid back`)
      setPaying(null); onChanged()
    } catch (x) { toast.error(x instanceof Error ? x.message : 'Couldn’t save that') }
  }
  function download() {
    const blob = new Blob([expensesCsv(expenses, eventName)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `Receipts - ${eventName || 'event'}.csv`.replace(/[\\/:*?"<>|]+/g, ' ')
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  return (
    <>
    <div data-expenses className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 max-w-xl">What staff bought for this event. They turn in receipts from their staff home; you approve them and mark who you paid back.</p>
        <div className="flex flex-wrap gap-2">
          {expenses.length > 0 && <button type="button" onClick={download} className={pillBtn}><Download size={15} />Download</button>}
          <button type="button" onClick={() => setEditing('new')} className={pillBtn}><Plus size={15} />Add an expense</button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Tile value={usd(totals.spent)} label="Spent (approved)" />
        <Tile value={usd(totals.owed)} label={`To pay back${owed.length ? ` to ${owed.length} ${owed.length === 1 ? 'person' : 'people'}` : ''}`} tone="text-amber-700" />
        <Tile value={String(totals.waiting.count)} label={`Waiting for approval${totals.waiting.count ? ` (${usd(totals.waiting.amount)})` : ''}`} />
        <Tile value={usd(totals.paidBack)} label="Paid back" tone="text-teal-700" />
      </div>
      {cats.length > 0 && (
        <p className="text-sm text-slate-600 -mt-3">{cats.map(c => `${c.label} ${usd(c.amount)}`).join(' · ')}</p>
      )}

      {waiting.length > 0 && (
        <section aria-labelledby="exp-waiting" className="space-y-3">
          <SectionTitle id="exp-waiting">Waiting for approval</SectionTitle>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {waiting.map(e => (
              <div key={e.id} className="min-w-0 bg-white border border-slate-200 rounded-2xl p-4 flex gap-3">
                <Thumb e={e} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => setOpenId(e.id)} className="min-w-0 text-left font-bold text-slate-900 hover:text-teal-700 sm:truncate">{e.what}</button>
                    <span className="font-extrabold tabular-nums">{usd(e.amount)}</span>
                  </div>
                  <p className="text-sm text-slate-600 sm:truncate">{e.personName} · {[e.vendor, shortDay(e.purchasedOn)].filter(Boolean).join(' · ')}</p>
                  <p className="text-xs text-slate-500">{paidWithLabel(e.paidWith)}{e.notes ? ` · ${e.notes}` : ''}</p>
                  <Flags e={e} dups={dups} all={expenses} />
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    <button type="button" onClick={() => act(e, { action: 'approve' }, 'Approved')} className="inline-flex items-center gap-1 min-h-[36px] px-3.5 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold"><Check size={15} />Approve</button>
                    <button type="button" onClick={() => setOpenId(e.id)} className="inline-flex items-center gap-1 min-h-[36px] px-3.5 rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">Open</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {owed.length > 0 && (
        <section aria-labelledby="exp-owed" className="space-y-3">
          <SectionTitle id="exp-owed">Who to pay back</SectionTitle>
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-200 overflow-hidden">
            {owed.map(p => {
              const who = people.find(x => x.id === p.workerId) || null
              return (
                <div key={p.key} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1 basis-full sm:basis-0">
                      <div className="font-bold text-slate-900">{p.personName}</div>
                      <div className="text-sm text-slate-600">
                        {p.ids.length} receipt{p.ids.length === 1 ? '' : 's'}{who ? ` · ${payoutLine(who)}` : ' · not in the Staff Pool'}
                        {p.waiting > 0 && ` · plus ${usd(p.waiting)} waiting for approval`}
                      </div>
                    </div>
                    {who?.phone && <a href={`tel:${who.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${p.personName}`} className="p-2 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50"><Phone size={16} /></a>}
                    <span className="text-lg font-extrabold tabular-nums text-amber-700">{usd(p.amount)}</span>
                    {paying !== p.key && <button type="button" onClick={() => setPaying(p.key)} className="inline-flex items-center gap-1 min-h-[40px] px-4 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold">Mark paid back</button>}
                  </div>
                  {paying === p.key && (
                    <PayBackForm amount={p.amount} today={today} method={who?.payMethod} onCancel={() => setPaying(null)} onSave={(m, on, note) => payBack(p, m, on, note)} />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="exp-all" className="space-y-3">
        <SectionTitle id="exp-all" right={
          <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
            {FILTERS.filter(([k]) => k === 'all' || count(k) > 0).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
                className={`min-h-[40px] px-3.5 rounded-full text-sm font-semibold border ${filter === k ? 'bg-teal-600 border-teal-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{l} ({count(k)})</button>
            ))}
          </div>
        }>All receipts</SectionTitle>
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {shown.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="flex justify-center mb-2 text-slate-300"><Receipt size={36} /></div>
              <p className="font-semibold text-slate-700">{expenses.length ? 'Nothing here.' : 'No receipts yet'}</p>
              {!expenses.length && <p className="text-sm text-slate-500 mt-1">Staff turn them in from their staff home, under Receipts. You can add one with Add an expense.</p>}
            </div>
          ) : shown.map(e => {
            const st = expenseState(e)
            return (
              <button key={e.id} type="button" onClick={() => setOpenId(e.id)} className="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                <Thumb e={e} small />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900 sm:truncate">{e.what}</span>
                  <span className="block text-sm text-slate-600 sm:truncate">{e.personName} · {[e.vendor, shortDay(e.purchasedOn), categoryLabel(e.category)].filter(Boolean).join(' · ')}</span>
                  <span className={`flex flex-wrap gap-1.5 mt-1 ${dups.has(e.id) || receiptMismatch(e) !== null || !e.receiptId ? '' : 'sm:hidden'}`}>
                    <span className={`sm:hidden inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${STATE_TONE[st]}`}>{STATE_LABEL[st]}</span>
                    {dups.has(e.id) && <Chip tone="amber">Possible duplicate</Chip>}
                    {receiptMismatch(e) !== null && <Chip tone="amber">Receipt says {usd(receiptMismatch(e)!)}</Chip>}
                    {!e.receiptId && <Chip tone="slate">No receipt</Chip>}
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block font-bold tabular-nums">{usd(e.amount)}</span>
                  <span className={`hidden sm:inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${STATE_TONE[st]}`}>{STATE_LABEL[st]}</span>
                </span>
              </button>
            )
          })}
        </div>
        {totals.count > 0 && <p className="text-sm text-slate-600">Approved receipts count as a cost on the Overview, under Receipts &amp; purchases.</p>}
      </section>
    </div>

      {open && (
        <Detail e={open} all={expenses} dups={dups} person={personOf(open)} today={today}
          onClose={() => setOpenId(null)} onEdit={() => { setEditing(open); setOpenId(null) }}
          onAct={(body, done) => act(open, body, done)} />
      )}
      {editing && (
        <ExpenseForm mode="office" events={[{ id: tournamentId, name: eventName }]} people={people} today={today}
          initial={editing === 'new' ? null : editing}
          onSaved={() => { toast.success(editing === 'new' ? 'Added' : 'Saved'); setEditing(null); onChanged() }}
          onDeleted={() => { toast.success('Deleted'); setEditing(null); onChanged() }}
          onClose={() => setEditing(null)} />
      )}
    </>
  )
}

function Tile({ value, label, tone = '' }: { value: string; label: string; tone?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
      <div className={`text-xl font-extrabold tabular-nums ${tone}`}>{value}</div>
      <div className="text-sm text-slate-600">{label}</div>
    </div>
  )
}

function Chip({ tone, children }: { tone: 'amber' | 'slate'; children: ReactNode }) {
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${tone === 'amber' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{children}</span>
}

function Thumb({ e, small = false }: { e: ExpenseView; small?: boolean }) {
  const size = small ? 'w-10 h-12' : 'w-14 h-[72px]'
  if (!e.receiptId) return <span className={`${size} shrink-0 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-slate-300 flex items-center justify-center`}><Receipt size={small ? 16 : 20} /></span>
  if (e.receiptType === 'pdf') return <span className={`${size} shrink-0 rounded-lg bg-slate-100 text-slate-500 flex flex-col items-center justify-center text-[10px] font-bold`}><FileText size={small ? 16 : 20} />PDF</span>
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={receiptUrl(e.receiptId)} alt="" loading="lazy" className={`${size} shrink-0 object-cover rounded-lg border border-slate-200 bg-slate-50`} />
}

function Flags({ e, dups, all }: { e: ExpenseView; dups: Map<string, string[]>; all: ExpenseView[] }) {
  const twin = (dups.get(e.id) || []).map(id => all.find(x => x.id === id)).filter(Boolean) as ExpenseView[]
  const said = receiptMismatch(e)
  if (!twin.length && said === null && e.receiptId) return null
  return (
    <div className="mt-1.5 space-y-1">
      {twin.map(t => (
        <p key={t.id} className="flex items-start gap-1.5 text-xs text-amber-800"><TriangleAlert size={13} className="shrink-0 mt-0.5" />Looks the same as {t.personName}’s {usd(t.amount)}{t.vendor ? ` at ${t.vendor}` : ''} on {shortDay(t.purchasedOn)} ({STATE_LABEL[expenseState(t)].toLowerCase()})</p>
      ))}
      {said !== null && <p className="flex items-start gap-1.5 text-xs text-amber-800"><TriangleAlert size={13} className="shrink-0 mt-0.5" />The receipt says {usd(said)}</p>}
      {!e.receiptId && <p className="text-xs text-slate-500">No receipt</p>}
    </div>
  )
}

function PayBackForm({ amount, today, method, onSave, onCancel }: {
  amount: number; today: string; method?: string
  onSave: (method: string, on: string, note: string) => Promise<void> | void; onCancel: () => void
}) {
  const [m, setM] = useState(method && isPayBackMethod(method) ? method : 'zelle')
  const [on, setOn] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const field = 'min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500'
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 border border-slate-200 p-3">
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Paid by
        <select value={m} onChange={e => setM(e.target.value)} className={field}>{PAY_BACK_METHODS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">On
        <input type="date" value={on} max={today} onChange={e => setOn(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600 flex-1 min-w-[10rem]">Note
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="Check number, optional" className={field} />
      </label>
      <button type="button" disabled={busy} onClick={async () => { setBusy(true); await onSave(m, on, note); setBusy(false) }} className="min-h-[40px] px-4 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold disabled:opacity-60">Mark {usd(amount)} paid back</button>
      <button type="button" disabled={busy} onClick={onCancel} className="min-h-[40px] px-3 text-sm font-semibold text-slate-600 hover:underline">Cancel</button>
    </div>
  )
}

function Detail({ e, all, dups, person, today, onClose, onEdit, onAct }: {
  e: ExpenseView; all: ExpenseView[]; dups: Map<string, string[]>; person: FormPerson | null; today: string
  onClose: () => void; onEdit: () => void; onAct: (body: Record<string, unknown>, done: string) => Promise<boolean>
}) {
  const st = expenseState(e)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [paying, setPaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    if (await onAct(body, done)) { setDeclining(false); setPaying(false); setReason('') }
    setBusy(false)
  }
  const btn = 'inline-flex items-center gap-1 min-h-[40px] px-4 rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60'
  const solid = 'inline-flex items-center gap-1 min-h-[40px] px-4 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold disabled:opacity-60'
  const facts: [string, ReactNode][] = [
    ['Who bought it', <>{e.personName}{person ? <span className="text-slate-500"> · {payoutLine(person)}</span> : null}</>],
    ['From', e.vendor || '—'],
    ['Date bought', shortDay(e.purchasedOn) || '—'],
    ['Category', categoryLabel(e.category)],
    ['Paid with', paidWithLabel(e.paidWith)],
    ...(e.paidBackOn ? [['Paid back', `${shortDay(e.paidBackOn)} by ${PAY_BACK_METHODS.find(m => m.key === e.paidBackMethod)?.label || 'other'}${e.paidBackNote ? ` (${e.paidBackNote})` : ''}`] as [string, ReactNode]] : []),
    ...(e.status === 'declined' ? [['Not approved', e.declineReason || 'No reason given'] as [string, ReactNode]] : []),
    ...(e.notes ? [['Notes', e.notes] as [string, ReactNode]] : []),
  ]
  return (
    <div data-expenses className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => !busy && onClose()} />
      <div role="dialog" aria-modal="true" aria-labelledby="exp-detail" className="relative w-full sm:max-w-2xl max-h-[94vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-start gap-2 px-5 py-3.5 border-b border-slate-200">
          <div className="flex-1 min-w-0">
            <h2 id="exp-detail" className="text-lg font-bold text-slate-800">{e.what}</h2>
            <p className="flex flex-wrap items-center gap-2 mt-0.5"><span className="text-xl font-extrabold tabular-nums">{usd(e.amount)}</span><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${STATE_TONE[st]}`}>{STATE_LABEL[st]}</span></p>
          </div>
          <button type="button" onClick={onEdit} aria-label="Edit" className="p-2 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50"><Pencil size={17} /></button>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              {e.receiptId && e.receiptType === 'image' && (
                <a href={receiptUrl(e.receiptId)} target="_blank" rel="noopener noreferrer" title="Open full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={receiptUrl(e.receiptId)} alt={`Receipt: ${e.what}`} className="w-full max-h-[50vh] sm:max-h-[60vh] object-contain rounded-xl border border-slate-200 bg-slate-50" />
                </a>
              )}
              {e.receiptId && e.receiptType === 'pdf' && (
                <a href={receiptUrl(e.receiptId)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200 p-4 text-sm font-semibold text-teal-700 hover:bg-teal-50"><FileText size={20} />Open the receipt (PDF)</a>
              )}
              {!e.receiptId && <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No receipt</div>}
            </div>
            <div className="space-y-4 min-w-0">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                {facts.map(([k, v]) => <Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="text-slate-800 break-words">{v}</dd></Fragment>)}
              </dl>
              <Flags e={e} dups={dups} all={all} />

              {declining ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Why not? They see this.
                    <input value={reason} onChange={x => setReason(x.target.value)} placeholder="Not for the event" className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
                  </label>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy} onClick={() => run({ action: 'decline', reason }, 'Marked not approved')} className="min-h-[40px] px-4 rounded-full bg-red-700 hover:bg-red-800 text-white text-sm font-bold disabled:opacity-60">Not approved</button>
                    <button type="button" disabled={busy} onClick={() => setDeclining(false)} className="min-h-[40px] px-3 text-sm font-semibold text-slate-600 hover:underline">Cancel</button>
                  </div>
                </div>
              ) : paying ? (
                <PayBackForm amount={e.amount} today={today} method={person?.payMethod} onCancel={() => setPaying(false)}
                  onSave={(m, on, note) => run({ action: 'paidBack', method: m, on, note }, 'Marked paid back')} />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {st === 'waiting' && <button type="button" disabled={busy} onClick={() => run({ action: 'approve' }, 'Approved')} className={solid}><Check size={15} />Approve</button>}
                  {(st === 'waiting' || st === 'owed') && e.paidWith === 'own' && <button type="button" disabled={busy} onClick={() => setPaying(true)} className={st === 'owed' ? solid : btn}>Mark paid back</button>}
                  {st === 'paid_back' && <button type="button" disabled={busy} onClick={() => run({ action: 'unpay' }, 'Paid back undone')} className={btn}>Undo paid back</button>}
                  {(st === 'owed' || st === 'company' || st === 'declined') && <button type="button" disabled={busy} onClick={() => run({ action: 'reopen' }, 'Back to waiting for approval')} className={btn}>Back to waiting</button>}
                  {st !== 'declined' && st !== 'paid_back' && <button type="button" disabled={busy} onClick={() => setDeclining(true)} className={btn}>Not approved…</button>}
                </div>
              )}

              {e.log.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">History</p>
                  <ul className="space-y-0.5 text-xs text-slate-600">
                    {e.log.slice().reverse().map((l, i) => <li key={i}>{l.text} · {l.by} · {new Date(l.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
