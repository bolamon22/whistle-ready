'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ChevronDown, ChevronRight, Plus, Receipt } from 'lucide-react'
import ExpenseForm, { type FormEvent } from './ExpenseForm'
import { expenseState, payBackLabel, round2, STAFF_STATE_LABEL, STATE_TONE, type ExpenseView } from '@/lib/expenseTypes'
import { shortDay, usd } from '@/lib/receiptClient'

// The Receipts card on a staff home (Bo, Oct 20 2026): turn in what you bought for an
// event, then see whether the office approved it and paid you back. The office's side
// is the Financials Expenses tab. Hidden for anyone with no event to turn one in for
// and no receipts (api/expenses/mine), and where the plan has Event money off.

type Mine = { canAdd: boolean; me: { name: string }; events: FormEvent[]; expenses: ExpenseView[]; today: string }

export default function StaffReceipts({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<Mine | null>(null)
  const [form, setForm] = useState<ExpenseView | 'new' | null>(null)
  const [open, setOpen] = useState(!compact)
  const [all, setAll] = useState(false)

  const load = () => fetch('/api/expenses/mine', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then(d => { if (d && Array.isArray(d.expenses) && Array.isArray(d.events)) setData(d) })
    .catch(() => {})
  useEffect(() => { void load() }, [])

  if (!data || (!data.canAdd && !data.expenses.length)) return null
  const list = data.expenses
  const owed = round2(list.filter(e => expenseState(e) === 'owed').reduce((s, e) => s + e.amount, 0))
  const waiting = list.filter(e => expenseState(e) === 'waiting').length
  const summary = !list.length ? 'Bought something for an event? Snap the receipt and turn it in.'
    : [owed > 0 ? `${usd(owed)} on its way back to you` : '', waiting ? `${waiting} waiting for approval` : ''].filter(Boolean).join(' · ') || 'Nothing waiting'
  const shown = all ? list : list.slice(0, 4)
  // Editing a receipt for an event that has since dropped off the list keeps that event.
  const eventsFor = (e: ExpenseView | null) => e && !data.events.some(x => x.id === e.tournamentId)
    ? [{ id: e.tournamentId, name: e.eventName || 'This event' }, ...data.events] : data.events

  return (
    <div data-expenses className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 card">
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0"><Receipt size={20} /></span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">Receipts</p>
          <p className="text-xs text-slate-500 mt-0.5">{summary}</p>
        </div>
        {compact && list.length > 0 && (
          <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Yours ({list.length})
          </button>
        )}
      </div>
      {data.canAdd && (
        <button type="button" onClick={() => setForm('new')} className="mt-3 w-full inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold">
          <Plus size={17} />Turn in a receipt
        </button>
      )}

      {open && list.length > 0 && (
        <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
          {shown.map(e => {
            const st = expenseState(e)
            const editable = st === 'waiting' && !!e.userId
            const body = (
              <>
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold text-slate-800 truncate">{e.what}</span>
                  <span className="text-sm font-bold tabular-nums text-slate-800">{usd(e.amount)}</span>
                </span>
                <span className="block text-xs text-slate-500 mt-0.5 truncate">{[e.vendor, shortDay(e.purchasedOn), e.eventName].filter(Boolean).join(' · ')}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${STATE_TONE[st]}`}>{STAFF_STATE_LABEL[st]}</span>
                  {st === 'paid_back' && <span className="text-xs text-slate-600">{shortDay(e.paidBackOn)}{e.paidBackMethod ? ` by ${payBackLabel(e.paidBackMethod)}` : ''}</span>}
                  {st === 'declined' && e.declineReason && <span className="text-xs text-slate-600">{e.declineReason}</span>}
                  {editable && <span className="text-xs font-semibold text-teal-700">Change it</span>}
                </span>
              </>
            )
            return editable ? (
              <button key={e.id} type="button" onClick={() => setForm(e)} className="block w-full text-left py-2.5 hover:bg-slate-50">{body}</button>
            ) : <div key={e.id} className="py-2.5">{body}</div>
          })}
          {list.length > 4 && (
            <button type="button" onClick={() => setAll(a => !a)} className="w-full pt-2.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-800">
              {all ? 'Show fewer' : `Show all ${list.length}`}
            </button>
          )}
        </div>
      )}

      {form && (
        <ExpenseForm mode="staff" events={eventsFor(form === 'new' ? null : form)} initial={form === 'new' ? null : form} today={data.today}
          onSaved={() => { toast.success(form === 'new' ? 'Turned in. The office will check it.' : 'Saved'); setForm(null); void load() }}
          onDeleted={() => { toast.success('Deleted'); setForm(null); void load() }}
          onClose={() => setForm(null)} />
      )}
    </div>
  )
}
