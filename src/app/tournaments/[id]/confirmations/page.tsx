'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Check, Mail, Search, X } from 'lucide-react'
import TournamentNav from '../TournamentNav'
import RefLevelPill from '@/components/RefLevelPill'
import { dayTitle, time12 } from '@/lib/availabilityAnswers'

// Officials' confirmations (Bo, Oct 15 2026; lib/officialConfirm has the why). After
// Notify officials asks officials to confirm their games, this shows who confirmed,
// who hasn't answered, whose games changed after they confirmed, and the games people
// can't work (with their reason, and whether the slot has been filled). Reminders go
// out through Notify officials, to just the people picked here. Data:
// GET /api/tournaments/[id]/official-confirm. Directors, admins and assigners.

type Decline = { gameId: string; role: string; num: string; date: string; time: string; field: string; teams: string; note: string; at: string; filledBy: string | null }
type Person = { id: string; name: string; jobs: string[]; level: number | null; hasEmail: boolean; games: number; yes: number; waiting: number; changed: number; changedGames: { num: string; date: string; time: string; field: string }[]; declined: Decline[]; answeredAt: string; askedAt: string }
type Data = {
  event: { id: string; name: string; logoUrl: string; startDate: string; endDate: string; location: string }
  ask: { confirmBy: string; at: string; by: string } | null
  deadlinePassed: boolean
  totals: { officials: number; confirmed: number; waiting: number; changed: number; declinedGames: number; declinedPeople: number; openDeclines: number }
  people: Person[]
}
type Filter = 'all' | 'waiting' | 'declined' | 'changed' | 'confirmed'

