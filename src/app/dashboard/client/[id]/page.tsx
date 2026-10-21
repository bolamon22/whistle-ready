'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast, { Toaster } from 'react-hot-toast'
import { ChevronLeft, CalendarDays, Wallet, Phone, Mail, Eye, Printer, CheckCircle2, MapPin, Search } from 'lucide-react'
import { dateRange } from '@/components/nav/navConfig'
import { telHref } from '@/lib/contactTypes'
import { formatDate, formatTime, PAY_METHODS } from '@/lib/utils'

// One event in the tournament director's area (lib/clientEvents, api/client/events/[id]).
// Schedule: every game with who is on it and their phone number. Staff pay: what each
// person earned and how they want to be paid, with Mark paid, because the tournament
// director normally pays the staff (Bo, Oct 17 2026), plus the head assigner's
// assigning fee. The add-ons the head assigner has on add to it (lib/clientView).

type Official = { role: string; label: string; name: string; phone: string }
type Game = { id: string; gameNumber: string; date: string; startTime: string; division: string; location: string; team1: string; team2: string; refCount: number; isChampionship: boolean; isCanceled: boolean; score1?: number | null; score2?: number | null; officials: Official[] }
type PayRecord = { id: string; amount: number; method: string; paidAt: string; paidBy: string | null; payer?: 'td' | 'org' }
type Person = { workerId: string; name: string; phone: string; payMethod: string; payHandle: string; games: { gameNumber: string; date: string; startTime: string; division: string; location: string; role: string; pay: number }[]; hours: { date: string; clockIn: string | null; clockOut: string | null; hours: number; pay: number }[]; total: number; isPaid: boolean; records: PayRecord[] }
type Data = {
  as: 'client' | 'director' | 'admin'
  tournament: { id: string; name: string; startDate: string; endDate: string; location: string; logoUrl: string }
  org: { name: string; logoUrl: string; contactEmail: string; contactPhone: string; zelleHandle: string } | null
  assigners: { name: string; email: string }[]
  sections: string[]
  schedule: Game[]
  pay: { people: Person[]; total: number; paid: number; owed: number }
  fee: { amount: number; per: 'game' | 'event'; games: number; total: number; fronted: number; owed: number; paid: number; due: number; state: 'none' | 'unpaid' | 'part' | 'paid'; payments: { amount: number; on: string; method: string }[] }
}

