'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Wallet } from 'lucide-react'

// Owed to you: across the head assigner's events, what each tournament director owes
// him (his assigning fee plus staff pay he paid for them, lib/officialsPayer) and has
// paid. Payments are recorded on each event's Staff pay (AssigningFeeBar).

type Ev = { id: string; name: string; startDate: string; endDate: string; td: string; fee: number; fronted: number; total: number; paid: number; due: number; state: 'none' | 'unpaid' | 'part' | 'paid' }
type Answer = { events: Ev[]; totals: { total: number; paid: number; due: number } }
const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (d: string) => (d ? new Date(d + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '')

export default function AssigningFeesPage() {
  const [d, setD] = useState<Answer | null>(null)
  const [err, setErr] = useState('')
  const [show, setShow] = useState<'due' | 'all'>('due')
  useEffect(() => {
    fetch('/api/org/assigning-fees').then(async r => { const j = await r.json().catch(() => null); if (!r.ok || !j) throw new Error(j?.error || 'That didn’t load.'); return j }).then(setD).catch(e => setErr(e.message))
  }, [])
  const list = (d?.events || []).filter(e => show === 'all' || e.due > 0)
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <div className="mb-5 pt-6">
        <Link href="/dashboard/director" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ChevronLeft size={14} aria-hidden /> Home</Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Owed to you</h1>
        <p className="text-sm text-slate-500">What each tournament director owes you: your assigning fee, plus any staff pay you paid for them. Record a payment on the event&apos;s <b className="font-semibold">Staff pay</b>.</p>
      </div>
      {err && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</p>}
      {!d && !err && <p className="p-10 text-center text-sm text-slate-400">Loading…</p>}
      {d && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Tile label="Owed" value={money(d.totals.total)} />
            <Tile label="Paid" value={money(d.totals.paid)} tone="green" />
            <Tile label="Still due" value={money(d.totals.due)} tone={d.totals.due > 0 ? 'amber' : undefined} />
          </div>
          <div className="mb-3 inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
            {(['due', 'all'] as const).map(k => (
              <button key={k} type="button" onClick={() => setShow(k)} className={`min-h-[40px] rounded-md px-3 ${show === k ? 'bg-teal-600 font-semibold text-white' : 'text-slate-600'}`}>{k === 'due' ? 'Still due' : 'Every event'}</button>
            ))}
          </div>
          {list.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">{d.events.length ? 'Everything is paid.' : 'Nothing is owed yet. Set an assigning fee on an event’s Staff pay.'}</p>}
          <div className="space-y-2">
            {list.map(e => (
              <Link key={e.id} href={`/tournaments/${e.id}/pay-summary`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-teal-300">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Wallet size={16} aria-hidden /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{e.name}</p>
                  <p className="truncate text-xs text-slate-500">{fmt(e.startDate)}{e.td ? ` · ${e.td}` : ' · No tournament director named'}</p>
                  {e.fronted > 0 && <p className="truncate text-xs text-slate-500">Fee {money(e.fee)} + staff pay you paid {money(e.fronted)}</p>}
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{money(e.total)}</p>
                  <p className={`text-xs font-semibold ${e.state === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}>{e.state === 'paid' ? 'Paid' : e.paid > 0 ? `${money(e.due)} due` : 'Not paid yet'}</p>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'amber' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`text-base font-bold sm:text-lg ${tone === 'green' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}
