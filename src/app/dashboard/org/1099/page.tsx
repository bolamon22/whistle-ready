'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft, Download, FileCheck2, FileX2 } from 'lucide-react'
import { PAY_METHOD_NAMES } from '@/lib/form1099'

// 1099 export (lib/form1099): a year's pay per person per payer, for the 1099-NEC.
// Directors and admins only (the API refuses anyone else).

type Row = { workerId: string; name: string; email: string; phone: string; payMethod: string; w9OnFile: boolean; payer: string; payerKey: string; payerKind: 'org' | 'td'; events: number; payments: number; total: number; needs1099: boolean }
type Payer = { key: string; name: string; kind: 'org' | 'td' }
type Answer = { year: number; threshold: number; rows: Row[]; payers: Payer[] }
const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function Form1099Page() {
  const thisYear = new Date().getFullYear()
  // In January the year to file is last year's.
  const [year, setYear] = useState(new Date().getMonth() === 0 ? thisYear - 1 : thisYear)
  const [d, setD] = useState<Answer | null>(null)
  const [err, setErr] = useState('')
  const [payer, setPayer] = useState('')
  const [onlyNeeds, setOnlyNeeds] = useState(false)
  useEffect(() => {
    setD(null); setErr('')
    fetch(`/api/org/1099?year=${year}`).then(async r => { const j = await r.json().catch(() => null); if (!r.ok || !j) throw new Error(j?.error || 'That didn’t load.'); return j })
      .then(j => { setD(j); setPayer(p => (j.payers.some((x: Payer) => x.key === p) ? p : '')) }).catch(e => setErr(e.message))
  }, [year])
  const rows = useMemo(() => (d?.rows || []).filter(r => (!payer || r.payerKey === payer) && (!onlyNeeds || r.needs1099)), [d, payer, onlyNeeds])
  const needs = rows.filter(r => r.needs1099)
  const noW9 = needs.filter(r => !r.w9OnFile).length
  const total = rows.reduce((s, r) => s + r.total, 0)
  const years = Array.from({ length: 4 }, (_, i) => thisYear - i)
  const csvHref = `/api/org/1099?year=${year}&format=csv${payer ? `&payer=${encodeURIComponent(payer)}` : ''}`
  const many = (d?.payers.length || 0) > 1

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <div className="mb-5 pt-6">
        <Link href="/staff" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"><ChevronLeft size={14} aria-hidden /> Staff Pool</Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">1099 export</h1>
        <p className="text-sm text-slate-500">What each person was paid in a year, from Staff pay&apos;s <b className="font-semibold">Mark paid</b> (yours and your tournament directors&apos;), by the date paid. Each person&apos;s address and tax ID are on their W-9.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Year" className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm sm:min-h-0 sm:py-2">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        {many && (
          <select value={payer} onChange={e => setPayer(e.target.value)} aria-label="Paid by" className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm sm:min-h-0 sm:py-2">
            <option value="">Every payer</option>
            {d!.payers.map(p => <option key={p.key} value={p.key}>{p.kind === 'org' ? `${p.name} (you)` : p.name}</option>)}
          </select>
        )}
        <label className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 sm:min-h-0 sm:py-2">
          <input type="checkbox" checked={onlyNeeds} onChange={e => setOnlyNeeds(e.target.checked)} /> Only people who need a 1099
        </label>
        <a href={csvHref} className={`btn-primary inline-flex min-h-[44px] items-center gap-1.5 sm:ml-auto sm:min-h-0 ${rows.length ? '' : 'pointer-events-none opacity-50'}`}><Download size={15} aria-hidden />Download CSV</a>
      </div>

      {err && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</p>}
      {!d && !err && <p className="p-10 text-center text-sm text-slate-400">Loading…</p>}
      {d && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label={`Paid in ${d.year}`} value={money(total)} />
            <Tile label="People" value={String(new Set(rows.map(r => r.workerId)).size)} />
            <Tile label={`Need a 1099 (${money(d.threshold).replace('.00', '')}+)`} value={String(needs.length)} />
            <Tile label="Of them, no W-9" value={String(noW9)} tone={noW9 ? 'amber' : undefined} />
          </div>
          {many && !payer && (
            <p className="mb-3 flex gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-600" aria-hidden />
              <span>Whoever pays the staff files their 1099s. When a tournament director marked people paid, those payments are listed under their name; pick them above to download just their list. The {money(d.threshold).replace('.00', '')} line is per payer.</span>
            </p>
          )}
          {rows.length === 0 && <p className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No one was marked paid in {d.year}{onlyNeeds ? ` above ${money(d.threshold).replace('.00', '')}` : ''}.</p>}

          {/* Phones: one card per person */}
          <div className="space-y-2 sm:hidden">
            {rows.map(r => (
              <div key={r.workerId + r.payerKey} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{r.name}</p>
                    <p className="truncate text-xs text-slate-500">{r.email || 'No email'}{many && !payer ? ` · paid by ${r.payer}` : ''}</p>
                  </div>
                  <p className="text-right font-bold text-slate-900">{money(r.total)}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  {r.needs1099 && <span className="rounded-full bg-teal-50 px-2 py-0.5 font-semibold text-teal-700">Needs a 1099</span>}
                  <W9 on={r.w9OnFile} />
                  <span className="text-slate-500">{r.events} event{r.events === 1 ? '' : 's'} · {PAY_METHOD_NAMES[r.payMethod] || r.payMethod}</span>
                </div>
              </div>
            ))}
          </div>

          {rows.length > 0 && (
            <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Name</th>
                    {many && !payer && <th className="px-3 py-2">Paid by</th>}
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2">1099</th>
                    <th className="px-3 py-2">W-9</th>
                    <th className="px-3 py-2 text-right">Events</th>
                    <th className="px-3 py-2">Pay method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map(r => (
                    <tr key={r.workerId + r.payerKey}>
                      <td className="px-3 py-2"><p className="font-medium text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.email}</p></td>
                      {many && !payer && <td className="px-3 py-2 text-slate-600">{r.payer}</td>}
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">{money(r.total)}</td>
                      <td className="px-3 py-2">{r.needs1099 ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">Needs one</span> : <span className="text-xs text-slate-400">Under</span>}</td>
                      <td className="px-3 py-2"><W9 on={r.w9OnFile} /></td>
                      <td className="px-3 py-2 text-right text-slate-600">{r.events}</td>
                      <td className="px-3 py-2 text-slate-600">{PAY_METHOD_NAMES[r.payMethod] || r.payMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">The IRS line is {money(d.threshold).replace('.00', '')} for payments made in {d.year}. This list is a starting point for your filing, not tax advice; check with your accountant.</p>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'amber' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function W9({ on }: { on: boolean }) {
  return on
    ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><FileCheck2 size={13} aria-hidden />On file</span>
    : <span className="inline-flex items-center gap-1 text-xs text-amber-700"><FileX2 size={13} aria-hidden />Missing</span>
}