const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`
const pmLabel = (p: string) => PAY_METHODS.find(m => m.value === p)?.label ?? p
const SLOT: Record<string, string> = { ref1: 'R1', ref2: 'R2', ref3: 'R3', scorekeeper: 'SK' }

export default function ClientEvent({ params }: { params: { id: string } }) {
  const [d, setD] = useState<Data | null>(null)
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<'schedule' | 'pay'>('schedule')
  const [day, setDay] = useState('')
  const [q, setQ] = useState('')
  async function load() {
    try {
      const r = await fetch(`/api/client/events/${params.id}`)
      if (!r.ok) { setFailed(true); return }
      setD(await r.json())
    } catch { setFailed(true) }
  }
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('tab') === 'pay') setTab('pay') } catch {}
    load()
  }, [params.id])

  const days = useMemo(() => Array.from(new Set((d?.schedule ?? []).map(g => g.date))).sort(), [d])
  useEffect(() => { if (days.length && !days.includes(day)) setDay(days[0]) }, [days, day])

  if (failed) return <div className="p-10 text-center text-slate-500">This event isn&apos;t one of yours. <Link href="/dashboard/client" className="font-semibold text-teal-700">Your events</Link></div>
  if (!d) return <p className="p-10 text-center text-slate-400">Loading…</p>
  const t = d.tournament
  const orgName = d.org?.name || 'Your assigner'
  const contactEmail = d.org?.contactEmail || d.assigners[0]?.email || ''

  return (
    <div className="mx-auto max-w-4xl px-1 py-2 sm:py-4">
      <Toaster position="top-center" />
      <Link href="/dashboard/client" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 print:hidden"><ChevronLeft size={15} aria-hidden />Your events</Link>

      {d.as !== 'client' && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 print:hidden">
          <Eye size={16} className="mt-0.5 flex-shrink-0" aria-hidden />
          <p>This is what this event&apos;s tournament director sees. Marking someone paid here is the same as on Staff pay.</p>
        </div>
      )}

      <div className="mb-4 flex items-start gap-3">
        {t.logoUrl
          ? <img src={t.logoUrl} alt="" className="h-14 w-14 flex-shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" />
          : <span aria-hidden className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-teal-50 text-xl font-bold text-teal-700">{t.name.charAt(0)}</span>}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t.name}</h1>
          <p className="text-sm text-slate-500">{[dateRange(t), t.location].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
            <span>Officials by <b>{orgName}</b></span>
            {d.org?.contactPhone && telHref(d.org.contactPhone) && <a href={telHref(d.org.contactPhone)} className="inline-flex items-center gap-1 font-medium text-teal-700"><Phone size={13} aria-hidden />{d.org.contactPhone}</a>}
            {contactEmail && <a href={`mailto:${contactEmail}`} className="inline-flex items-center gap-1 font-medium text-teal-700"><Mail size={13} aria-hidden />{contactEmail}</a>}
          </p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 print:hidden" role="tablist">
        {([['schedule', 'Schedule', CalendarDays], ['pay', 'Staff pay', Wallet]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${tab === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <Icon size={16} className={tab === k ? 'text-teal-600' : ''} aria-hidden />{label}
          </button>
        ))}
      </div>

      {tab === 'schedule'
        ? <ScheduleTab d={d} day={day} setDay={setDay} days={days} q={q} setQ={setQ} />
        : <PayTab d={d} id={params.id} reload={load} />}

      <p className="mt-8 text-center text-xs text-slate-400">Powered by Whistle Ready</p>
    </div>
  )
}

function ScheduleTab({ d, day, setDay, days, q, setQ }: { d: Data; day: string; setDay: (v: string) => void; days: string[]; q: string; setQ: (v: string) => void }) {
  const scores = d.sections.includes('scores')
  const live = d.schedule.filter(g => !g.isCanceled)
  const full = live.filter(g => g.officials.filter(o => o.role.startsWith('ref')).length >= g.refCount).length
  const open = live.reduce((n, g) => n + Math.max(0, g.refCount - g.officials.filter(o => o.role.startsWith('ref')).length), 0)
  const needle = q.trim().toLowerCase()
  const shown = d.schedule.filter(g => needle
    ? [g.team1, g.team2, g.division, g.location, g.gameNumber, ...g.officials.map(o => o.name)].some(v => String(v || '').toLowerCase().includes(needle))
    : g.date === day)
  if (!d.schedule.length) return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No games yet. They show here once {d.org?.name || 'your assigner'} adds them.</div>
  return (
    <div>
      <p className="mb-3 text-sm text-slate-600"><b>{live.length}</b> games · <b>{full}</b> with every referee{open > 0 ? <> · <b className="text-amber-700">{open}</b> referee spot{open === 1 ? '' : 's'} still open</> : null}</p>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        {!needle && days.length > 1 && (
          <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Day">
            {days.map(x => (
              <button key={x} type="button" onClick={() => setDay(x)} aria-pressed={x === day}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${x === day ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{formatDate(x)}</button>
            ))}
          </div>
        )}
        <label className="relative sm:ml-auto sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a team, field or official" aria-label="Find a team, field or official"
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" />
        </label>
      </div>
      <div className="space-y-2">
        {shown.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No games match.</p>}
        {shown.map(g => {
          const refs = g.officials.filter(o => o.role.startsWith('ref')).length
          const missing = g.isCanceled ? 0 : Math.max(0, g.refCount - refs)
          return (
            <div key={g.id} className={`rounded-2xl border bg-white p-3 sm:p-4 ${g.isCanceled ? 'border-slate-200 opacity-60' : missing ? 'border-amber-200' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-bold text-slate-900">{formatTime(g.startTime)}</span>
                {needle && <span className="text-slate-500">{formatDate(g.date)}</span>}
                <span className="inline-flex items-center gap-1 text-slate-600"><MapPin size={13} aria-hidden />{g.location}</span>
                <span className="text-slate-500">{g.division}</span>
                <span className="text-slate-400">#{g.gameNumber}</span>
                {g.isChampionship && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Championship</span>}
                {g.isCanceled && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Canceled</span>}
              </div>
              <p className={`mt-1 font-semibold text-slate-800 ${g.isCanceled ? 'line-through' : ''}`}>
                {g.team1} <span className="font-normal text-slate-400">vs</span> {g.team2}
                {scores && g.score1 != null && g.score2 != null && <span className="ml-2 rounded-md bg-slate-900 px-1.5 py-0.5 text-sm font-bold text-white">{g.score1}–{g.score2}</span>}
              </p>
              {!g.isCanceled && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.officials.map(o => {
                    const tel = telHref(o.phone)
                    const chip = <><span className="font-bold text-teal-700">{SLOT[o.role] ?? o.label}</span> {o.name}{o.phone ? <span className="text-slate-400"> · {o.phone}</span> : null}</>
                    return tel
                      ? <a key={o.role} href={tel} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:border-teal-300"><Phone size={11} className="text-teal-600" aria-hidden />{chip}</a>
                      : <span key={o.role} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700">{chip}</span>
                  })}
                  {Array.from({ length: missing }).map((_, i) => (
                    <span key={'open' + i} className="rounded-full border border-dashed border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Referee needed</span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PayTab({ d, id, reload }: { d: Data; id: string; reload: () => Promise<void> }) {
  const [paying, setPaying] = useState<string | null>(null)
  const [method, setMethod] = useState('zelle')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const fee = d.fee
  const orgName = d.org?.name || 'your assigner'
  async function markPaid(p: Person) {
    setBusy(true)
    try {
      const r = await fetch(`/api/client/events/${id}/paid`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workerId: p.workerId, method, notes: notes.trim() || null }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error || 'That didn’t save. Please try again.'); return }
      toast.success(`${p.name} marked paid`); setPaying(null); setNotes(''); await reload()
    } finally { setBusy(false) }
  }
  async function unpay(p: Person, rec: PayRecord) {
    if (!window.confirm(`Undo the ${money(rec.amount)} payment to ${p.name}?`)) return
    const r = await fetch(`/api/client/events/${id}/paid?recordId=${encodeURIComponent(rec.id)}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Payment undone'); await reload() } else toast.error('That didn’t save. Please try again.')
  }
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Staff pay" value={money(d.pay.total)} />
        <Stat label="Paid" value={money(d.pay.paid)} tone="green" />
        <Stat label="Still to pay" value={money(d.pay.owed)} tone={d.pay.owed > 0.004 ? 'amber' : undefined} />
        {fee.fronted > 0
          ? <Stat label={`Owed to ${orgName}`} value={money(fee.owed)} sub={fee.state === 'paid' ? 'paid' : fee.paid > 0 ? `${money(fee.due)} still due` : 'fee + staff pay they paid'} tone={fee.state === 'paid' ? 'green' : undefined} />
          : <Stat label="Assigning fee" value={money(fee.total)} sub={!fee.amount ? 'none set' : fee.state === 'paid' ? 'paid' : fee.paid > 0 ? `${money(fee.due)} still due` : (fee.per === 'event' ? 'for the event' : `${money(fee.amount)} × ${fee.games} game${fee.games === 1 ? '' : 's'}`)} tone={fee.state === 'paid' ? 'green' : undefined} />}
      </div>
      {fee.owed > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700">
          {fee.fronted > 0
            // Staff pay the head assigner paid for them (lib/officialsPayer, Oct 21 2026).
            ? <p>You owe {orgName} <b>{money(fee.owed)}</b>: the assigning fee {money(fee.total)} plus <b>{money(fee.fronted)}</b> of staff pay they paid for you{d.org?.zelleHandle ? <> (Zelle: <b>{d.org.zelleHandle}</b>)</> : null}.</p>
            : <p>Staff pay plus the assigning fee: <b>{money(d.pay.total + fee.total)}</b>. The assigning fee goes to {orgName}{d.org?.zelleHandle ? <> (Zelle: <b>{d.org.zelleHandle}</b>)</> : null}.</p>}
          {/* What they've paid toward it, as the head assigner recorded it (Oct 21 2026). */}
          <p className="mt-1.5">
            {fee.state === 'paid'
              ? <span className="font-semibold text-emerald-700">{fee.fronted > 0 ? 'Paid in full' : 'Assigning fee paid'}. Thank you!</span>
              : fee.paid > 0
                ? <>You've paid <b>{money(fee.paid)}</b> of it; <b className="text-amber-700">{money(fee.due)}</b> is still due.</>
                : <><b className="text-amber-700">{money(fee.due)}</b> is still due.</>}
            {fee.payments.length > 0 && <span className="text-slate-500"> {fee.payments.map(p => `${money(p.amount)} on ${new Date(p.on + 'T12:00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}`).join(', ')}.</span>}
          </p>
          <p className="mt-1 text-xs text-slate-400">{orgName} marks it paid when they receive it.</p>
        </div>
      )}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">Each person</h2>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 print:hidden"><Printer size={15} aria-hidden />Print</button>
      </div>
      {d.pay.people.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">No one has games or hours at this event yet.</p>}
      <div className="space-y-2">
        {d.pay.people.map(p => {
          const rec = p.records[0]
          const tel = telHref(p.phone)
          return (
            <div key={p.workerId} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{p.name}</p>
                  <p className="text-sm text-slate-500">
                    {p.games.length > 0 && `${p.games.length} game${p.games.length === 1 ? '' : 's'}`}
                    {p.games.length > 0 && p.hours.length > 0 && ' · '}
                    {p.hours.length > 0 && `${p.hours.reduce((n, h) => n + h.hours, 0).toFixed(1)} hours`}
                    {tel && <> · <a href={tel} className="text-teal-700">{p.phone}</a></>}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    <span className="mr-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{pmLabel(p.payMethod)}</span>
                    {p.payHandle && <span className="font-medium">{p.payHandle}</span>}
                  </p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-lg font-bold text-slate-900">{money(p.total)}</p>
                  {p.isPaid
                    ? <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><CheckCircle2 size={13} aria-hidden />{rec?.payer === 'org' ? `Paid by ${orgName}` : 'Paid'}{rec ? ` · ${pmLabel(rec.method)}` : ''}</p>
                    : <p className="text-xs font-semibold text-amber-700">Not paid yet</p>}
                </div>
              </div>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700">What it&apos;s for</summary>
                <ul className="mt-1 space-y-0.5 text-slate-600">
                  {p.games.map((g, i) => <li key={'g' + i}>{formatDate(g.date)} {formatTime(g.startTime)} · {g.location} · #{g.gameNumber} {g.role}: <b>{money(g.pay)}</b></li>)}
                  {p.hours.map((h, i) => <li key={'h' + i}>{formatDate(h.date)} · {h.hours.toFixed(2)} hours: <b>{money(h.pay)}</b></li>)}
                </ul>
              </details>
              <div className="mt-2 print:hidden">
                {p.isPaid ? (
                  <p className="text-xs text-slate-500">
                    {rec ? `${money(rec.amount)} on ${new Date(rec.paidAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${rec.paidBy ? ` by ${rec.paidBy}` : ''}` : ''}
                    {rec && rec.payer !== 'org' && <button type="button" onClick={() => unpay(p, rec)} className="ml-2 font-semibold text-slate-500 underline hover:text-red-600">Unpay</button>}
                  </p>
                ) : paying === p.workerId ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="mb-2 text-sm font-semibold text-emerald-900">Confirm payment of {money(p.total)} to {p.name}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select value={method} onChange={e => setMethod(e.target.value)} aria-label="How you paid" className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm">
                        {PAY_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                      <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Note (optional)" aria-label="Note" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                      <button type="button" disabled={busy} onClick={() => markPaid(p)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">✓ Confirm</button>
                      <button type="button" onClick={() => setPaying(null)} className="px-2 py-2 text-sm text-slate-500">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => { setPaying(p.workerId); setMethod(PAY_METHODS.some(m => m.value === p.payMethod) ? p.payMethod : 'other'); setNotes('') }}
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Mark paid</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'green' | 'amber' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${tone === 'green' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}
