'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import {
  AlertCircle, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, ClipboardCheck, LayoutTemplate,
  ListChecks, Plus, RefreshCw, Search, Trash2, X, Landmark, Tent, Users, Mail, Banknote, Trophy, Archive, Shapes, UserRound,
  type LucideIcon,
} from 'lucide-react'
import {
  TASK_CATEGORIES, TRACKED_NOTES, addDays, announceTasksChanged, byDue, categoryLabel, countTasks,
  dueBucket, dueLabel, eventRange, eventWhen, localToday, shortDate, templateItem, timingLabel,
  type TaskTournament, type TaskView,
} from '@/lib/taskTemplate'
import StarterDialog from './StarterDialog'
import VendorEmailDialog from '@/components/contacts/VendorEmailDialog'
import type { ContactRow, ContactView } from '@/lib/contactTypes'
import { CheckButton, dueTone } from './CheckButton'

// The task list: grouped rows, a detail panel, quick add. One component for the
// all-events page (/tasks) and a tournament's Tasks tab (/tournaments/[id]/tasks,
// which passes tournamentId). Rows are grouped by due date by default, or by
// category, or (all events) by event. Checking a task off, editing it, adding
// steps and notes all save as you go.

const CAT_ICONS: Record<string, LucideIcon> = {
  venue: Landmark, rentals: Tent, staff: Users, comms: Mail, grants: Banknote, awards: Trophy,
  gameday: ClipboardCheck, wrap: Archive, other: Shapes,
}

type Data = { tasks: TaskView[]; tournaments: TaskTournament[]; today: string }
/** An event contact a task can depend on (from /api/contacts). */
type ContactOption = { id: string; name: string; company: string; events: string[]; everyEvent: boolean }
type Mode = 'due' | 'category' | 'event'
type GroupState = 'open' | 'closed' | 'all'
type Group = { key: string; label: string; icon: LucideIcon; tone?: 'red' | 'green'; hint?: string; items: TaskView[]; closed?: boolean }

const VIEW_KEY = 'wr-tasks-view'
const LIMIT = 12

