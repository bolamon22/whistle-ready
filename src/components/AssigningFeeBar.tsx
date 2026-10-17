'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Eye, Users } from 'lucide-react'

// Staff pay on the Assigner plan (Bo, Oct 17 2026): the event's tournament directors,
// the head assigner's customers (lib/clientEvents), with a way into exactly what they
// see, and the assigning fee they pay on top of staff pay (lib/assigningFee).

type Fee = { amount: number; per: 'game' | 'event' }
type Answer = { fee: Fee; games: number; total: number; contact?: { name: string } | null; clients: { id: string; name: string; email: string }[] }
const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`

export default function AssigningFeeBar({ tournamentId }: { tournamentId: string }) {
  const [a, setA] = useState<Answer | null>(null)
  const [amount, setAmount] = useState('')
  const [per, setPer] = useState<'game' | 'event'>('game')
  const [busy, setBusy] = useState(false)
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
    </div>
  )
}
