'use client'

import { useRef, useState } from 'react'
import { Camera, FileText, ImagePlus, Loader2, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react'
import { EXPENSE_CATEGORIES, PAID_WITH, PAY_BACK_METHODS, isPayBackMethod, payBackLabel, type ExpenseView, type PaidWith } from '@/lib/expenseTypes'
import { patchExpense, readReceipt, receiptUrl, removeExpense, uploadReceipt, RECEIPT_FILE_ACCEPT, RECEIPT_PHOTO_ACCEPT } from '@/lib/receiptClient'

// One receipt, new or being changed: snap the receipt (or pick a photo or PDF), let it
// be read, check what it filled in, say who paid, turn it in. The staff home uses it
// for their own receipts (mode 'staff'); the Financials Expenses tab for anyone's,
// with who bought it, approval and paid back (mode 'office').

export type FormEvent = { id: string; name: string; startDate?: string; endDate?: string; working?: boolean }
export type FormPerson = { id: string; name: string; payMethod?: string; payHandle?: string; phone?: string }

type Draft = {
  tournamentId: string; personName: string; workerId: string
  what: string; vendor: string; amount: string; purchasedOn: string; category: string; paidWith: PaidWith; notes: string
  receiptId: string; receiptType: '' | 'image' | 'pdf'
  approve: boolean; paidBack: boolean; pbMethod: string; pbOn: string; pbNote: string
}

const field = 'w-full min-w-0 border border-slate-300 rounded-lg px-3 py-2.5 text-base sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500'
const labelCls = 'flex flex-col gap-1 text-xs font-semibold text-slate-600 min-w-0'

/** How a Staff Pool record says to pay them ("Zelle · 555-0100"). */
export function payoutLine(p?: { payMethod?: string; payHandle?: string } | null): string {
  if (!p) return ''
  return [payBackLabel(p.payMethod || 'check'), p.payHandle].filter(Boolean).join(' · ')
}

export default function ExpenseForm({ mode, events, people = [], initial = null, today, onSaved, onDeleted, onClose }: {
  mode: 'staff' | 'office'
  events: FormEvent[]
  people?: FormPerson[]
  initial?: ExpenseView | null
  today: string
  onSaved: (e: ExpenseView) => void
  onDeleted?: (id: string) => void
  onClose: () => void
}) {
  const office = mode === 'office'
  const [d, setD] = useState<Draft>(() => ({
    tournamentId: initial?.tournamentId || events[0]?.id || '',
    personName: initial?.personName || '', workerId: initial?.workerId || '',
    what: initial?.what || '', vendor: initial?.vendor || '',
    amount: initial ? initial.amount.toFixed(2) : '',
    purchasedOn: initial?.purchasedOn || today,
    category: initial?.category || 'other',
    paidWith: initial?.paidWith || 'own',
    notes: initial?.notes || '',
    receiptId: initial?.receiptId || '', receiptType: initial?.receiptType || '',
    approve: true, paidBack: false, pbMethod: 'zelle', pbOn: today, pbNote: '',
  }))
  const touched = useRef(new Set<string>(initial ? ['what', 'vendor', 'amount', 'purchasedOn', 'category'] : []))
  const [rState, setRState] = useState<'idle' | 'uploading' | 'reading' | 'read' | 'unread'>('idle')
  const [rNote, setRNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const camera = useRef<HTMLInputElement>(null)
  const files = useRef<HTMLInputElement>(null)

  const set = (k: keyof Draft, v: string | boolean) => { touched.current.add(k); setD(x => ({ ...x, [k]: v })) }
  const person = people.find(p => p.id === d.workerId) || null

  function pickPerson(name: string) {
    const hit = people.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase())
    setD(x => ({ ...x, personName: name, workerId: hit?.id || '', pbMethod: hit?.payMethod && isPayBackMethod(hit.payMethod) ? hit.payMethod : x.pbMethod }))
  }

  async function pick(file: File | undefined) {
    if (!file) return
    setErr(''); setRNote(''); setRState('uploading')
    try {
      const up = await uploadReceipt(file)
      setD(x => ({ ...x, receiptId: up.id, receiptType: up.type }))
      setRState('reading')
      const r = await readReceipt(up.id)
      if ('read' in r) {
        const x = r.read
        const keep = (k: string, cur: string) => touched.current.has(k) && !!cur
        setD(v => ({
          ...v,
          vendor: keep('vendor', v.vendor) ? v.vendor : x.vendor || v.vendor,
          what: keep('what', v.what) ? v.what : x.what || v.what,
          amount: keep('amount', v.amount) ? v.amount : x.total ? x.total.toFixed(2) : v.amount,
          purchasedOn: touched.current.has('purchasedOn') ? v.purchasedOn : x.date || v.purchasedOn,
          category: touched.current.has('category') ? v.category : x.category || v.category,
        }))
        setRState('read')
        setRNote(x.isReceipt ? 'Filled in from the receipt. Check each one.' : 'That doesn’t look like a receipt. Check the photo.')
      } else { setRState('unread'); setRNote(r.error) }
    } catch (e) {
      setRState('idle'); setErr(e instanceof Error ? e.message : 'The receipt didn’t upload. Try again.')
    }
  }

  async function save() {
    setErr('')
    const amount = parseFloat(d.amount.replace(/[$,\s]/g, ''))
    if (!d.tournamentId) return setErr('Pick the event this was for.')
    if (office && !d.personName.trim()) return setErr('Say who bought it.')
    if (!d.what.trim()) return setErr(office ? 'Say what was bought.' : 'Say what you bought.')
    if (!d.vendor.trim()) return setErr('Say where it was bought.')
    if (!(amount > 0)) return setErr('Enter the total from the receipt.')
    if (!d.purchasedOn) return setErr('Pick the day it was bought.')
    if (rState === 'uploading' || rState === 'reading') return setErr('Wait for the receipt to finish.')
    const body: Record<string, unknown> = {
      tournamentId: d.tournamentId, what: d.what, vendor: d.vendor, amount, purchasedOn: d.purchasedOn,
      category: d.category, paidWith: d.paidWith, notes: d.notes, receiptId: d.receiptId,
    }
    if (office) { body.personName = d.personName; body.workerId = d.workerId }
    setBusy(true)
    try {
      if (initial) {
        onSaved(await patchExpense(initial.id, body))
      } else {
        if (office) {
          body.status = d.approve ? 'approved' : 'pending'
          if (d.paidBack && d.paidWith === 'own') body.paidBack = { method: d.pbMethod, on: d.pbOn, note: d.pbNote }
        }
        const res = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const j = await res.json().catch(() => ({}))
        if (!res.ok || !j.expense) throw new Error(j.error || 'Couldn’t save that. Try again.')
        onSaved(j.expense as ExpenseView)
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn’t save that. Try again.') } finally { setBusy(false) }
  }

  async function del() {
    if (!initial) return
    setBusy(true); setErr('')
    try { await removeExpense(initial.id); onDeleted?.(initial.id) } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn’t delete it.') } finally { setBusy(false) }
  }

  const title = office ? (initial ? 'Edit expense' : 'Add an expense') : initial ? 'Your receipt' : 'Turn in a receipt'
  const working = rState === 'uploading' || rState === 'reading'
  const ev = events.find(e => e.id === d.tournamentId)

  return (
    <div data-expenses className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => !busy && onClose()} />
      <div role="dialog" aria-modal="true" aria-labelledby="exp-title" className="relative w-full sm:max-w-lg max-h-[94vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-200">
          <h2 id="exp-title" className="flex-1 text-lg font-bold text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* The receipt */}
          <input ref={camera} type="file" accept={RECEIPT_PHOTO_ACCEPT} capture="environment" className="hidden" onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
          <input ref={files} type="file" accept={RECEIPT_FILE_ACCEPT} className="hidden" onChange={e => { void pick(e.target.files?.[0]); e.target.value = '' }} />
          {d.receiptId ? (
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
              {d.receiptType === 'pdf' ? (
                <a href={receiptUrl(d.receiptId)} target="_blank" rel="noopener noreferrer" className="w-16 h-20 shrink-0 rounded-lg bg-slate-100 text-slate-500 flex flex-col items-center justify-center text-[11px] font-semibold"><FileText size={22} />PDF</a>
              ) : (
                <a href={receiptUrl(d.receiptId)} target="_blank" rel="noopener noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={receiptUrl(d.receiptId)} alt="The receipt" className="w-16 h-20 object-cover rounded-lg border border-slate-200 bg-slate-50" />
                </a>
              )}
              <div className="min-w-0 flex-1 text-sm">
                {working ? (
                  <p className="flex items-center gap-1.5 font-semibold text-slate-700"><Loader2 size={15} className="animate-spin" />{rState === 'uploading' ? 'Uploading…' : 'Reading the receipt…'}</p>
                ) : rNote ? (
                  <p className={`flex items-start gap-1.5 ${rState === 'read' && !/doesn’t look/.test(rNote) ? 'text-teal-800' : 'text-amber-800'}`}>
                    {rState === 'read' && !/doesn’t look/.test(rNote) ? <Sparkles size={15} className="shrink-0 mt-0.5" /> : <TriangleAlert size={15} className="shrink-0 mt-0.5" />}{rNote}
                  </p>
                ) : <p className="font-semibold text-slate-700">Receipt added</p>}
                <div className="flex flex-wrap gap-3 mt-2">
                  <button type="button" disabled={working} onClick={() => camera.current?.click()} className="text-sm font-semibold text-teal-700 hover:underline disabled:opacity-50">Retake</button>
                  <button type="button" disabled={working} onClick={() => files.current?.click()} className="text-sm font-semibold text-teal-700 hover:underline disabled:opacity-50">Choose another</button>
                  <button type="button" disabled={working} onClick={() => { setD(x => ({ ...x, receiptId: '', receiptType: '' })); setRState('idle'); setRNote('') }} className="text-sm font-semibold text-slate-500 hover:text-red-700 disabled:opacity-50">Remove</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-300 p-4 text-center">
              {working ? (
                <p className="flex items-center justify-center gap-1.5 py-3 text-sm font-semibold text-slate-700"><Loader2 size={16} className="animate-spin" />Uploading…</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => camera.current?.click()} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold"><Camera size={17} />Snap the receipt</button>
                    <button type="button" onClick={() => files.current?.click()} className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold"><ImagePlus size={17} />Photo or PDF</button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">It reads the store, the date and the total for you.{office ? '' : ' No receipt? You can still turn it in: say why in the notes.'}</p>
                </>
              )}
            </div>
          )}

          {!office && events.length > 1 && (
            <label className={labelCls}>Event
              <select value={d.tournamentId} onChange={e => set('tournamentId', e.target.value)} className={field}>
                {events.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
          )}
          {!office && events.length === 1 && ev && <p className="text-sm text-slate-600">For <b className="text-slate-800">{ev.name}</b></p>}

          {office && (
            <label className={labelCls}>Who bought it
              <input value={d.personName} onChange={e => pickPerson(e.target.value)} list="exp-people" autoComplete="off" placeholder="Start typing a name" className={field} />
              <datalist id="exp-people">{people.map(p => <option key={p.id} value={p.name} />)}</datalist>
              <span className="font-normal text-slate-500">{person ? `Payout: ${payoutLine(person)}` : d.personName.trim() ? 'Not in the Staff Pool. Their name stays with the receipt.' : 'Anyone on the Staff roster, or type any name.'}</span>
            </label>
          )}

          <label className={labelCls}>{office ? 'What was bought' : 'What did you buy?'}
            <input value={d.what} onChange={e => set('what', e.target.value)} placeholder="e.g. 2 cases of water, 6 bags of ice" className={field} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={`${labelCls} col-span-2 sm:col-span-1`}>From (store)
              <input value={d.vendor} onChange={e => set('vendor', e.target.value)} placeholder="e.g. Publix" className={field} />
            </label>
            <label className={labelCls}>Total
              <span className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input value={d.amount} onChange={e => set('amount', e.target.value)} inputMode="decimal" placeholder="0.00" className={`${field} pl-6 tabular-nums`} />
              </span>
            </label>
            <label className={labelCls}>Date bought
              <input type="date" value={d.purchasedOn} max={today} onChange={e => set('purchasedOn', e.target.value)} className={field} />
            </label>
            <label className={`${labelCls} col-span-2 sm:col-span-1`}>Category
              <select value={d.category} onChange={e => set('category', e.target.value)} className={field}>
                {EXPENSE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
            </label>
          </div>

          <fieldset>
            <legend className="text-xs font-semibold text-slate-600 mb-1.5">{office ? 'Paid with' : 'How did you pay?'}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {PAID_WITH.map(p => (
                <label key={p.key} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm cursor-pointer ${d.paidWith === p.key ? 'border-teal-600 bg-teal-50 text-teal-900 font-semibold' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                  <input type="radio" name="paidWith" value={p.key} checked={d.paidWith === p.key} onChange={() => set('paidWith', p.key)} className="accent-teal-600" />
                  {office ? p.label : p.staff}
                </label>
              ))}
            </div>
          </fieldset>

          <label className={labelCls}>Notes
            <textarea value={d.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder={office ? 'Optional' : 'Anything the office should know'} className={field} />
          </label>

          {office && !initial && (
            <div className="space-y-2 rounded-xl bg-slate-50 border border-slate-200 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={d.approve} onChange={e => set('approve', e.target.checked)} className="accent-teal-600" />Approved</label>
              {d.paidWith === 'own' && (
                <>
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={d.paidBack} onChange={e => set('paidBack', e.target.checked)} className="accent-teal-600" />Already paid back</label>
                  {d.paidBack && (
                    <div className="grid grid-cols-2 gap-2 pl-6">
                      <select value={d.pbMethod} onChange={e => set('pbMethod', e.target.value)} aria-label="Paid back by" className={field}>
                        {PAY_BACK_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                      </select>
                      <input type="date" value={d.pbOn} max={today} onChange={e => set('pbOn', e.target.value)} aria-label="Paid back on" className={field} />
                      <input value={d.pbNote} onChange={e => set('pbNote', e.target.value)} placeholder="Check number or note" aria-label="Paid back note" className={`${field} col-span-2`} />
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-t border-slate-200 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))]">
          {err && <p role="alert" className="basis-full text-sm font-semibold text-red-700">{err}</p>}
          {initial && onDeleted && (confirmDelete ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-slate-700">Delete it?</span>
              <button type="button" disabled={busy} onClick={del} className="font-bold text-red-700 hover:underline">Delete</button>
              <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} className="font-semibold text-slate-500 hover:underline">Keep</button>
            </span>
          ) : (
            <button type="button" disabled={busy} onClick={() => setConfirmDelete(true)} aria-label="Delete" className="p-2 rounded-lg text-slate-400 hover:text-red-700 hover:bg-red-50"><Trash2 size={17} /></button>
          ))}
          <span className="flex-1" />
          <button type="button" onClick={onClose} disabled={busy} className="min-h-[44px] px-4 rounded-full border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={save} disabled={busy || working} className="min-h-[44px] px-5 rounded-full bg-teal-700 hover:bg-teal-800 text-white text-sm font-bold disabled:opacity-60">
            {busy ? 'Saving…' : initial ? 'Save changes' : office ? 'Add expense' : 'Turn it in'}
          </button>
        </div>
      </div>
    </div>
  )
}