export default function TaskBoard({ tournamentId, onLoaded }: {
  tournamentId?: string
  /** Called once, when the list first shows (a page can then scroll to an anchor below it). */
  onLoaded?: () => void
}) {
  const scoped = !!tournamentId
  const [data, setData] = useState<Data | null>(null)
  const [failed, setFailed] = useState('')
  const [filter, setFilter] = useState('all')            // all events: 'all' | a tournament id | 'general'
  const [mode, setMode] = useState<Mode>('due')
  const [groupState, setGroupState] = useState<Record<string, GroupState>>({})
  const [selId, setSelId] = useState<string | null>(null)
  const [starterFor, setStarterFor] = useState<TaskTournament | null>(null)
  const [qTitle, setQTitle] = useState('')
  const [qEvent, setQEvent] = useState<string | null>(null)
  const [qCat, setQCat] = useState('other')
  const [qDue, setQDue] = useState('')
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/tasks${tournamentId ? `?tournamentId=${encodeURIComponent(tournamentId)}` : ''}`)
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setFailed(d.error || 'Could not load tasks'); return }
      setData({ tasks: d.tasks || [], tournaments: d.tournaments || [], today: d.today || localToday() })
      setFailed('')
    } catch { setFailed('Could not load tasks') }
  }, [tournamentId])
  useEffect(() => { load() }, [load])

  // Event contacts a task can be linked to. Best-effort: no contacts, no picker.
  // The full rows are kept too, so a task's contact can be emailed from the task.
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [contactRows, setContactRows] = useState<ContactRow[]>([])
  const [writing, setWriting] = useState<{ taskId: string; contactId: string } | null>(null)
  useEffect(() => {
    fetch('/api/contacts').then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.contacts) return
        setContactRows(d.contacts)
        setContacts(d.contacts.map((c: ContactOption) => ({ id: c.id, name: c.name, company: c.company, events: c.events || [], everyEvent: !!c.everyEvent })))
      })
      .catch(() => {})
  }, [])
  const patchContact = async (id: string, body: Partial<ContactView>) => {
    setContactRows(rows => rows.map(c => c.id === id ? { ...c, ...body } : c))
    try {
      const r = await fetch(`/api/contacts/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.contact) throw new Error(d.error || 'Could not save the contact')
      setContactRows(rows => rows.map(c => c.id === id ? { ...c, ...d.contact } : c))
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save the contact') }
  }

  // The tab page's setup checklist reports its progress; keep its row in step.
  useEffect(() => {
    function onProgress(e: Event) {
      const p = (e as CustomEvent).detail as { tournamentId: string; done: number; total: number }
      if (!p) return
      setData(d => d && { ...d, tasks: d.tasks.map(t => t.kind === 'checklist' && t.tournamentId === p.tournamentId
        ? { ...t, progress: { done: p.done, total: p.total }, done: p.total > 0 && p.done >= p.total } : t) })
    }
    window.addEventListener('setup-checklist-progress', onProgress)
    return () => window.removeEventListener('setup-checklist-progress', onProgress)
  }, [])

  // How you last looked at the list (this browser only).
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}')
      if (v.mode === 'due' || v.mode === 'category' || (v.mode === 'event' && !scoped)) setMode(v.mode)
      if (!scoped && typeof v.filter === 'string') setFilter(v.filter)
    } catch { /* storage off */ }
    // A link from a dashboard says which event, or which task, to show.
    const q = new URLSearchParams(window.location.search)
    if (!scoped && (q.get('event') || q.get('task'))) setFilter(q.get('event') || 'all')
  }, [scoped])
  function remember(next: { mode?: Mode; filter?: string }) {
    try { localStorage.setItem(VIEW_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(VIEW_KEY) || '{}'), ...next })) } catch { /* storage off */ }
  }

  // "Add task" on the dashboards links here with #add: put the cursor in quick add.
  // A task picked on a dashboard comes as ?task=<id>: open it, unfold its group.
  const loaded = !!data
  useEffect(() => {
    if (!loaded) return
    onLoaded?.()
    if (window.location.hash === '#add') inputRef.current?.focus()
    const want = new URLSearchParams(window.location.search).get('task')
    const t = want ? data?.tasks.find(x => x.id === want && x.kind === 'task') : undefined
    if (!t) return
    setSelId(t.id)
    setGroupState(m => ({ ...m, [`${mode}:${groupKeyOf(t)}`]: 'all' }))
    setTimeout(() => document.getElementById(`task-${t.id}`)?.scrollIntoView({ block: 'center' }), 60)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  const today = data?.today || localToday()
  const tournaments = data?.tournaments || []
  const allTasks = data?.tasks || []
  const nameOf = (id: string) => id ? (tournaments.find(t => t.id === id)?.name || 'Event') : 'General'
  const upcoming = tournaments.filter(t => !t.lastDay || t.lastDay >= today)
  const thisT = scoped ? tournaments.find(t => t.id === tournamentId) || null : null

  // The setup checklist is one row in the list (it counts as a task due the day
  // before); on a tournament's tab the row jumps to the checklist below.
  const listTasks = allTasks
  const realTasks = allTasks.filter(t => t.kind === 'task')
  const visible = scoped || filter === 'all' ? listTasks
    : listTasks.filter(t => filter === 'general' ? !t.tournamentId : t.tournamentId === filter)
  const counts = countTasks(allTasks, today)
  // Template items the event in the starter dialog already has (that event only).
  const starterHave = useMemo(() => new Set(starterFor
    ? allTasks.filter(t => t.tournamentId === starterFor.id && t.templateKey).map(t => t.templateKey) : []), [allTasks, starterFor])

  // Events in the filter chips: upcoming ones, plus any past one that still has open tasks.
  const chipEvents = tournaments.filter(t => upcoming.includes(t) || listTasks.some(x => x.tournamentId === t.id && !x.done))
  const openIn = (id: string) => listTasks.filter(t => !t.done && (id === 'all' || (id === 'general' ? !t.tournamentId : t.tournamentId === id))).length

  // Upcoming events with nothing on their list yet: offer the starter checklist.
  const noTasksYet = scoped
    ? (thisT && !realTasks.length && (!thisT.lastDay || thisT.lastDay >= today) ? [thisT] : [])
    : upcoming.filter(t => !realTasks.some(x => x.tournamentId === t.id))

  // Search: every word has to appear somewhere on the task (title, notes, steps,
  // contact, event, category). It looks past the folded groups and the event
  // chips, because a task you remember is often sitting under Later, unseen.
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searching = words.length > 0
  const hay = (t: TaskView) => [t.title, t.notes, t.contactName || '', nameOf(t.tournamentId), categoryLabel(t.category),
    t.tracked?.label || '', ...t.steps.map(x => x.text)].join(' ').toLowerCase()

  const groups: Group[] = useMemo(() => {
    if (words.length) {
      const hits = listTasks.filter(t => { const h = hay(t); return words.every(w => h.includes(w)) })
      return [
        { key: 'search', label: 'Matches', icon: Search, items: hits.filter(t => !t.done).sort(byDue) },
        { key: 'searchdone', label: 'Done', icon: CheckCircle2, tone: 'green' as const, items: hits.filter(t => t.done).sort(byDue) },
      ].filter(g => g.items.length)
    }
    const open = visible.filter(t => !t.done).sort(byDue)
    const done = visible.filter(t => t.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '') || byDue(a, b))
    const doneGroup: Group = { key: 'done', label: 'Done', icon: CheckCircle2, tone: 'green', items: done, closed: true }
    let gs: Group[]
    if (mode === 'category') {
      gs = TASK_CATEGORIES.map(c => ({ key: c.key, label: c.label, icon: CAT_ICONS[c.key] || Shapes, items: open.filter(t => t.category === c.key) }))
    } else if (mode === 'event' && !scoped) {
      gs = tournaments.filter(t => open.some(x => x.tournamentId === t.id)).map(t => ({
        key: t.id, label: t.name, icon: CalendarDays, items: open.filter(x => x.tournamentId === t.id),
        hint: [eventRange(t.firstDay, t.lastDay), eventWhen(t.firstDay, t.lastDay, today)].filter(Boolean).join(' · '),
      }))
      gs.push({ key: 'general', label: 'General', icon: Shapes, items: open.filter(x => !x.tournamentId) })
    } else {
      const b = (k: string) => open.filter(t => dueBucket(t.dueDate, today) === k)
      gs = [
        { key: 'overdue', label: 'Overdue', icon: AlertCircle, tone: 'red', items: b('overdue') },
        { key: 'week', label: 'This week', icon: CalendarDays, hint: `${shortDate(today)} – ${shortDate(addDays(today, 6))}`, items: b('week') },
        { key: 'next', label: 'Next week', icon: CalendarDays, hint: `${shortDate(addDays(today, 7))} – ${shortDate(addDays(today, 13))}`, items: b('next') },
        { key: 'later', label: 'Later', icon: CalendarDays, hint: `After ${shortDate(addDays(today, 13))}`, items: b('later'), closed: !scoped },
        { key: 'none', label: 'No date', icon: CalendarDays, items: b('none') },
      ]
    }
    return [...gs, doneGroup].filter(g => g.items.length)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, scoped, tournaments, today, query, listTasks])

  /** The group a task sits in under the current grouping. */
  function groupKeyOf(t: TaskView): string {
    if (t.done) return 'done'
    if (mode === 'category') return t.category
    if (mode === 'event' && !scoped) return t.tournamentId || 'general'
    return dueBucket(t.dueDate, today)
  }

  const stateOf = (g: Group): GroupState => searching ? 'all' : groupState[`${mode}:${g.key}`] ?? (g.closed ? 'closed' : 'open')
  const setState = (g: Group, s: GroupState) => setGroupState(m => ({ ...m, [`${mode}:${g.key}`]: s }))

  const selected = selId ? allTasks.find(t => t.id === selId) || null : null

  // ── saving ────────────────────────────────────────────────────────────────
  async function patch(t: TaskView, body: Record<string, unknown>, local: Partial<TaskView>) {
    setData(d => d && { ...d, tasks: d.tasks.map(x => x.id === t.id ? { ...x, ...local } : x) })
    try {
      const r = await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.task) throw new Error(d.error || 'Could not save')
      const saved = d.task as TaskView
      // The server doesn't look up tracked lines on a save; keep the one we have while it's open.
      setData(x => x && { ...x, tasks: x.tasks.map(y => y.id === saved.id ? { ...saved, tracked: saved.done ? null : y.tracked } : y) })
      announceTasksChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
      load()
    }
  }
  const toggle = (t: TaskView) => patch(t, { done: !t.done },
    { done: !t.done, doneAt: !t.done ? new Date().toISOString() : '', doneBy: !t.done ? 'you' : '' })

  async function remove(t: TaskView) {
    setData(d => d && { ...d, tasks: d.tasks.filter(x => x.id !== t.id) })
    setSelId(null)
    try {
      const r = await fetch(`/api/tasks/${encodeURIComponent(t.id)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not delete')
      toast.success('Task deleted')
      announceTasksChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete')
      load()
    }
  }

  const defaultEvent = scoped ? tournamentId! : filter === 'general' ? '' : filter !== 'all' ? filter : (upcoming[0]?.id || '')
  const addTo = qEvent ?? defaultEvent

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const title = qTitle.trim()
    if (!title || adding) return
    setAdding(true)
    try {
      const r = await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: scoped ? tournamentId : addTo, title, category: qCat, dueDate: qDue }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.task) throw new Error(d.error || 'Could not add the task')
      const t = d.task as TaskView
      setData(x => x && { ...x, tasks: [...x.tasks, t] })
      setQTitle('')
      setSelId(t.id)
      // Make sure the new task shows: open its group if it is folded away.
      const key = groupKeyOf(t)
      setGroupState(m => (m[`${mode}:${key}`] === 'closed' || (!m[`${mode}:${key}`] && key === 'later' && !scoped)) ? { ...m, [`${mode}:${key}`]: 'open' } : m)
      if (!scoped && filter !== 'all' && (filter === 'general' ? !!t.tournamentId : t.tournamentId !== filter)) toast.success(`Added to ${nameOf(t.tournamentId)}`)
      announceTasksChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add the task')
    } finally {
      setAdding(false)
    }
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  if (failed && !data) {
    return <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-600">{failed}. <button onClick={load} className="text-teal-700 font-semibold hover:underline">Try again</button></div>
  }
  if (!data) return <div className="text-slate-400 text-center py-16">Loading tasks…</div>

  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0
  const detail = (t: TaskView) => (
    <TaskDetail task={t} today={today} eventName={nameOf(t.tournamentId)} contacts={contacts}
      emailable={!!contactRows.find(c => c.id === t.contactId)?.email}
      onWrite={() => setWriting({ taskId: t.id, contactId: t.contactId || '' })}
      onPatch={(body, local) => patch(t, body, local)} onToggle={() => toggle(t)} onDelete={() => remove(t)} onClose={() => setSelId(null)} />
  )

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ListChecks size={24} className="text-teal-600" /> Tasks</h1>
          <p className="text-sm text-slate-500 mt-1">
            {counts.open} open
            {counts.overdue > 0 && <> · <span className="text-red-700 font-medium">{counts.overdue} overdue</span></>}
            {counts.week > 0 && <> · <span className="text-amber-700 font-medium">{counts.week} due this week</span></>}
            {scoped && counts.total > 0 && <> · {counts.done} of {counts.total} done</>}
          </p>
          {scoped && counts.total > 0 && (
            <div className="mt-2 h-1.5 w-56 max-w-full rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-teal-600 rounded-full" style={{ width: `${pct}%` }} /></div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {scoped && <Link href="/tasks" className="btn-secondary btn-sm">All events</Link>}
          <Link href="/tasks/template" className="btn-secondary btn-sm inline-flex items-center gap-1.5"><LayoutTemplate size={15} /> Checklist template</Link>
          {scoped && thisT && realTasks.length > 0 && (
            <button type="button" onClick={() => setStarterFor(thisT)} className="btn-secondary btn-sm inline-flex items-center gap-1.5"><Plus size={15} /> Add from template</button>
          )}
        </div>
      </div>

      {/* Start from the template */}
      {noTasksYet.length > 0 && (
        <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-teal-900">Start from the checklist template</p>
          <p className="text-sm text-teal-800 mt-0.5">
            Permits, rentals, staff, club emails and grant paperwork, with due dates counted back from the first game day. You pick which items each event needs.
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {noTasksYet.map(t => (
              <button key={t.id} type="button" onClick={() => setStarterFor(t)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold">
                <Plus size={15} /> {scoped ? 'Choose items' : t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters and grouping */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        {!scoped ? (
          <div role="group" aria-label="Show tasks for" className="flex flex-wrap gap-1.5">
            {[{ id: 'all', name: 'All' }, ...chipEvents.map(t => ({ id: t.id, name: t.name })), { id: 'general', name: 'General' }].map(c => {
              const on = filter === c.id
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => { setFilter(c.id); remember({ filter: c.id }); setQEvent(null) }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${on ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                  {c.name}<span className={`text-xs ${on ? 'text-teal-100' : 'text-slate-500'}`}>{openIn(c.id)}</span>
                </button>
              )
            })}
          </div>
        ) : <span />}
        <div role="group" aria-label="Group by" className="inline-flex items-center gap-0.5 p-0.5 bg-slate-200 rounded-lg">
          <span className="text-xs text-slate-600 px-2">Group by</span>
          {([['due', 'Due date'], ['category', 'Category'], ...(scoped ? [] : [['event', 'Event']])] as [Mode, string][]).map(([m, label]) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); remember({ mode: m }) }}
              className={`px-2.5 py-1 rounded-md text-sm font-medium ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start gap-5">
        <div className="flex-1 min-w-0 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden />
            <input type="search" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search tasks"
              onKeyDown={e => { if (e.key === 'Escape') setQuery('') }}
              placeholder={scoped ? 'Search this event’s tasks, like “shirts” or “carts”' : 'Search every task, like “shirts” or “carts”'}
              className="w-full border border-slate-300 rounded-xl pl-9 pr-9 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700"><X size={16} /></button>
            )}
          </div>

          {/* Quick add */}
          <form onSubmit={add} id="add" className="scroll-mt-24 p-2.5 bg-white border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <Plus size={18} className="text-teal-600 ml-1 flex-shrink-0" aria-hidden />
              <input ref={inputRef} value={qTitle} onChange={e => setQTitle(e.target.value)} aria-label="New task"
                placeholder={scoped ? `Add a task to ${thisT?.name || 'this event'}` : 'Add a task, like “Pick up the golf carts”'}
                className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <button type="submit" disabled={!qTitle.trim() || adding}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${qTitle.trim() && !adding ? 'bg-teal-700 hover:bg-teal-800 text-white' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}>Add</button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pl-7">
              {!scoped && (
                <select value={addTo} onChange={e => setQEvent(e.target.value)} aria-label="Event"
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white max-w-[14rem]">
                  {upcoming.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  {addTo && !upcoming.some(t => t.id === addTo) && <option value={addTo}>{nameOf(addTo)}</option>}
                  <option value="">General</option>
                </select>
              )}
              <select value={qCat} onChange={e => setQCat(e.target.value)} aria-label="Category"
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm bg-white">
                {TASK_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <input type="date" value={qDue} onChange={e => setQDue(e.target.value)} aria-label="Due date"
                className="border border-slate-300 rounded-lg px-2.5 py-1 text-sm bg-white" />
            </div>
          </form>

          {groups.length === 0 && (
            <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-sm text-slate-500">
              {searching ? <>No task matches “{query.trim()}”. Add it above if it’s a new one.</>
                : listTasks.length ? 'Nothing here. Try another event.' : 'No tasks yet. Add one above, or start from the checklist template.'}
            </div>
          )}

          {groups.map(g => {
            const st = stateOf(g)
            const shown = st === 'closed' ? [] : st === 'all' ? g.items : g.items.slice(0, LIMIT)
            const more = g.items.length - shown.length
            const Icon = g.icon
            return (
              <section key={g.key} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button type="button" onClick={() => setState(g, st === 'closed' ? 'open' : 'closed')} aria-expanded={st !== 'closed'}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-left">
                  <ChevronDown size={16} className={`text-slate-500 transition-transform ${st === 'closed' ? '-rotate-90' : ''}`} />
                  <Icon size={16} className={g.tone === 'red' ? 'text-red-700' : g.tone === 'green' ? 'text-emerald-700' : 'text-slate-500'} />
                  <span className={`text-sm font-bold ${g.tone === 'red' ? 'text-red-700' : g.tone === 'green' ? 'text-emerald-700' : 'text-slate-800'}`}>{g.label}</span>
                  <span className="text-xs font-semibold text-slate-600 bg-slate-200 rounded-full px-2">{g.items.length}</span>
                  {g.hint && <span className="ml-auto text-xs text-slate-500 text-right">{g.hint}</span>}
                </button>
                <ul>
                  {shown.map(t => (
                    <li key={t.id} id={`task-${t.id}`} className="border-t border-slate-100 scroll-mt-24">
                      <TaskRow task={t} today={today} selected={t.id === selId}
                        eventName={!scoped && (filter === 'all' || searching) ? nameOf(t.tournamentId) : ''}
                        onToggle={() => toggle(t)} onSelect={() => setSelId(s => s === t.id ? null : t.id)} />
                      {t.id === selId && t.kind === 'task' && (
                        <div className="lg:hidden px-4 pb-4 pt-1 bg-teal-50 border-t border-teal-100">{detail(t)}</div>
                      )}
                    </li>
                  ))}
                </ul>
                {more > 0 && (
                  <button type="button" onClick={() => setState(g, 'all')}
                    className="w-full text-left px-4 py-2.5 border-t border-slate-100 text-sm font-semibold text-teal-700 hover:bg-slate-50">
                    {st === 'closed' ? `Show ${more} ${more === 1 ? 'task' : 'tasks'}` : `Show ${more} more`}
                  </button>
                )}
              </section>
            )
          })}
        </div>

        {/* Details, beside the list on a wide screen (inline under the row otherwise) */}
        <aside className="hidden lg:block w-[22rem] flex-shrink-0 lg:sticky lg:top-20 bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          {selected && selected.kind === 'task'
            ? detail(selected)
            : <p className="text-sm text-slate-500">Pick a task to see its steps, notes and the page where it gets done.</p>}
        </aside>
      </div>

      {starterFor && (
        <StarterDialog tournament={starterFor} have={starterHave} today={today}
          onClose={() => setStarterFor(null)}
          onAdded={() => { setStarterFor(null); load(); announceTasksChanged() }} />
      )}
      {writing && contactRows.some(c => c.id === writing.contactId) && (() => {
        const task = data.tasks.find(x => x.id === writing.taskId)
        return (
          <VendorEmailDialog contact={contactRows.find(c => c.id === writing.contactId)!} tournaments={data.tournaments} today={today}
            tournamentId={task?.tournamentId || undefined}
            onClose={() => setWriting(null)} onPatch={body => patchContact(writing.contactId, body)}
            // Sending the email is what this task was for, so it checks itself off (Reopen undoes it).
            onSent={() => { if (task && !task.done) toggle(task) }} />
        )
      })()}
    </div>
  )
}