const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: 'Everyone' },
  { k: 'waiting', label: 'No answer' },
  { k: 'declined', label: "Can't work" },
  { k: 'changed', label: 'Changed' },
  { k: 'confirmed', label: 'Confirmed' },
]
const tests: Record<Filter, (p: Person) => boolean> = {
  all: () => true,
  waiting: p => p.waiting > 0,
  declined: p => p.declined.length > 0,
  changed: p => p.changed > 0,
  confirmed: p => p.games > 0 && p.yes === p.games,
}
const when = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
const short = (iso: string) => {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
const jobLabel = (p: Person) => p.jobs.includes('ref') ? 'Ref' : p.jobs.includes('scorekeeper') ? 'SK' : ''

export default function ConfirmationsPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [ask, setAsk] = useState<{ ids: string[]; what: string } | null>(null)   // the "email N" check
  const [busy, setBusy] = useState('')

  async function load() {
    const res = await fetch(`/api/tournaments/${params.id}/official-confirm`).catch(() => null)
    const j = res ? await res.json().catch(() => null) : null
    if (!res?.ok || !j) { setErr(j?.error || 'Could not load confirmations.'); return }
    setErr(''); setData(j)
  }
  useEffect(() => { load() }, [params.id])

  async function remind(ids: string[]) {
    setBusy('remind')
    try {
      const r = await fetch(`/api/tournaments/${params.id}/notify-officials`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, reminder: true, workerIds: ids, confirmBy: data?.ask?.confirmBy || undefined }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d.error || 'That didn’t send. Try again.'); return }
      toast.success(`Reminder sent to ${d.emailed} official${d.emailed === 1 ? '' : 's'}${d.pushed ? ` · ${d.pushed} phone alert${d.pushed === 1 ? '' : 's'}` : ''}`)
      if (d.failed?.length) toast.error(`Didn’t go through for: ${d.failed.join(', ')}`)
      if (d.noEmail?.length) toast(`No email on file: ${d.noEmail.join(', ')}`)
      setAsk(null); load()
    } finally { setBusy('') }
  }
  async function markConfirmed(p: Person) {
    setBusy('mark:' + p.id)
    try {
      const r = await fetch(`/api/tournaments/${params.id}/official-confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm', workerId: p.id }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d.error || 'That didn’t save.'); return }
      toast.success(`Marked ${p.name}'s ${d.marked} game${d.marked === 1 ? '' : 's'} confirmed`)
      setData(d)
    } finally { setBusy('') }
  }

  if (err) return <div className="px-0 sm:px-6"><div className="card p-6 text-center text-slate-500">{err}</div></div>
  if (!data) return <div className="px-0 sm:px-6"><div className="card p-6 text-center text-slate-400">Loading…</div></div>

  const t = data.event
  const people = data.people
  const ql = q.trim().toLowerCase()
  const shown = people.filter(p => tests[filter](p) && (!ql || p.name.toLowerCase().includes(ql)))
  const waitingIds = people.filter(p => p.waiting > 0 && p.hasEmail).map(p => p.id)
  const changedIds = people.filter(p => p.changed > 0 && p.hasEmail).map(p => p.id)
  const tt = data.totals
  const board = (date?: string) => `/tournaments/${params.id}${date ? `?day=${date}` : ''}`

  const answer = (p: Person) => (
    <div className="space-y-1 text-[13px] leading-snug">
      {p.games > 0 && (p.yes === p.games
        ? <p className="text-emerald-800"><b className="inline-flex items-center gap-1"><Check size={14} strokeWidth={3} />Confirmed</b>{p.answeredAt && <span className="text-slate-500"> {when(p.answeredAt)}</span>}</p>
        : p.yes === 0 && p.changed === 0
          ? <p className="text-amber-800"><b>No answer yet</b><span className="text-slate-500"> {p.askedAt ? `· emailed ${short(p.askedAt)}` : '· not emailed yet'}</span></p>
          : <p className="text-slate-800"><b>Confirmed {p.yes} of {p.games}</b>{p.waiting > 0 && <span className="text-amber-800"> · {p.waiting} waiting</span>}</p>)}
      {p.changedGames.map((g, i) => (
        <p key={'c' + i} className="text-sky-800"><b>Game changed</b> <span className="text-slate-600">#{g.num} is now {dayTitle(g.date, true)} {time12(g.time)} · {g.field}</span></p>
      ))}
      {p.declined.map((d, i) => (
        <p key={'d' + i} className="text-red-800"><b>Can&apos;t work #{d.num}</b> <span className="text-slate-600">({dayTitle(d.date, true).split(',')[0]} {time12(d.time)}){d.note ? ` “${d.note}”` : ''}</span>
          <span className={`ml-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full ${d.filledBy ? 'bg-slate-100 text-slate-600' : 'bg-red-100 text-red-800'}`}>{d.filledBy ? `Filled by ${d.filledBy.split(/\s+/)[0]}` : 'Still open'}</span></p>
      ))}
    </div>
  )
  const actions = (p: Person) => {
    const open = p.declined.find(d => !d.filledBy)
    return (
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {open && <Link href={board(open.date)} className="h-8 px-3 rounded-full border border-red-300 bg-white text-[13px] font-bold text-red-800 inline-flex items-center hover:bg-red-50">Fill #{open.num}</Link>}
        {(p.waiting > 0 || p.changed > 0) && p.hasEmail && (
          <button type="button" onClick={() => remind([p.id])} disabled={!!busy} className="h-8 px-3 rounded-full border border-slate-300 bg-white text-[13px] font-bold text-slate-900 inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-60">
            <Mail size={14} />{p.changed > 0 ? 'Ask again' : 'Remind'}
          </button>
        )}
        {(p.waiting > 0 || p.changed > 0) && (
          <button type="button" onClick={() => markConfirmed(p)} disabled={!!busy} title="They confirmed by phone or text" className="h-8 px-2 text-[12px] font-semibold text-slate-500 underline hover:text-slate-800 disabled:opacity-60">
            {busy === 'mark:' + p.id ? 'Saving…' : 'Mark confirmed'}
          </button>
        )}
        {(p.waiting > 0 || p.changed > 0) && !p.hasEmail && <span className="text-[11px] text-slate-400">No email</span>}
      </div>
    )
  }

  return (
    <div className="px-0 sm:px-6">
      <TournamentNav id={params.id} name={t.name} logoUrl={t.logoUrl} />

      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <Link href={board()} className="text-[13px] font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1"><ArrowLeft size={14} />Assigner</Link>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">Officials&apos; confirmations</h1>
          <p className="text-sm text-slate-500 mt-1">
            {data.ask ? <>Asked {short(data.ask.at)}{data.ask.by ? ` by ${data.ask.by.split(/\s+/)[0]}` : ''}{data.ask.confirmBy ? <> · confirm by {dayTitle(data.ask.confirmBy, true)}</> : ''}{data.deadlinePassed && <span className="text-red-600 font-semibold"> · past the date</span>}</> : 'Officials haven’t been asked to confirm yet.'}
          </p>
        </div>
      </div>

      {!data.ask && people.length === 0 ? (
        <div className="card p-6 sm:p-8 text-center">
          <p className="text-slate-700 font-semibold">Nobody has been asked to confirm yet.</p>
          <p className="text-sm text-slate-500 mt-1">On the Assigner, click <b>Notify officials</b>, keep <b>Ask them to confirm their games</b> ticked, and send.</p>
          <Link href={board()} className="inline-flex mt-4 h-10 px-4 rounded-full bg-teal-700 text-white text-sm font-bold items-center hover:bg-teal-800">Open the Assigner</Link>
        </div>
      ) : (<>
        {/* Confirmed, no answer, can't work, changed */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div className="card p-4 flex flex-col gap-1.5">
            <span className="text-xs font-extrabold tracking-wide text-slate-500 uppercase">Confirmed</span>
            <span className="flex items-baseline gap-1.5"><span className="text-3xl font-extrabold text-slate-900">{tt.confirmed}</span><span className="text-sm font-bold text-slate-500">of {tt.officials}</span></span>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-2 rounded-full bg-teal-500" style={{ width: `${tt.officials ? Math.round((tt.confirmed / tt.officials) * 100) : 0}%` }} /></div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-1.5">
            <span className="text-xs font-extrabold tracking-wide text-amber-800 uppercase">No answer yet</span>
            <span className="text-3xl font-extrabold text-amber-700">{tt.waiting}</span>
            {waitingIds.length > 0 && <button type="button" onClick={() => setAsk({ ids: waitingIds, what: 'who haven’t answered' })} className="self-start text-[13px] font-extrabold text-amber-800 underline">Email the {waitingIds.length}</button>}
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex flex-col gap-1.5">
            <span className="text-xs font-extrabold tracking-wide text-red-800 uppercase">Can&apos;t work</span>
            <span className="flex items-baseline gap-1.5"><span className="text-3xl font-extrabold text-red-700">{tt.declinedGames}</span><span className="text-sm font-bold text-red-800">game{tt.declinedGames === 1 ? '' : 's'}</span></span>
            <span className="text-xs text-red-800">{tt.declinedGames ? `${tt.declinedPeople} ${tt.declinedPeople === 1 ? 'person' : 'people'} · ${tt.openDeclines ? `${tt.openDeclines} still open` : 'all filled'}` : 'Nobody so far'}</span>
          </div>
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 flex flex-col gap-1.5">
            <span className="text-xs font-extrabold tracking-wide text-sky-800 uppercase">Games changed</span>
            <span className="text-3xl font-extrabold text-sky-700">{tt.changed}</span>
            {changedIds.length > 0 ? <button type="button" onClick={() => setAsk({ ids: changedIds, what: 'whose games changed after they confirmed' })} className="self-start text-[13px] font-extrabold text-sky-800 underline">Ask them again</button>
              : <span className="text-xs text-sky-800">After someone confirms</span>}
          </div>
        </div>

        {ask && (
          <div className="rounded-xl border border-teal-300 bg-teal-50 p-3 mb-4 flex flex-wrap items-center gap-3" role="alert">
            <p className="text-sm text-slate-800 flex-1 min-w-[14rem]">Email a reminder to the {ask.ids.length} {ask.ids.length === 1 ? 'official' : 'officials'} {ask.what}? Each gets their games and a Confirm button{data.ask?.confirmBy ? `, with ${dayTitle(data.ask.confirmBy, true)} as the date` : ''}.</p>
            <button type="button" onClick={() => remind(ask.ids)} disabled={busy === 'remind'} className="h-9 px-4 rounded-full bg-teal-700 text-white text-sm font-bold inline-flex items-center gap-1.5 hover:bg-teal-800 disabled:opacity-60"><Mail size={15} />{busy === 'remind' ? 'Sending…' : `Send to ${ask.ids.length}`}</button>
            <button type="button" onClick={() => setAsk(null)} className="text-sm text-slate-600">Cancel</button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
          <div role="tablist" aria-label="Show" className="flex gap-1 p-1 rounded-full bg-slate-200 overflow-x-auto max-w-full">
            {FILTERS.map(f => {
              const n = people.filter(tests[f.k]).length
              const on = filter === f.k
              return (
                <button key={f.k} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f.k)}
                  className={`h-8 pl-3 pr-2 rounded-full text-[13px] font-bold inline-flex items-center gap-2 whitespace-nowrap ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {f.label}<span className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-extrabold inline-flex items-center justify-center ${on ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{n}</span>
                </button>
              )
            })}
          </div>
          <label className="sm:ml-auto flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-300 bg-white w-full sm:w-56">
            <Search size={15} className="text-slate-400 shrink-0" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find an official" className="flex-1 min-w-0 bg-transparent text-sm outline-none border-0 p-0" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear"><X size={14} className="text-slate-400" /></button>}
          </label>
        </div>

        {/* Computer: a row per official */}
        <div className="hidden md:block card">
          <div className="grid grid-cols-[minmax(0,1.1fr)_64px_minmax(0,2.4fr)_250px] items-center gap-3 px-5 h-11 text-xs font-extrabold tracking-wide text-slate-500 uppercase">
            <span>Official</span><span>Games</span><span>Answer</span><span />
          </div>
          {shown.map(p => (
            <div key={p.id} className={`grid grid-cols-[minmax(0,1.1fr)_64px_minmax(0,2.4fr)_250px] items-center gap-3 px-5 py-3 border-t border-slate-100 ${p.declined.some(d => !d.filledBy) ? 'bg-red-50/40' : ''}`}>
              <span className="flex items-center gap-1.5 min-w-0"><span className="font-semibold text-slate-900 truncate">{p.name}</span><RefLevelPill level={p.level} />{jobLabel(p) === 'SK' && <span className="text-xs text-slate-500">(SK)</span>}</span>
              <span className="text-sm text-slate-700">{p.games}</span>
              {answer(p)}
              {actions(p)}
            </div>
          ))}
          {shown.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">Nobody here.</p>}
        </div>

        {/* Phone: a card per official */}
        <div className="md:hidden space-y-2">
          {shown.map(p => (
            <div key={p.id} className={`card p-3 ${p.declined.some(d => !d.filledBy) ? 'border-red-200' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 min-w-0"><span className="font-semibold text-slate-900 truncate">{p.name}</span><RefLevelPill level={p.level} /></p>
                <span className="text-xs text-slate-500 shrink-0">{p.games} game{p.games === 1 ? '' : 's'}</span>
              </div>
              <div className="mt-1.5">{answer(p)}</div>
              <div className="mt-2">{actions(p)}</div>
            </div>
          ))}
          {shown.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nobody here.</p>}
        </div>
      </>)}
    </div>
  )
}
