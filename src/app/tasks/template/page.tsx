'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check, ChevronLeft, ClipboardCheck, LayoutTemplate, ListChecks, Plus, RefreshCw } from 'lucide-react'
import {
  STARTER_TEMPLATE, TASK_LINKS, TRACKED_NOTES, addDays, announceTasksChanged, categoryLabel, dayDate, eventRange, isYmd, localToday,
  phaseLabel, timingLabel, type TaskTournament, type TaskView, type TemplateItem,
} from '@/lib/taskTemplate'
import { DEFAULT_SETUP_ITEMS } from '@/lib/setupChecklist'
import StarterDialog from '@/components/tasks/StarterDialog'

// The checklist template: what a Sunshine event usually needs, in the order it
// comes due. Read-only -- each event gets its own copy of the items picked for
// it (rename, re-date or delete them there). Pick an event to see the real due
// dates and add items to it.

export default function TaskTemplatePage() {
  const [tournaments, setTournaments] = useState<TaskTournament[]>([])
  const [today, setToday] = useState(localToday())
  const [sel, setSel] = useState('')
  const [have, setHave] = useState<Set<string>>(new Set())
  const [starter, setStarter] = useState(false)
  const [rev, setRev] = useState(0)

  useEffect(() => {
    // General's list is the cheap way to get the events in scope and today's date.
    fetch('/api/tasks?tournamentId=general').then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return
      const list: TaskTournament[] = Array.isArray(d.tournaments) ? d.tournaments : []
      const t0: string = d.today || localToday()
      setTournaments(list)
      setToday(t0)
      const next = list.find(t => isYmd(t.firstDay) && t.lastDay >= t0)
      if (next) setSel(s => s || next.id)
    }).catch(() => {})
  }, [])

  // What the chosen event already has, so the dialog doesn't offer it twice.
  useEffect(() => {
    setHave(new Set())
    if (!sel) return
    let live = true
    fetch(`/api/tasks?tournamentId=${encodeURIComponent(sel)}`).then(r => r.ok ? r.json() : null).then(d => {
      if (!live || !d) return
      const tasks: TaskView[] = Array.isArray(d.tasks) ? d.tasks : []
      setHave(new Set(tasks.filter(t => t.templateKey).map(t => t.templateKey)))
    }).catch(() => {})
    return () => { live = false }
  }, [sel, rev])

  const event = tournaments.find(t => t.id === sel) || null
  const first = event && isYmd(event.firstDay) ? event.firstDay : ''
  const upcoming = tournaments.filter(t => !t.lastDay || t.lastDay >= today)
  const options = event && !upcoming.includes(event) ? [event, ...upcoming] : upcoming

  const phases = useMemo(() => {
    const out: { label: string; items: TemplateItem[] }[] = []
    for (const it of STARTER_TEMPLATE.slice().sort((a, b) => a.offset - b.offset)) {
      const label = phaseLabel(it.offset)
      const last = out[out.length - 1]
      if (last && last.label === label) last.items.push(it)
      else out.push({ label, items: [it] })
    }
    return out
  }, [])

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/tasks" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-teal-700 mb-3"><ChevronLeft size={15} /> Tasks</Link>
      <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><LayoutTemplate size={24} className="text-teal-600" /> Checklist template</h1>
      <p className="text-sm text-slate-600 mt-1 max-w-2xl">
        What an event usually needs, from the field application about 16 weeks out to the grant report a month after.
        Each event gets its own copy of the items you pick, due on dates counted back from its first game day.
      </p>

      <div className="mt-4 mb-5 flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-xl p-3.5">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">Preview due dates for
          <select value={sel} onChange={e => setSel(e.target.value)}
            className="border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal text-slate-800 bg-white min-w-[14rem]">
            <option value="">No event (show timing only)</option>
            {options.map(t => <option key={t.id} value={t.id}>{t.name}{t.firstDay ? ` · ${eventRange(t.firstDay, t.lastDay)}` : ''}</option>)}
          </select>
        </label>
        {event && (
          <button type="button" onClick={() => setStarter(true)} className="btn-primary inline-flex items-center gap-1.5">
            <Plus size={16} /> Add items to {event.name}
          </button>
        )}
        {event && have.size > 0 && (
          <Link href={`/tournaments/${event.id}/tasks`} className="text-sm font-semibold text-teal-700 hover:underline inline-flex items-center gap-1">
            {event.name} has {have.size} of these <ArrowRight size={14} />
          </Link>
        )}
      </div>

      <div className="space-y-4">
        {phases.map(ph => (
          <section key={ph.label} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <h2 className="px-4 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600">{ph.label}</h2>
            <ul>
              {ph.items.map(it => {
                const due = first ? addDays(first, it.offset) : ''
                const link = it.link ? TASK_LINKS[it.link] : undefined
                return (
                  <li key={it.key} className="flex items-start gap-3 px-4 py-3 border-t border-slate-100">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-800">
                        {it.title}
                        {have.has(it.key) && <span className="ml-2 inline-flex items-center gap-0.5 text-xs font-semibold text-teal-700 whitespace-nowrap"><Check size={12} strokeWidth={3} /> On the list</span>}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span>{categoryLabel(it.category)}</span>
                        {it.only && <span className="px-2 rounded-full bg-amber-50 text-amber-800 font-medium">Only: {it.only}</span>}
                        {link && (event
                          ? <Link href={link.path(event.id)} className="inline-flex items-center gap-0.5 font-semibold text-teal-700 hover:underline">{link.label}<ArrowRight size={11} /></Link>
                          : <span className="inline-flex items-center gap-0.5">{link.label}<ArrowRight size={11} /></span>)}
                      </span>
                      {it.tracked && TRACKED_NOTES[it.key] && (
                        <span className="mt-1 flex items-start gap-1 text-xs text-teal-800"><RefreshCw size={12} className="mt-0.5 flex-shrink-0" /> {TRACKED_NOTES[it.key]}</span>
                      )}
                      {it.steps && it.steps.length > 0 && (
                        <span className="mt-1 flex items-start gap-1 text-xs text-slate-500"><ListChecks size={12} className="mt-0.5 flex-shrink-0" /> {it.steps.join(' · ')}</span>
                      )}
                    </span>
                    <span className="flex-shrink-0 w-28 text-right text-xs">
                      {due
                        ? <><span className={`block font-semibold ${due < today ? 'text-slate-400' : 'text-slate-700'}`}>{dayDate(due)}</span><span className="block text-slate-500">{timingLabel(it.offset)}</span></>
                        : <span className="font-semibold text-slate-600">{timingLabel(it.offset)}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <h2 className="px-4 py-2 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5"><ClipboardCheck size={14} /> Setup checklist</h2>
          <div className="px-4 py-3 border-t border-slate-100">
            <p className="text-sm text-slate-700">
              Every event also gets the shared setup checklist, due the day before
              {first ? ` (${dayDate(addDays(first, -1))} for ${event?.name})` : ''}.
              Staff check items off on their phones from <span className="font-semibold">Setup → Checklist</span>, and anyone can add their own.
              It starts with these {DEFAULT_SETUP_ITEMS.length}:
            </p>
            <ul className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 list-disc pl-5">
              {DEFAULT_SETUP_ITEMS.map(i => <li key={i.id}>{i.text}</li>)}
            </ul>
          </div>
        </section>
      </div>

      {starter && event && (
        <StarterDialog tournament={event} have={have} today={today}
          onClose={() => setStarter(false)}
          onAdded={() => { setStarter(false); setRev(r => r + 1); announceTasksChanged() }} />
      )}
    </div>
  )
}
