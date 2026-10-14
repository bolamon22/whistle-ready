'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { Users, Calendar, Clock, Wallet, Mail, Check, ChevronDown, Search, X } from 'lucide-react'
import TournamentNav from '../TournamentNav'
import IfCanOpen from '@/components/IfCanOpen'
import ExactTimesSheet from '@/components/ExactTimesSheet'
import { useRefGender, RefGenderSelect, matchesRefGender } from '@/components/StaffGenderFilter'
import { AvailAnswer, DayState, availabilityLetter, covers, dayTitle, eventRange, isMorning, stateLabel, stateTone, time12 } from '@/lib/availabilityAnswers'

// The head assigner's Availability page (Bo, Oct 14 2026). Staff now answer every day
// (All day, Morning, Afternoon, game times, Can't work) from their home page, and
// every answer is saved, so this page shows who has answered and who hasn't, with a
// filter, and "Email the N who haven't answered" sends each of them a link to their
// days (api/availability/remind). Tapping an answer sets it for someone who texted
// instead. The ref coverage row compares refs who can work with the ref spots at the
// busiest game time of each half day, like a When2Meet heat map for the assigner.
// It replaced the "Unavailability" grid, where everyone counted as available until
// marked out. Data: GET /api/availability/answers.

type Slot = { t: string; n: number; refs: { boys: number; girls: number; both: number } }
type Day = { date: string; times: Slot[] }
type Person = { id: string; name: string; jobs: string[]; gender: string; hasEmail: boolean; canRemind: boolean; days: Record<string, DayState>; remindedAt: string }
type Data = {
  tournament: { id: string; name: string; startDate: string; endDate: string; location: string; logoUrl: string }
  published: boolean
  days: Day[]
  people: Person[]
  reminders: { at: string; by: string; n: number } | null
}
type Filter = 'all' | 'none' | 'no' | 'part'

