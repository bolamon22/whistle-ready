'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertCircle, ArrowRight, ClipboardCheck, Clock, LayoutTemplate, ListChecks, Plus } from 'lucide-react'
import {
  announceTasksChanged, categoryLabel, dayDate, dueBucket, dueLabel, eventRange, eventWhen,
  type TaskCounts, type TaskTournament, type TaskView,
} from '@/lib/taskTemplate'
import { CheckButton, dueTone } from './CheckButton'
import StarterDialog from './StarterDialog'

// Tasks on the dashboards: the card on the tournaments page (every event), the
// strip on each tournament card, and the box on a tournament's own dashboard.
// All three read /api/tasks/overview and link into the full lists. A task can
// be checked off right here; it stays on screen, struck through, until the
// next visit, so a mis-tap is one more tap to undo.

export type OverviewEvent = TaskTournament & {
  counts: TaskCounts
  hasTasks: boolean
  next: { title: string; dueDate: string } | null
  checklist: { done: number; total: number; dueDate: string } | null
}

type Overview = {
  today: string
  counts: TaskCounts
  upNext: TaskView[]
  byTournament: OverviewEvent[]
  general: TaskCounts | null
  categories: { key: string; label: string; open: number }[]
}

/** Counts after one task is checked off (done) or reopened. */
function shift(c: TaskCounts, due: string, today: string, done: boolean): TaskCounts {
  const s = done ? -1 : 1
  const b = dueBucket(due, today)
  return { ...c, open: c.open + s, done: c.done - s, overdue: c.overdue + (b === 'overdue' ? s : 0), week: c.week + (b === 'week' ? s : 0) }
}

function applyToggle(d: Overview, t: TaskView, done: boolean): Overview {
  return {
    ...d,
    counts: shift(d.counts, t.dueDate, d.today, done),
    upNext: d.upNext.map(x => x.id === t.id ? { ...x, done } : x),
    byTournament: d.byTournament.map(e => e.id === t.tournamentId ? { ...e, counts: shift(e.counts, t.dueDate, d.today, done) } : e),
    general: d.general && !t.tournamentId ? shift(d.general, t.dueDate, d.today, done) : d.general,
    categories: d.categories.map(c => c.key === t.category ? { ...c, open: c.open + (done ? -1 : 1) } : c),
  }
}

/** Where a task opens in the full list. */
export function taskHref(t: Pick<TaskView, 'id' | 'kind' | 'tournamentId'>): string {
  if (t.kind === 'checklist') return `/tournaments/${t.tournamentId}/tasks#setup`
  return t.tournamentId ? `/tournaments/${t.tournamentId}/tasks?task=${encodeURIComponent(t.id)}` : `/tasks?event=general&task=${encodeURIComponent(t.id)}`
}

function useOverview(query: string) {
  const [data, setData] = useState<Overview | null>(null)
  const self = useId()
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/tasks/overview${query}`)
      if (r.ok) setData(await r.json())
    } catch { /* the card just stays as it was */ }
  }, [query])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const on = (e: Event) => { if ((e as CustomEvent).detail?.source !== self) load() }
    window.addEventListener('tasks-changed', on)
    return () => window.removeEventListener('tasks-changed', on)
  }, [load, self])

  async function toggle(t: TaskView) {
    const done = !t.done
    setData(d => d && applyToggle(d, t, done))
    try {
      const r = await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not save')
      announceTasksChanged(self)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
      setData(d => d && applyToggle(d, { ...t, done }, !done))
    }
  }
  return { data, load, toggle }
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'

function Bar({ pct, className = '' }: { pct: number; className?: string }) {
  return (
    <span className={`block h-1.5 rounded-full bg-slate-200 overflow-hidden ${className}`}>
      <span className="block h-full bg-teal-600 rounded-full" style={{ width: `${pct}%` }} />
    </span>
  )
}

const pctOf = (c: TaskCounts) => (c.total ? Math.round((c.done / c.total) * 100) : 0)

function UpNextRow({ t, today, meta, onToggle }: { t: TaskView; today: string; meta: string; onToggle: () => void }) {
  const due = (
    <span className={`flex-shrink-0 text-right text-xs font-semibold ${dueTone(t, today)}`}>
      {t.done ? 'Done' : dueLabel(t.dueDate, today)}
    </span>
  )
  if (t.kind === 'checklist') {
    return (
      <Link href={taskHref(t)} className="flex items-center gap-3 px-3.5 py-2.5 border-t border-slate-100 hover:bg-slate-50">
        <span className="w-[22px] h-[22px] rounded-md bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0" aria-hidden><ClipboardCheck size={14} /></span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium text-slate-800 truncate">{t.title}</span>
          <span className="block text-xs text-slate-500 truncate">{meta}</span>
        </span>
        {due}
      </Link>
    )
  }
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5 border-t border-slate-100 hover:bg-slate-50">
      <CheckButton done={t.done} onClick={onToggle} label={`${t.done ? 'Reopen' : 'Mark done'}: ${t.title}`} />
      <Link href={taskHref(t)} className="flex-1 min-w-0">
        <span className={`block text-sm font-medium truncate ${t.done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{t.title}</span>
        <span className="block text-xs text-slate-500 truncate">{meta}</span>
      </Link>
      {due}
    </div>
  )
}

