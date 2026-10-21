'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Check, Eye, Plus, Users, X } from 'lucide-react'

// Staff pay on the Assigner plan (Bo, Oct 17 2026): the event's tournament directors,
// the head assigner's customers (lib/clientEvents), with a way into exactly what they
// see, and the assigning fee they pay on top of staff pay (lib/assigningFee). Oct 21
// 2026: and what they've paid of it. The head assigner records each payment (amount,
// date, how); the tournament director sees them in their area. Assigners get no
// `status` from the API and see no payments.

type Fee = { amount: number; per: 'game' | 'event' }
type Payment = { id: string; amount: number; on: string; method: string; note: string; by: string }
type Status = { paid: number; due: number; state: 'none' | 'unpaid' | 'part' | 'paid' }
type Answer = { fee: Fee; games: number; total: number; contact?: { name: string } | null; clients: { id: string; name: string; email: string }[]; payments?: Payment[]; status?: Status }
const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`
export const FEE_METHOD_LABELS: Record<string, string> = { check: 'Check', zelle: 'Zelle', venmo: 'Venmo', cash: 'Cash', ach: 'Bank transfer', card: 'Card', other: 'Other' }
const day = (d: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '')
const todayStr = () => new Date().toLocaleDateString('en-CA')

export default function AssigningFeeBar({ tournamentId }: { tournamentId: string }) {
  const [a, setA] = useState<Answer | null>(null)
  const [amount, setAmount] = useState('')
  const [per, setPer] = useState<'game' | 'event'>('game')
  const [busy, setBusy] = useState(false)
  const [rec, setRec] = useState<{ amount: string; on: string; method: string; note: string } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  function take(d: Answer) { setA(d); setAmount(d.fee.amount ? String(d.fee.amount) : ''); setPer(d.fee.per) }
  useEffect(() => {
    fetch(`/api/tournaments/${tournamentId}/assigning-fee`).then(r => (r.ok ? r.json() : null)).then(d => { if (d) take(d) }).catch(() => {})
  }, [tournamentId])
  if (!a) return null
  const changed = (Number(amount) || 0) !== a.fee.amount || per !== a.fee.per
  async function save() {
    setBusy(true)
    try {
      const r = await fetch(`/api/tournaments/${tournamentId}/assigning-fee`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(amount) || 0, per }) })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) { toast.error(d?.error || 'That didn’t save. Please try again.'); return }
      take(d); toast.success('Assigning fee saved')
    } finally { setBusy(false) }
  }
  async function record() {
    if (!rec) return
    setBusy(true)
    try {
      const r = await fetch(`/api/tournaments/${tournamentId}/assigning-fee`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(rec.amount) || 0, on: rec.on, method: rec.method, note: rec.note }) })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) { toast.error(d?.error || 'That didn’t save. Please try again.'); return }
      take(d); setRec(null); toast.success('Payment recorded')
    } finally { setBusy(false) }
  }
  async function remove(id: string) {
    setBusy(true)
    try {
      const r = await fetch(`/api/tournaments/${tournamentId}/assigning-fee?paymentId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const d = await r.json().catch(() => null)
      if (!r.ok || !d) { toast.error(d?.error || 'That didn’t save. Please try again.'); return }
      take(d); setRemoving(null); toast.success('Payment removed')
    } finally { setBusy(false) }
  }
  const st = a.status
  const pays = a.payments || []
  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 text-sm text-slate-600">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Users size={15} className="text-teal-600" aria-hidden />
            <span className="font-semibold text-slate-800">Tournament director:</span>
            {a.contact?.name || a.clients.length
              ? <>{a.contact?.name || a.clients.map(c => c.name).join(', ')} <Link href={`/tournaments/${tournamentId}/tournament-director`} className="font-semibold text-teal-700">Edit</Link></>
              : <Link href={`/tournaments/${tournamentId}/tournament-director`} className="font-semibold text-teal-700">Add them</Link>}
          </p>
          <p className="mt-1 text-xs text-slate-500">{a.clients.length ? 'They see the schedule with officials and Staff pay, and can mark people paid.' : a.contact?.name ? 'To let them see this event, click Edit and invite them.' : 'A name is enough. Inviting them to log in is optional.'} <Link href={`/dashboard/client/${tournamentId}`} className="inline-flex items-center gap-1 font-semibold text-teal-700"><Eye size={12} aria-hidden />See their view</Link></p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-semibold text-slate-700" htmlFor="assigning-fee">Assigning fee</label>
          <span className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
            <input id="assigning-fee" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0"
              className="w-24 rounded-lg border border-slate-300 py-1.5 pl-6 pr-2 text-sm" />
          </span>
          <select value={per} onChange={e => setPer(e.target.value === 'event' ? 'event' : 'game')} aria-label="Per" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="game">per game</option>
            <option value="event">for the event</option>
          </select>
          {changed
            ? <button type="button" onClick={save} disabled={busy} className="btn-primary btn-sm">{busy ? 'Saving…' : 'Save'}</button>
            : <span className="text-sm text-slate-500">= <b className="text-slate-800">{money(a.total)}</b>{a.fee.amount && a.fee.per === 'game' ? ` (${a.games} game${a.games === 1 ? '' : 's'} with officials)` : ''}</span>}
        </div>
      </div>
      {st && (a.total > 0 || pays.length > 0) && (
        <div className="mt-3 border-t border-slate-100 pt-3" data-fee-paid>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.state === 'paid' ? 'bg-emerald-50 text-emerald-700' : st.state === 'part' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                {st.state === 'paid' ? 'Fee paid' : st.state === 'part' ? 'Part paid' : 'Fee not paid yet'}
              </span>
              <span>Paid <b className="text-slate-800">{money(st.paid)}</b> of {money(a.total)}{st.due > 0 ? <> · <b className="text-amber-700">{money(st.due)}</b> due</> : null}</span>
              <Link href="/dashboard/org/assigning-fees" className="text-xs font-semibold text-teal-700">Every event</Link>
            </p>
            {!rec && (
              <button type="button" onClick={() => setRec({ amount: st.due > 0 ? String(st.due) : '', on: todayStr(), method: 'check', note: '' })}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-3 text-sm font-semibold text-teal-700 hover:bg-teal-100 sm:min-h-0 sm:py-1.5">
                <Plus size={15} aria-hidden />Record payment
              </button>
            )}
          </div>
          {rec && (
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-[7rem_10rem_9rem_1fr_auto] sm:items-end">
              <label className="text-xs font-semibold text-slate-600">Amount
                <span className="relative mt-1 block">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input inputMode="decimal" value={rec.amount} onChange={e => setRec({ ...rec, amount: e.target.value.replace(/[^\d.]/g, '') })} className="w-full rounded-lg border border-slate-300 py-2 pl-6 pr-2 text-sm font-normal" />
                </span>
              </label>
              <label className="text-xs font-semibold text-slate-600">Paid on
                <input type="date" value={rec.on} onChange={e => setRec({ ...rec, on: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal" />
              </label>
              <label className="text-xs font-semibold text-slate-600">How
                <select value={rec.method} onChange={e => setRec({ ...rec, method: e.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm font-normal">
                  {Object.entries(FEE_METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Note <span className="font-normal text-slate-400">(check #, only you see it)</span>
                <input value={rec.note} onChange={e => setRec({ ...rec, note: e.target.value })} maxLength={200} className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-2 text-sm font-normal" />
              </label>
              <div className="col-span-2 flex gap-2 sm:col-span-1">
                <button type="button" onClick={record} disabled={busy || !(Number(rec.amount) > 0)} className="btn-primary min-h-[44px] flex-1 sm:min-h-0 sm:flex-none">{busy ? 'Saving…' : 'Save'}</button>
                <button type="button" onClick={() => setRec(null)} className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-600 sm:min-h-0">Cancel</button>
              </div>
            </div>
          )}
          {pays.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {pays.map(p => (
                <li key={p.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white py-1 pl-2.5 pr-1 text-xs text-slate-600">
                  <Check size={12} className="text-emerald-600" aria-hidden />
                  <span><b className="text-slate-800">{money(p.amount)}</b> · {day(p.on)} · {FEE_METHOD_LABELS[p.method] || 'Other'}{p.note ? ` · ${p.note}` : ''}</span>
                  {removing === p.id
                    ? <button type="button" onClick={() => remove(p.id)} disabled={busy} className="inline-flex min-h-[44px] items-center rounded px-2 font-semibold text-red-700 hover:bg-red-50 sm:min-h-0 sm:py-1">Remove?</button>
                    : <button type="button" onClick={() => setRemoving(p.id)} aria-label={`Remove the ${money(p.amount)} payment`} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:min-h-0 sm:min-w-0 sm:p-1.5"><X size={13} aria-hidden /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