const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: 'Everyone' },
  { k: 'none', label: 'No answer yet' },
  { k: 'no', label: "Can't work a day" },
  { k: 'part', label: 'Part of a day' },
]
const JOBS: { k: string; label: string; one: string }[] = [
  { k: 'ref', label: 'Refs', one: 'Referee' },
  { k: 'scorekeeper', label: 'Scorekeepers', one: 'Scorekeeper' },
  { k: 'athletic_trainer', label: 'Trainers', one: 'Athletic trainer' },
  { k: 'field_ops', label: 'Field ops', one: 'Field ops' },
]
const MENU: { a: AvailAnswer; label: string; dot: string }[] = [
  { a: 'all', label: 'All day', dot: 'bg-teal-500' },
  { a: 'am', label: 'Morning', dot: 'bg-amber-500' },
  { a: 'pm', label: 'Afternoon', dot: 'bg-amber-500' },
  { a: 'no', label: "Can't work", dot: 'bg-rose-600' },
]
const PILL: Record<'yes' | 'part' | 'no' | 'none', string> = {
  yes: 'bg-teal-100 border-teal-200 text-teal-800',
  part: 'bg-amber-100 border-amber-200 text-amber-800',
  no: 'bg-rose-100 border-rose-200 text-rose-800',
  none: 'bg-white border-dashed border-slate-400 text-slate-500',
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name
const jobLabel = (p: Person) => JOBS.find(j => p.jobs.includes(j.k))?.one || 'Staff'
const asWorker = (p: Person) => ({ roles: JSON.stringify(p.jobs), defaultRole: p.jobs[0] || '', gender: p.gender })
function ago(iso: string): string {
  const t = new Date(iso).getTime()
  if (!iso || isNaN(t)) return ''
  const m = Math.round((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const y = new Date(); y.setDate(y.getDate() - 1)
  if (new Date(t).toDateString() === y.toDateString()) return 'yesterday'
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AvailabilityPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [job, setJob] = useState('all')
  const [q, setQ] = useState('')
  const [gender, setGender] = useRefGender(params.id)
  const [menu, setMenu] = useState<{ id: string; date: string } | null>(null)
  const [sheet, setSheet] = useState<{ id: string; date: string } | null>(null)
  const [dialog, setDialog] = useState(false)
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')

  async function load() {
    const res = await fetch(`/api/availability/answers?tournamentId=${encodeURIComponent(params.id)}`).catch(() => null)
    const j = res ? await res.json().catch(() => null) : null
    if (!res?.ok || !j) { setErr(j?.error || 'Could not load availability.'); return }
    setErr(''); setData(j)
  }
  useEffect(() => { load() }, [params.id])

  const days = data?.days || []
  const missing = (p: Person) => days.some(d => !p.days[d.date])
  const group = useMemo(() => (data?.people || []).filter(p => matchesRefGender(asWorker(p), gender)), [data, gender])
  const tests: Record<Filter, (p: Person) => boolean> = {
    all: () => true,
    none: missing,
    no: p => days.some(d => stateTone(p.days[d.date]) === 'no'),
    part: p => days.some(d => stateTone(p.days[d.date]) === 'part'),
  }
  const jobOk = (p: Person) => job === 'all' || p.jobs.includes(job)
  const ql = q.trim().toLowerCase()
  const shown = group.filter(p => jobOk(p) && tests[filter](p) && (!ql || p.name.toLowerCase().includes(ql)))
  const unanswered = group.filter(missing)
  const answered = group.length - unanswered.length
  const newest = group.flatMap(p => Object.values(p.days).map(s => s.at)).filter(Boolean).sort().pop() || ''

  // Ref coverage, per half day: at the start time where the refs who can work fall
  // furthest short of the ref spots, how many can work, how many are needed.
  const refs = group.filter(p => p.jobs.includes('ref'))
  const need = (s: Slot) => gender === 'boys' ? s.refs.boys + s.refs.both : gender === 'girls' ? s.refs.girls + s.refs.both : s.refs.boys + s.refs.girls + s.refs.both
  const coverage = days.map(d => {
    const maybe = refs.filter(p => !p.days[d.date]).length
    const half = (am: boolean) => {
      const slots = d.times.filter(s => isMorning(s.t) === am)
      if (!slots.length) return null
      const rows = slots.map(s => ({ t: s.t, need: need(s), can: refs.filter(p => p.days[d.date] && covers(p.days[d.date], s.t)).length }))
      const worst = rows.reduce((w, r) => (r.need - r.can > w.need - w.can || (r.need - r.can === w.need - w.can && r.need > w.need) ? r : w))
      return { ...worst, short: worst.need - worst.can, maybe }
    }
    return { date: d.date, am: half(true), pm: half(false), none: d.times.length === 0, said: refs.filter(p => p.days[d.date] && p.days[d.date].a !== 'no').length }
  })

  async function setFor(p: Person, date: string, a: AvailAnswer, times: string[] = []): Promise<boolean> {
    setMenu(null); setBusy(p.id + date)
    const res = await fetch('/api/availability/answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: params.id, workerId: p.id, date, answer: a, times }) }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    setBusy('')
    if (!res?.ok) { toast.error(j.error || 'Could not save. Try again.'); return false }
    setData(dt => dt ? { ...dt, people: dt.people.map(x => x.id === p.id ? { ...x, days: j.days || {} } : x) } : dt)
    toast.success(`Saved ${first(p.name)}'s ${dayTitle(date).split(',')[0]}. They'll see it on their staff home.`)
    return true
  }

  async function remind(ids: string[]): Promise<void> {
    if (!ids.length) return
    setBusy('remind')
    const res = await fetch('/api/availability/remind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tournamentId: params.id, workerIds: ids }) }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    setBusy('')
    if (!res?.ok) { toast.error(j.error || 'Could not send. Try again.'); return }
    const left = (j.skipped || []).map((s: { name: string; reason: string }) => `${s.name}: ${s.reason.toLowerCase()}`)
    if (j.sent) toast.success(`Sent ${j.sent} email${j.sent === 1 ? '' : 's'}.${left.length ? ` Skipped ${left.join('; ')}.` : ''}`, { duration: 6000 })
    else toast.error(j.emailOn === false ? 'Email isn’t set up, so nothing was sent.' : (j.failed?.length ? `Couldn't send to ${j.failed.join(', ')}.` : `Nothing sent. ${left.join('; ')}.`))
    setDialog(false)
    load()
  }

  if (err) return <div className="px-0 sm:px-6"><div className="card p-6 text-center text-slate-500">{err}</div></div>
  if (!data) return <div className="text-slate-400 text-center py-12">Loading…</div>
  const t = data.tournament
  const sheetP = sheet ? data.people.find(p => p.id === sheet.id) : null
  const sheetD = sheet ? days.find(d => d.date === sheet.date) : null
  const sendable = unanswered.filter(p => p.canRemind && p.hasEmail && !skip.has(p.id))
  const sample = sendable[0] || unanswered[0]
  const letter = sample ? availabilityLetter({ firstName: first(sample.name), eventName: t.name, when: eventRange(t.startDate, t.endDate || t.startDate), where: t.location, days: days.map(d => ({ label: dayTitle(d.date), answered: !!sample.days[d.date] })), link: '' }) : null
  const cols = `minmax(190px,1.5fr) 130px repeat(${Math.max(days.length, 1)}, minmax(150px,1fr)) 150px 130px`

  const pill = (p: Person, d: Day) => {
    const s = p.days[d.date]
    const open = menu?.id === p.id && menu?.date === d.date
    const posted = d.times.map(x => x.t)
    return (
      <div className="relative">
        <button type="button" onClick={() => setMenu(open ? null : { id: p.id, date: d.date })} aria-haspopup="menu" aria-expanded={open} disabled={busy === p.id + d.date}
          className={`h-8 pl-3 pr-2 rounded-full border text-[13px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap hover:brightness-95 ${PILL[stateTone(s)]}`}>
          {stateLabel(s, posted)}<ChevronDown size={13} />
        </button>
        {open && (
          <>
            <button type="button" aria-label="Close" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenu(null)} />
            <div role="menu" className="absolute left-0 top-10 z-40 w-60 rounded-2xl border border-slate-200 bg-white shadow-xl p-1.5">
              <p className="px-2.5 pt-2 pb-1.5 text-[11px] font-extrabold tracking-wide text-slate-500 uppercase">Set {first(p.name)}&apos;s {dayTitle(d.date).split(',')[0]}</p>
              {MENU.map(m => (
                <button key={m.a} type="button" role="menuitem" onClick={() => setFor(p, d.date, m.a)}
                  className="w-full h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 text-left">
                  <span className={`w-2.5 h-2.5 rounded-full ${m.dot}`} />{m.label}{s?.a === m.a && <Check size={14} className="ml-auto text-teal-700" />}
                </button>
              ))}
              {d.times.length > 0 && (
                <button type="button" role="menuitem" onClick={() => { setMenu(null); setSheet({ id: p.id, date: d.date }) }}
                  className="w-full h-9 px-2.5 rounded-lg flex items-center gap-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100 text-left border-t border-slate-100 mt-1 pt-1">
                  <Clock size={13} className="text-slate-500" />Pick game times…
                </button>
              )}
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] leading-snug text-slate-500">For someone who texted you. They&apos;ll see it on their staff home.</p>
            </div>
          </>
        )}
      </div>
    )
  }
  const answeredAt = (p: Person) => {
    const all = Object.values(p.days)
    if (!all.length) return { text: '—', by: '' }
    const at = all.map(s => s.at).filter(Boolean).sort().pop() || ''
    const by = all.find(s => s.by && s.by !== 'self')?.by || ''
    return { text: at ? ago(at) : 'Earlier', by }
  }
  const action = (p: Person) => {
    if (!missing(p)) return null
    if (!p.hasEmail) return <span className="text-xs font-semibold text-slate-400">No email · text them</span>
    if (!p.canRemind) return null
    const today = p.remindedAt && new Date(p.remindedAt).toDateString() === new Date().toDateString()
    return (
      <span className="inline-flex items-center gap-2">
        {p.remindedAt && <span className="text-xs font-semibold text-teal-700 inline-flex items-center gap-1"><Check size={13} strokeWidth={3} />{today ? 'Reminded today' : `Reminded ${ago(p.remindedAt)}`}</span>}
        {!today && <button type="button" onClick={() => remind([p.id])} disabled={busy === 'remind'} className="h-8 px-3 rounded-full border border-slate-300 bg-white text-[13px] font-bold text-slate-900 inline-flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-60"><Mail size={14} />Remind</button>}
      </span>
    )
  }

  return (
    <div className="px-0 sm:px-6" data-avail>
      <TournamentNav id={params.id} name={t.name} logoUrl={t.logoUrl} />

      {/* Staff sub-nav */}
      <div className="flex items-center gap-0.5 sm:gap-1 mb-5 sm:mb-6 border-b border-slate-200 overflow-x-auto">
        <Link href={`/tournaments/${params.id}/roster`}
          className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap">
          <Users size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Staff Roster
        </Link>
        <Link href={`/tournaments/${params.id}/availability`}
          className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-teal-600 text-teal-700 transition-colors whitespace-nowrap">
          <Calendar size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Availability
        </Link>
        <IfCanOpen href={`/tournaments/${params.id}/time-entries`}>
          <Link href={`/tournaments/${params.id}/time-entries`}
            className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap">
            <Clock size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Time Entries
          </Link>
        </IfCanOpen>
        <IfCanOpen href={`/tournaments/${params.id}/pay-summary`}>
          <Link href={`/tournaments/${params.id}/pay-summary`}
            className="px-2 sm:px-4 py-2 text-[13px] sm:text-sm font-medium border-b-2 -mb-px border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 transition-colors whitespace-nowrap">
            <Wallet size={15} className="hidden sm:inline align-text-bottom mr-1.5" />Pay Summary
          </Link>
        </IfCanOpen>
      </div>

      <div className="page-header">
        <div>
          <h1 className="section-title">Availability</h1>
          <p className="text-sm text-slate-500 mt-1">{data.people.length} {data.people.length === 1 ? 'person' : 'people'} on the staff roster{days.length ? ` · ${eventRange(days[0].date, days[days.length - 1].date)}` : ''}{t.location ? ` · ${t.location}` : ''}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data.people.length > 0 && <RefGenderSelect value={gender} onChange={setGender} />}
          {unanswered.length > 0 ? (
            <button type="button" onClick={() => { setSkip(new Set()); setDialog(true) }}
              className="h-10 px-4 rounded-full bg-teal-700 text-white text-sm font-extrabold inline-flex items-center gap-2 hover:bg-teal-800 shadow-sm">
              <Mail size={16} />Email the {unanswered.length} who haven&apos;t answered
            </button>
          ) : group.length > 0 && (
            <span className="h-10 px-4 rounded-full bg-teal-100 text-teal-800 text-sm font-extrabold inline-flex items-center gap-2"><Check size={16} strokeWidth={3} />Everyone has answered</span>
          )}
        </div>
      </div>

      {data.people.length === 0 ? (
        <div className="card p-4 sm:p-8 text-center text-slate-400">No rostered staff. <Link href={`/tournaments/${params.id}/roster`} className="text-teal-600">Add to roster first →</Link></div>
      ) : days.length === 0 ? (
        <div className="card p-4 sm:p-8 text-center text-slate-400">Set the event&apos;s dates in Setup first; staff answer for each day.</div>
      ) : (<>
        {/* Answered, no answer yet, ref coverage */}
        <div className="grid gap-3 sm:gap-4 lg:grid-cols-[230px_230px_1fr] mb-5">
          <div className="card p-4 flex flex-col gap-2">
            <span className="text-xs font-extrabold tracking-wide text-slate-500 uppercase">Answered every day</span>
            <span className="flex items-baseline gap-1.5"><span className="text-3xl font-extrabold text-slate-900">{answered}</span><span className="text-sm font-bold text-slate-500">of {group.length}</span></span>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className="h-2 rounded-full bg-teal-500" style={{ width: `${group.length ? Math.round((answered / group.length) * 100) : 0}%` }} /></div>
            <span className="text-xs text-slate-500">{newest ? `Newest answer ${ago(newest)}` : 'No answers yet'}</span>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-col gap-2">
            <span className="text-xs font-extrabold tracking-wide text-amber-800 uppercase">No answer yet</span>
            <span className="text-3xl font-extrabold text-amber-700">{unanswered.length}</span>
            <span className="text-xs text-amber-800">{data.reminders ? `Last reminder ${ago(data.reminders.at)}, ${data.reminders.n} ${data.reminders.n === 1 ? 'person' : 'people'}${data.reminders.by ? `, by ${first(data.reminders.by)}` : ''}` : 'No reminders sent yet'}</span>
            {unanswered.length > 0 && <button type="button" onClick={() => setFilter('none')} className="self-start text-[13px] font-extrabold text-amber-800 underline">Show them</button>}
          </div>
          <div className="card p-4 flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <span className="text-xs font-extrabold tracking-wide text-slate-500 uppercase">Ref coverage</span>
              <span className="text-xs text-slate-500">Refs who can work, against ref spots at the busiest game time</span>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
              {coverage.flatMap(c => {
                const day = dayTitle(c.date, true).split(',')[0]
                if (c.none) return [
                  <div key={c.date} className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-700">{dayTitle(c.date, true)}</span>
                    <span className="text-xl font-extrabold text-slate-900">{c.said}<span className="text-[13px] font-semibold text-slate-500"> refs can work</span></span>
                    <span className="self-start text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">No schedule yet</span>
                    <span className="text-[11px] text-slate-500">Post this day&apos;s games to see how many you need.</span>
                  </div>,
                ]
                return (['am', 'pm'] as const).map(h => {
                  const x = c[h]
                  const title = `${day} ${h === 'am' ? 'morning' : 'afternoon'}`
                  if (!x) return <div key={c.date + h} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold text-slate-700">{title}</span><p className="text-[13px] text-slate-500 mt-1">No games</p></div>
                  const tone = x.need === 0 || x.short <= 0 ? 'ok' : x.short <= x.maybe ? 'warn' : 'bad'
                  const box = tone === 'ok' ? 'border-teal-200 bg-teal-50' : tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-rose-200 bg-rose-50'
                  const chip = tone === 'ok' ? 'bg-teal-100 text-teal-800' : tone === 'warn' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                  return (
                    <div key={c.date + h} className={`rounded-xl border p-3 flex flex-col gap-1 ${box}`}>
                      <span className="text-xs font-bold text-slate-700">{title}</span>
                      <span className="text-xl font-extrabold text-slate-900">{x.can}<span className="text-[13px] font-semibold text-slate-500"> of {x.need} refs at {time12(x.t)}</span></span>
                      <span className={`self-start text-[11px] font-extrabold px-2 py-0.5 rounded-full ${chip}`}>{x.short <= 0 ? 'Covered' : `Short ${x.short}`}</span>
                      <span className="text-[11px] text-slate-500 leading-snug">{x.maybe ? `${x.maybe} ${x.maybe === 1 ? 'ref hasn’t' : 'refs haven’t'} answered` : 'Every ref has answered'}</span>
                    </div>
                  )
                })
              })}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
          <div role="tablist" aria-label="Show" className="flex gap-1 p-1 rounded-full bg-slate-200 overflow-x-auto max-w-full">
            {FILTERS.map(f => {
              const n = group.filter(p => jobOk(p) && tests[f.k](p)).length
              const on = filter === f.k
              return (
                <button key={f.k} type="button" role="tab" aria-selected={on} onClick={() => setFilter(f.k)}
                  className={`h-8 pl-3 pr-2 rounded-full text-[13px] font-bold inline-flex items-center gap-2 whitespace-nowrap ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
                  {f.label}<span className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-extrabold inline-flex items-center justify-center ${f.k === 'none' && n > 0 ? 'bg-amber-100 text-amber-800' : on ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'}`}>{n}</span>
                </button>
              )
            })}
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ k: 'all', label: 'All jobs' }, ...JOBS.filter(j => group.some(p => p.jobs.includes(j.k))).map(j => ({ k: j.k, label: `${j.label} · ${group.filter(p => p.jobs.includes(j.k)).length}` }))].map(j => (
              <button key={j.k} type="button" aria-pressed={job === j.k} onClick={() => setJob(j.k)}
                className={`h-8 px-3 rounded-full border text-[13px] font-bold whitespace-nowrap ${job === j.k ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>{j.label}</button>
            ))}
          </div>
          <label className="sm:ml-auto flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-300 bg-white w-full sm:w-56">
            <Search size={15} className="text-slate-400 shrink-0" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Find a person" className="flex-1 min-w-0 bg-transparent text-sm outline-none border-0 p-0" />
            {q && <button type="button" onClick={() => setQ('')} aria-label="Clear"><X size={14} className="text-slate-400" /></button>}
          </label>
        </div>

        {/* Computer: one row per person, a column per day */}
        <div className="hidden md:block card">
          <div className="grid items-center px-5 h-11 text-xs font-extrabold tracking-wide text-slate-500 uppercase" style={{ gridTemplateColumns: cols }}>
            <span>Person</span><span>Job</span>{days.map(d => <span key={d.date}>{dayTitle(d.date, true)}</span>)}<span>Answered</span><span />
          </div>
          {shown.map(p => {
            const at = answeredAt(p)
            return (
              <div key={p.id} className="grid items-center px-5 py-2.5 min-h-[56px] border-t border-slate-100" style={{ gridTemplateColumns: cols }}>
                <span className="font-semibold text-slate-900 truncate pr-2">{p.name}</span>
                <span><span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full whitespace-nowrap">{jobLabel(p)}</span></span>
                {days.map(d => <div key={d.date}>{pill(p, d)}</div>)}
                <span className="text-[13px] text-slate-500 leading-tight">{at.text}{at.by && <span className="block text-xs text-slate-400">Set by {first(at.by)}</span>}</span>
                <span className="flex justify-end">{action(p)}</span>
              </div>
            )
          })}
          {shown.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-500">Nobody here. {filter === 'none' ? 'Everyone in this view has answered.' : ''}</p>}
        </div>

        {/* Phone: a card per person */}
        <div className="md:hidden space-y-2">
          {shown.map(p => {
            const at = answeredAt(p)
            return (
              <div key={p.id} className="card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{p.name}</p>
                    <p className="text-xs text-slate-500">{jobLabel(p)} · {at.text === '—' ? 'no answer yet' : `answered ${at.text}`}</p>
                  </div>
                  {action(p)}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  {days.map(d => (
                    <div key={d.date}>
                      <p className="text-[11px] font-bold text-slate-500 mb-1">{dayTitle(d.date, true)}</p>
                      {pill(p, d)}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
          {shown.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nobody here.</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4 text-xs text-slate-500">
          <span className={`h-6 px-2.5 rounded-full border font-bold inline-flex items-center ${PILL.yes}`}>All day</span>
          <span className={`h-6 px-2.5 rounded-full border font-bold inline-flex items-center ${PILL.part}`}>Morning, afternoon or some games</span>
          <span className={`h-6 px-2.5 rounded-full border font-bold inline-flex items-center ${PILL.no}`}>Can&apos;t work</span>
          <span className={`h-6 px-2.5 rounded-full border font-bold inline-flex items-center ${PILL.none}`}>No answer</span>
          <span className="sm:ml-auto">Tap an answer to set it for someone who texted you.</span>
        </div>
        <p className="text-xs text-slate-500 mt-2 leading-relaxed">Morning means games that start before noon. Auto-assign only puts people on games they said they can work. People who haven&apos;t answered are still treated as available.</p>
      </>)}

      {sheet && sheetP && sheetD && (
        <ExactTimesSheet title={`${first(sheetP.name)} · ${dayTitle(sheetD.date)}`} who={first(sheetP.name)} posted={sheetD.times}
          initial={sheetP.days[sheetD.date]?.a === 'times' ? sheetP.days[sheetD.date].times : []}
          onClose={() => setSheet(null)} onSave={times => setFor(sheetP, sheetD.date, 'times', times)} />
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Email the people who haven't answered">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setDialog(false)} />
          <div className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 flex flex-col gap-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900">Email the people who haven&apos;t answered</h2>
                <p className="text-sm text-slate-600 mt-1">Each email has one button that opens their {t.name} days. Untick anyone you want to leave out.</p>
              </div>
              <button type="button" onClick={() => setDialog(false)} aria-label="Close" className="shrink-0 w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200"><X size={16} /></button>
            </div>
            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {unanswered.map(p => {
                const can = p.canRemind && p.hasEmail
                const note = !p.hasEmail ? 'No email on file' : !p.canRemind ? 'Not in your staff groups' : p.remindedAt ? `Reminded ${ago(p.remindedAt)}` : jobLabel(p)
                return (
                  <label key={p.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${can ? 'cursor-pointer' : 'opacity-60'}`}>
                    <input type="checkbox" checked={can && !skip.has(p.id)} disabled={!can} onChange={() => setSkip(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })} className="w-[18px] h-[18px] accent-teal-700" />
                    <span className="flex-1 text-sm font-bold text-slate-900">{p.name}</span>
                    <span className={`text-xs ${can ? 'text-slate-500' : 'text-amber-700'}`}>{note}</span>
                  </label>
                )
              })}
            </div>
            {letter && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex flex-col gap-1.5">
                <span className="text-[11px] font-extrabold tracking-wide text-slate-500">WHAT THEY GET</span>
                <span className="text-sm font-bold text-slate-900">{letter.subject}</span>
                <span className="text-[13px] text-slate-600 leading-snug">{letter.text.split('\n\n').slice(0, 2).join(' ')}</span>
                <span className="self-start mt-1 px-3.5 py-1.5 rounded-full bg-teal-700 text-white text-xs font-extrabold">{letter.button}</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDialog(false)} className="h-10 px-4 rounded-full border border-slate-300 bg-white text-sm font-bold text-slate-900 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={() => remind(sendable.map(p => p.id))} disabled={!sendable.length || busy === 'remind'}
                className="h-10 px-5 rounded-full bg-teal-700 text-white text-sm font-extrabold hover:bg-teal-800 disabled:bg-slate-300">
                {busy === 'remind' ? 'Sending…' : sendable.length ? `Send ${sendable.length} email${sendable.length === 1 ? '' : 's'}` : 'Nobody picked'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