function TaskRow({ task: t, today, selected, eventName, onToggle, onSelect }: {
  task: TaskView; today: string; selected: boolean; eventName: string; onToggle: () => void; onSelect: () => void
}) {
  const late = !t.done && dueBucket(t.dueDate, today) === 'overdue'
  const stepsDone = t.steps.filter(s => s.done).length
  const meta = (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
      {eventName && <span className="px-2 rounded-full bg-slate-100 text-slate-700 font-medium">{eventName}</span>}
      <span>{categoryLabel(t.category)}</span>
      {t.kind === 'checklist' && t.progress && <span className="inline-flex items-center gap-1"><ListChecks size={12} /> {t.progress.done} of {t.progress.total} · shared with staff</span>}
      {t.steps.length > 0 && <span className="inline-flex items-center gap-1"><ListChecks size={12} /> {stepsDone} of {t.steps.length}</span>}
      {t.tracked && !t.done && (
        <span className={`inline-flex items-center gap-1 px-2 py-px rounded-md font-semibold ${t.tracked.done ? 'bg-emerald-50 text-emerald-700' : 'bg-teal-50 text-teal-800'}`}><RefreshCw size={11} className="flex-shrink-0" /> {t.tracked.label}</span>
      )}
      {t.contactName && <span className="inline-flex items-center gap-1 text-slate-600"><UserRound size={12} className="flex-shrink-0" /> {t.contactName}</span>}
      {t.notes && !t.done && <span className="truncate max-w-[18rem]">{t.notes}</span>}
    </span>
  )
  const due = (
    <span className={`flex-shrink-0 w-24 text-right text-xs font-semibold ${dueTone(t, today)}`}>
      {t.done ? 'Done' : dueLabel(t.dueDate, today)}
      {late && <span className="block text-[11px] font-normal text-slate-500">Due {shortDate(t.dueDate)}</span>}
      {t.done && t.doneAt && <span className="block text-[11px] font-normal text-slate-500">{shortDate(t.doneAt.slice(0, 10))}</span>}
    </span>
  )

  if (t.kind === 'checklist') {
    return (
      <Link href={t.link?.href || '#'} className="flex items-start gap-3 px-3.5 py-2.5 hover:bg-slate-50">
        <span className="mt-0.5 w-[22px] h-[22px] rounded-md bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0" aria-hidden><ClipboardCheck size={14} /></span>
        <span className="flex-1 min-w-0">
          <span className={`block text-sm font-medium ${t.done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{t.title}</span>
          {meta}
        </span>
        {due}
      </Link>
    )
  }
  return (
    <div className={`flex items-start gap-3 px-3.5 py-2.5 ${selected ? 'bg-teal-50' : 'hover:bg-slate-50'}`}>
      <span className="mt-0.5"><CheckButton done={t.done} onClick={onToggle} label={`${t.done ? 'Reopen' : 'Mark done'}: ${t.title}`} /></span>
      <button type="button" onClick={onSelect} aria-expanded={selected} className="flex-1 min-w-0 text-left">
        <span className={`block text-sm font-medium ${t.done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{t.title}</span>
        {meta}
      </button>
      {t.link && !t.done && (
        <Link href={t.link.href} className="hidden sm:inline-flex flex-shrink-0 items-center gap-1 px-2 py-1 rounded-md border border-slate-200 text-xs font-semibold text-teal-700 hover:bg-teal-50">
          {t.link.label}<ArrowRight size={12} />
        </Link>
      )}
      {due}
    </div>
  )
}

function TaskDetail({ task, today, eventName, contacts, emailable, onWrite, onPatch, onToggle, onDelete, onClose }: {
  task: TaskView; today: string; eventName: string; contacts: ContactOption[]
  /** The linked contact has an email address, so the task can write to them. */
  emailable: boolean; onWrite: () => void
  onPatch: (body: Record<string, unknown>, local: Partial<TaskView>) => void
  onToggle: () => void; onDelete: () => void; onClose: () => void
}) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [step, setStep] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const cancelTitle = useRef(false)
  useEffect(() => { setTitle(task.title) }, [task.id, task.title])
  // The title box grows to fit, so a long title reads in full in the narrow panel.
  useEffect(() => {
    const el = titleRef.current
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  }, [title])
  useEffect(() => { setNotes(task.notes) }, [task.id, task.notes])
  useEffect(() => { setConfirmDel(false); setStep('') }, [task.id])

  const late = !task.done && dueBucket(task.dueDate, today) === 'overdue'
  const stepsDone = task.steps.filter(s => s.done).length
  const item = templateItem(task.templateKey)
  const saveTitle = () => {
    if (cancelTitle.current) { cancelTitle.current = false; setTitle(task.title); return }
    const v = title.trim()
    if (v && v !== task.title) onPatch({ title: v }, { title: v }); else setTitle(task.title)
  }
  const saveSteps = (steps: TaskView['steps']) => onPatch({ steps }, { steps })
  function addStep(e: React.FormEvent) {
    e.preventDefault()
    const text = step.trim()
    if (!text) return
    saveSteps([...task.steps, { id: 's' + Date.now().toString(36), text, done: false }])
    setStep('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="mt-1"><CheckButton done={task.done} onClick={onToggle} label={`${task.done ? 'Reopen' : 'Mark done'}: ${task.title}`} size={24} /></span>
        <textarea ref={titleRef} rows={1} value={title} onChange={e => setTitle(e.target.value.replace(/\n/g, ' '))} onBlur={saveTitle} aria-label="Task title"
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
            if (e.key === 'Escape') { cancelTitle.current = true; e.currentTarget.blur() }
          }}
          className={`flex-1 min-w-0 -mx-1.5 px-1.5 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-teal-400 focus:outline-none resize-none overflow-hidden leading-snug text-base font-semibold ${task.done ? 'text-slate-500 line-through' : 'text-slate-800'}`} />
        <button type="button" onClick={onClose} aria-label="Close details" className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">{eventName}</span>
        {task.done && <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Done{task.doneAt ? ` ${shortDate(task.doneAt.slice(0, 10))}` : ''}{task.doneBy ? ` · ${task.doneBy}` : ''}</span>}
        {late && <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-700">{dueLabel(task.dueDate, today)}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Due
          <input type="date" value={task.dueDate} onChange={e => onPatch({ dueDate: e.target.value }, { dueDate: e.target.value })}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-normal text-slate-800" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Category
          <select value={task.category} onChange={e => onPatch({ category: e.target.value }, { category: e.target.value })}
            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-normal text-slate-800 bg-white">
            {TASK_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
      </div>

      {(contacts.length > 0 || task.contactId) && (() => {
        // This event's contacts first, then everyone else in the directory.
        const mine = contacts.filter(c => c.everyEvent || (task.tournamentId && c.events.includes(task.tournamentId)))
        const rest = contacts.filter(c => !mine.includes(c))
        const missing = task.contactId && !contacts.some(c => c.id === task.contactId)
        const opt = (c: ContactOption) => <option key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ''}</option>
        return (
          <div className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            <span className="flex items-baseline justify-between">Contact
              {task.contactId && !missing && <Link href={`/contacts?c=${encodeURIComponent(task.contactId)}`} className="font-semibold text-teal-700 hover:underline">Open contact</Link>}
            </span>
            <select value={task.contactId || ''} aria-label="Contact"
              onChange={e => {
                const c = contacts.find(x => x.id === e.target.value)
                onPatch({ contactId: e.target.value }, { contactId: e.target.value, contactName: c?.name || '' })
              }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-normal text-slate-800 bg-white">
              <option value="">No contact</option>
              {missing && <option value={task.contactId}>{task.contactName || 'Deleted contact'}</option>}
              {mine.length > 0 && rest.length > 0 ? (
                <>
                  <optgroup label="This event">{mine.map(opt)}</optgroup>
                  <optgroup label="Everyone else">{rest.map(opt)}</optgroup>
                </>
              ) : contacts.map(opt)}
            </select>
            {task.contactId && !missing && emailable && (
              <button type="button" onClick={onWrite}
                className="mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-teal-600 bg-white text-sm font-bold text-teal-700 hover:bg-teal-50">
                <Mail size={15} /> Email {task.contactName || 'them'}
              </button>
            )}
          </div>
        )
      })()}

      {task.tracked && (
        <div className={`rounded-xl border p-3 ${task.tracked.done ? 'bg-emerald-50 border-emerald-200' : 'bg-teal-50 border-teal-200'}`}>
          <p className="flex items-center gap-1.5 text-xs font-bold text-teal-800"><RefreshCw size={13} /> Tracked by Whistle Ready</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{task.tracked.label}</p>
          {TRACKED_NOTES[task.templateKey] && <p className="mt-0.5 text-xs text-slate-600">{TRACKED_NOTES[task.templateKey]}</p>}
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Steps</h3>
          {task.steps.length > 0 && <span className="text-xs text-slate-500">{stepsDone} of {task.steps.length} done</span>}
        </div>
        <ul className="space-y-0.5">
          {task.steps.map(s => (
            <li key={s.id} className="group flex items-start gap-2 py-1">
              <button type="button" aria-pressed={s.done} aria-label={`${s.done ? 'Uncheck' : 'Check off'}: ${s.text}`}
                onClick={() => saveSteps(task.steps.map(x => x.id === s.id ? { ...x, done: !x.done } : x))}
                className={`mt-0.5 w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center flex-shrink-0 ${s.done ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-400 bg-white text-transparent hover:border-teal-500'}`}>
                <Check size={11} strokeWidth={3} />
              </button>
              <span className={`flex-1 text-sm ${s.done ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{s.text}</span>
              <button type="button" aria-label={`Remove step: ${s.text}`} onClick={() => saveSteps(task.steps.filter(x => x.id !== s.id))}
                className="p-0.5 text-slate-300 hover:text-red-600 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100"><X size={14} /></button>
            </li>
          ))}
        </ul>
        <form onSubmit={addStep} className="flex gap-2 mt-1.5">
          <input value={step} onChange={e => setStep(e.target.value)} placeholder="Add a step" aria-label="Add a step"
            className="flex-1 min-w-0 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm" />
          <button type="submit" disabled={!step.trim()} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Add</button>
        </form>
      </div>

      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Notes
        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} onBlur={() => { if (notes !== task.notes) onPatch({ notes }, { notes }) }}
          placeholder="Vendor, quote, who to call…" className="border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal text-slate-800 resize-y" />
      </label>

      {task.link && (
        <Link href={task.link.href} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 bg-teal-50 text-sm font-semibold text-teal-800 hover:bg-teal-100">
          {task.link.label}<ArrowRight size={15} />
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
        <button type="button" onClick={onToggle} className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold">{task.done ? 'Reopen' : 'Mark done'}</button>
        {confirmDel ? (
          <>
            <span className="text-sm text-slate-600">Delete this task?</span>
            <button type="button" onClick={onDelete} className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Delete</button>
            <button type="button" onClick={() => setConfirmDel(false)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700">Keep</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-sm font-medium text-red-700 hover:bg-red-50"><Trash2 size={15} /> Delete</button>
        )}
      </div>
      {item && <p className="text-xs text-slate-500">From the checklist template, due {timingLabel(item.offset)}.</p>}
    </div>
  )
}
