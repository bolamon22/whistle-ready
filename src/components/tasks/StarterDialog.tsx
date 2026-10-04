'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { LayoutTemplate, RefreshCw, X } from 'lucide-react'
import {
  STARTER_TEMPLATE, addDays, categoryLabel, dayDate, eventRange, isYmd, phaseLabel,
  type TaskTournament, type TemplateItem,
} from '@/lib/taskTemplate'

// Pick which checklist-template items an event needs. Each becomes a task due
// on its date counted back from the first game day.
//
// Ticked to begin with: what every event needs, plus the "only some events"
// items this event's name suggests -- but nothing already due before today. On
// an event three weeks out, most of the early items (fields, registration,
// rentals) are done or settled; adding them all would open with a wall of red.
// Bo ticks the ones that still need doing. Items the event already has show
// as already on the list and can't be added twice (the server skips them too).

export default function StarterDialog({ tournament, have, today, onClose, onAdded }: {
  tournament: TaskTournament
  /** Template keys this event already has. */
  have: Set<string>
  today: string
  onClose: () => void
  onAdded: (added: number) => void
}) {
  const first = isYmd(tournament.firstDay) ? tournament.firstDay : ''
  const name = tournament.name.toLowerCase()
  const dueOf = (it: TemplateItem) => (first ? addDays(first, it.offset) : '')
  const applies = (it: TemplateItem) => !it.only || (it.suggest || []).some(s => name.includes(s))
  const isPast = (it: TemplateItem) => { const d = dueOf(it); return !!d && d < today }

  const [picked, setPicked] = useState<Set<string>>(() => new Set(
    STARTER_TEMPLATE.filter(it => !have.has(it.key) && applies(it) && !isPast(it)).map(it => it.key)))
  const [saving, setSaving] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const pastLeft = STARTER_TEMPLATE.filter(it => !have.has(it.key) && applies(it) && isPast(it)).length
  const open = STARTER_TEMPLATE.filter(it => !have.has(it.key))
  const n = picked.size

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

  // Escape closes; the page behind doesn't scroll while the dialog is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => { document.body.style.overflow = prev }
  }, [])

  const toggle = (key: string) => setPicked(s => {
    const next = new Set(s)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  async function save() {
    if (!n || saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/tasks/starter', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: tournament.id, keys: Array.from(picked) }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Could not add the checklist')
      const added = Number(d.added) || 0
      toast.success(added ? `Added ${added} ${added === 1 ? 'task' : 'tasks'} to ${tournament.name}` : 'Those items were already on the list')
      onAdded(added)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add the checklist')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => { if (!saving) onClose() }} />
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="starter-title"
        className="relative w-full sm:max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl focus:outline-none">
        <div className="px-5 pt-5 pb-4 border-b border-slate-200">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center flex-shrink-0"><LayoutTemplate size={17} /></span>
            <div className="flex-1 min-w-0">
              <h2 id="starter-title" className="text-base font-bold text-slate-900 leading-tight">Add from the checklist template</h2>
              <p className="text-sm text-slate-500 mt-0.5 truncate">{[tournament.name, eventRange(tournament.firstDay, tournament.lastDay)].filter(Boolean).join(' · ')}</p>
            </div>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Close"
              className="p-1.5 -mr-1.5 -mt-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100"><X size={18} /></button>
          </div>
          <p className="text-sm text-slate-600 mt-3">
            {first
              ? 'Each item you tick becomes a task, due on its date counted back from the first game day. Untick what this event doesn’t need.'
              : 'Each item you tick becomes a task. This event has no game dates yet, so the tasks won’t have due dates; you can give each one a date later.'}
          </p>
          {pastLeft > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
              {pastLeft} {pastLeft === 1 ? 'item was' : 'items were'} due before today and {pastLeft === 1 ? 'is' : 'are'} left unticked. Tick any that still need doing.
            </p>
          )}
          <div className="flex items-center gap-3 mt-3 text-sm">
            <button type="button" onClick={() => setPicked(new Set(open.map(it => it.key)))} className="font-semibold text-teal-700 hover:underline">Select all</button>
            <button type="button" onClick={() => setPicked(new Set())} className="font-semibold text-teal-700 hover:underline">Clear</button>
            <span className="ml-auto text-xs text-slate-500">{STARTER_TEMPLATE.length} items in the template</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {phases.map(ph => (
            <section key={ph.label}>
              <h3 className="sticky top-0 z-10 px-5 py-1.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">{ph.label}</h3>
              <ul>
                {ph.items.map(it => {
                  const already = have.has(it.key)
                  const due = dueOf(it)
                  const past = isPast(it)
                  return (
                    <li key={it.key} className="border-b border-slate-100 last:border-b-0">
                      <label className={`flex items-start gap-3 px-5 py-2.5 ${already ? 'opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
                        <input type="checkbox" checked={already || picked.has(it.key)} disabled={already} onChange={() => toggle(it.key)}
                          className="mt-0.5 w-[18px] h-[18px] flex-shrink-0 accent-teal-600" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-slate-800">{it.title}</span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                            <span>{categoryLabel(it.category)}</span>
                            {it.only && <span className="px-2 rounded-full bg-amber-50 text-amber-800 font-medium">{it.only}</span>}
                            {it.tracked && <span className="inline-flex items-center gap-1 text-teal-700"><RefreshCw size={11} /> Tracked</span>}
                            {already && <span className="font-semibold text-teal-700">Already on the list</span>}
                          </span>
                        </span>
                        {due && (
                          <span className={`flex-shrink-0 w-24 text-right text-xs font-semibold ${past ? 'text-slate-400' : 'text-slate-600'}`}>
                            {dayDate(due)}
                            {past && <span className="block text-[11px] font-normal">Before today</span>}
                          </span>
                        )}
                      </label>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-200 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))]">
          <span className="text-sm text-slate-600">{n} selected</span>
          <button type="button" onClick={onClose} disabled={saving}
            className="ml-auto px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
          <button type="button" onClick={save} disabled={!n || saving}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${n && !saving ? 'bg-teal-700 hover:bg-teal-800 text-white' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}>
            {saving ? 'Adding…' : `Add ${n} ${n === 1 ? 'task' : 'tasks'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