function rowMeta(t: TaskView, eventName: string): string {
  const bits = [eventName, t.kind === 'checklist' && t.progress ? `${t.progress.done} of ${t.progress.total} · shared with staff` : categoryLabel(t.category)]
  if (t.tracked && !t.done) bits.push(t.tracked.label)
  return bits.filter(Boolean).join(' · ')
}

function Chip({ tone, icon: Icon, children }: { tone: 'red' | 'amber'; icon?: typeof Clock; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-semibold ${tone === 'red'
      ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
      {Icon && <Icon size={13} />}{children}
    </span>
  )
}

// ── The tournaments page ──────────────────────────────────────────────────────

export function HomeTasksCard({ viewOrgId, onEvents }: {
  viewOrgId?: string
  /** Each event's counts and next task, for the strip on its tournament card. */
  onEvents?: (events: OverviewEvent[], today: string) => void
}) {
  const { data, toggle } = useOverview(viewOrgId ? `?viewOrgId=${encodeURIComponent(viewOrgId)}` : '')
  const report = useRef(onEvents)
  report.current = onEvents
  useEffect(() => { if (data) report.current?.(data.byTournament, data.today) }, [data])
  if (!data) return null

  const { counts: c, today } = data
  const nameOf = (id: string) => data.byTournament.find(e => e.id === id)?.name || (id ? 'Event' : 'General')
  const rows: { key: string; href: string; logo: string; name: string; c: TaskCounts; when: string; hasTasks: boolean }[] = [
    ...data.byTournament.map(e => ({
      key: e.id, href: `/tournaments/${e.id}/tasks`, logo: e.logoUrl, name: e.name, c: e.counts, hasTasks: e.hasTasks,
      when: [eventRange(e.firstDay, e.lastDay), eventWhen(e.firstDay, e.lastDay, today)].filter(Boolean).join(' · '),
    })),
    ...(data.general && data.general.total > 0
      ? [{ key: 'general', href: '/tasks?event=general', logo: '', name: 'General', c: data.general, hasTasks: true, when: 'Not tied to one event' }]
      : []),
  ]

  return (
    <section aria-labelledby="home-tasks" className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 mb-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center" aria-hidden><ListChecks size={20} /></span>
          <div>
            <h2 id="home-tasks" className="text-lg font-bold text-slate-900 leading-tight">Tasks</h2>
            <p className="text-[13px] text-slate-600">{c.open} open across your events</p>
          </div>
          {c.overdue > 0 && <Chip tone="red" icon={AlertCircle}>{c.overdue} overdue</Chip>}
          {c.week > 0 && <Chip tone="amber" icon={Clock}>{c.week} due this week</Chip>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/tasks#add" className="btn-secondary inline-flex items-center gap-1.5"><Plus size={16} /> Add task</Link>
          <Link href="/tasks" className="btn-primary inline-flex items-center gap-1.5">Open tasks <ArrowRight size={16} /></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 min-w-0 border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Up next</h3>
            {data.upNext.some(t => t.kind === 'task') && <span className="text-xs text-slate-500">Tap a circle to check it off</span>}
          </div>
          {data.upNext.length === 0 && <p className="px-3.5 py-6 border-t border-slate-100 text-sm text-slate-500 text-center">Nothing open right now.</p>}
          {data.upNext.map(t => (
            <UpNextRow key={t.id} t={t} today={today} meta={rowMeta(t, nameOf(t.tournamentId))} onToggle={() => toggle(t)} />
          ))}
          <Link href="/tasks" className="flex items-center gap-1.5 px-3.5 py-2.5 border-t border-slate-100 text-[13px] font-semibold text-teal-700 hover:bg-slate-50">
            See all {c.open} open {c.open === 1 ? 'task' : 'tasks'} <ArrowRight size={14} />
          </Link>
        </div>

        <div className="lg:col-span-2 min-w-0 border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-3.5 py-2.5 bg-slate-50">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">By tournament</h3>
          </div>
          {rows.length === 0 && <p className="px-3.5 py-6 border-t border-slate-100 text-sm text-slate-500 text-center">No upcoming events.</p>}
          {rows.map(r => (
            <Link key={r.key} href={r.href} className="flex items-center gap-3 px-3.5 py-3 border-t border-slate-100 hover:bg-slate-50">
              {r.logo
                ? <img src={r.logo} alt="" className="w-9 h-9 rounded-lg object-contain bg-white border border-slate-100 flex-shrink-0" />
                : <span className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center flex-shrink-0" aria-hidden>{r.key === 'general' ? 'All' : initials(r.name)}</span>}
              <span className="flex-1 min-w-0">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 truncate">{r.name}</span>
                  {r.hasTasks && <span className="text-xs text-slate-600 whitespace-nowrap">{r.c.done} of {r.c.total} done</span>}
                </span>
                {r.hasTasks
                  ? <Bar pct={pctOf(r.c)} className="mt-1.5 mb-1" />
                  : <span className="block mt-0.5 text-xs font-semibold text-teal-700">No tasks yet · start from the template</span>}
                <span className="block text-xs text-slate-500 truncate">
                  {r.when}
                  {r.c.overdue > 0 && <span className="text-red-700 font-semibold"> · {r.c.overdue} overdue</span>}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

/** One event's tasks on its tournament card. */
export function TaskStrip({ ev, today }: { ev: OverviewEvent; today: string }) {
  const c = ev.counts
  if (!ev.hasTasks) {
    return (
      <Link href={`/tournaments/${ev.id}/tasks`} className="flex items-center justify-between gap-2 mb-4 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg bg-white hover:border-teal-300 text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700"><ListChecks size={15} className="text-teal-700" /> No tasks yet</span>
        <span className="inline-flex items-center gap-1 font-semibold text-teal-700">Start from the template <ArrowRight size={13} /></span>
      </Link>
    )
  }
  return (
    <Link href={`/tournaments/${ev.id}/tasks`} className="block mb-4 px-3 py-2.5 border border-slate-200 rounded-lg bg-white hover:border-teal-300">
      <span className="flex items-center justify-between gap-2 text-[13px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800"><ListChecks size={15} className="text-teal-700" /> {c.open} open {c.open === 1 ? 'task' : 'tasks'}</span>
        <span className={`font-semibold ${c.overdue ? 'text-red-700' : 'text-slate-500'}`}>{c.overdue ? `${c.overdue} overdue` : 'Nothing overdue'}</span>
      </span>
      <Bar pct={pctOf(c)} className="mt-2" />
      <span className="block mt-1.5 text-xs text-slate-500 truncate">
        {ev.next ? `Next: ${ev.next.title}${ev.next.dueDate ? ` · ${dueLabel(ev.next.dueDate, today)}` : ''}` : 'Everything is done'}
      </span>
    </Link>
  )
}

// ── A tournament's dashboard ──────────────────────────────────────────────────

export function TournamentTasksBox({ tournamentId }: { tournamentId: string }) {
  const { data, load, toggle } = useOverview(`?tournamentId=${encodeURIComponent(tournamentId)}`)
  const [starter, setStarter] = useState(false)
  if (!data) return null
  const ev = data.byTournament.find(e => e.id === tournamentId)
  const { counts: c, today } = data
  // A past event that never had a list: nothing to show.
  if (!ev && c.total === 0) return null

  const base = `/tournaments/${tournamentId}/tasks`
  const cl = ev?.checklist
  const most = data.categories.slice(0, 3)
  const checklistLine = cl && (
    <Link href={`${base}#setup`} className="flex items-center gap-2.5 mt-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 hover:border-teal-300">
      <ClipboardCheck size={16} className="text-teal-700 flex-shrink-0" />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-900">Setup checklist</span>
        <span className="block text-xs text-slate-500">{cl.done} of {cl.total} · {dayDate(cl.dueDate)}, the day before</span>
      </span>
    </Link>
  )

  return (
    <section aria-labelledby="ev-tasks">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 id="ev-tasks" className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tasks</h2>
        {c.overdue > 0 && <span className="text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 px-2 py-0.5 rounded-full">{c.overdue} overdue</span>}
        <Link href={base} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline">Open tasks <ArrowRight size={13} /></Link>
      </div>

      {ev && !ev.hasTasks ? (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0" aria-hidden><LayoutTemplate size={20} /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">No tasks for this event yet</p>
              <p className="text-sm text-slate-600 mt-0.5">Start from the checklist template: permits, rentals, staff, club emails and grant paperwork, with due dates counted back from the first game day.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => setStarter(true)} className="btn-primary inline-flex items-center gap-1.5"><Plus size={16} /> Choose items</button>
                <Link href={`${base}#add`} className="btn-secondary">Add a task</Link>
              </div>
            </div>
          </div>
          {checklistLine}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 sm:p-5 border-b lg:border-b-0 lg:border-r border-slate-200">
            <Link href={base} className="flex items-center gap-3 group">
              <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center flex-shrink-0" aria-hidden><ListChecks size={20} /></span>
              <span>
                <span className="block text-2xl leading-tight font-semibold text-slate-900">{c.open}</span>
                <span className="block text-sm text-slate-500 group-hover:text-teal-700">Open {c.open === 1 ? 'task' : 'tasks'}</span>
              </span>
            </Link>
            {(c.overdue > 0 || c.week > 0) && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {c.overdue > 0 && <Chip tone="red">{c.overdue} overdue</Chip>}
                {c.week > 0 && <Chip tone="amber">{c.week} due this week</Chip>}
              </div>
            )}
            <Bar pct={pctOf(c)} className="mt-3.5" />
            <div className="flex justify-between gap-2 mt-1.5 text-xs text-slate-500"><span>{c.done} of {c.total} done</span><span>{pctOf(c)}%</span></div>
            {most.length > 0 && <p className="mt-3 text-xs text-slate-600">Most open: {most.map(m => `${m.label} ${m.open}`).join(' · ')}</p>}
            {checklistLine}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-slate-50">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">Up next</h3>
              {data.upNext.some(t => t.kind === 'task') && <span className="text-xs text-slate-500">Tap a circle to check it off</span>}
            </div>
            {data.upNext.length === 0 && <p className="px-3.5 py-6 border-t border-slate-100 text-sm text-slate-500 text-center">Everything is done.</p>}
            {data.upNext.slice(0, 5).map(t => (
              <UpNextRow key={t.id} t={t} today={today} meta={rowMeta(t, '')} onToggle={() => toggle(t)} />
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-t border-slate-100">
              <Link href={base} className="inline-flex items-center gap-1 text-[13px] font-semibold text-teal-700 hover:underline">
                See all {c.open} open {c.open === 1 ? 'task' : 'tasks'} <ArrowRight size={13} />
              </Link>
              <Link href={`${base}#add`} className="btn-secondary btn-sm inline-flex items-center gap-1"><Plus size={14} /> Add task</Link>
            </div>
          </div>
        </div>
      )}

      {starter && ev && (
        <StarterDialog tournament={ev} have={new Set()} today={today}
          onClose={() => setStarter(false)}
          onAdded={() => { setStarter(false); load(); announceTasksChanged() }} />
      )}
    </section>
  )
}
