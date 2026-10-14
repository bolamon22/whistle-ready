'use client'
import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { isMorning, sortTimes, time12, timesList } from '@/lib/availabilityAnswers'

// "Pick exact game times": the start times someone CAN work on one day (Bo, Oct 14
// 2026: Morning / Afternoon first, exact times once the schedule is posted). A sheet
// from the bottom on a phone, a small dialog on a computer. Used on the staff home
// and, for someone who texted, on the head assigner's Availability page.
//
// Worded as the times someone is FREE, never as picking games (Bo, Oct 14 2026: "we
// don't exactly let them choose the exact games ... if we let everyone just pick games
// randomly, we would never be able to schedule everyone consistently"). Scorekeepers
// usually work one field all day and refs are placed by the assigner, so this only
// narrows when they can be used; the assigner still decides their games.

export default function ExactTimesSheet({ title, posted, initial, who, onClose, onSave }: {
  title: string
  posted: { t: string; n: number }[]
  initial: string[]
  /** Their first name when someone else is answering for them. */
  who?: string
  onClose: () => void
  onSave: (times: string[]) => Promise<boolean> | boolean
}) {
  const all = sortTimes(posted.map(p => p.t))
  const games = new Map(posted.map(p => [p.t, p.n]))
  const [sel, setSel] = useState<string[]>(() => sortTimes(initial.filter(t => all.includes(t))))
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const on = new Set(sel)
  const toggle = (t: string) => setSel(s => sortTimes(s.includes(t) ? s.filter(x => x !== t) : [...s, t]))
  const am = all.filter(isMorning), pm = all.filter(t => !isMorning(t))
  const n = sel.length
  const summary = n === 0
    ? `Nothing picked yet. If ${who ? `${who} can't` : "you can't"} work this day at all, close this and tap Can't work.`
    : n === all.length ? "Free at every time. That's the same as All day."
    : `${who ? `${who} is` : "You're"} free at ${n} of ${all.length} start times: ${timesList(sel)}.`

  async function save() {
    if (!n || saving) return
    setSaving(true)
    const ok = await onSave(sel)
    setSaving(false)
    if (ok) onClose()
  }

  const group = (label: string, times: string[]) => times.length > 0 && (
    <div>
      <p className="text-[11px] font-bold tracking-wider text-slate-400 mb-1.5">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {times.map(t => {
          const picked = on.has(t)
          const g = games.get(t) || 0
          return (
            <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={picked}
              className={`h-14 px-3 rounded-xl border-[1.5px] flex items-center justify-between gap-2 text-left transition-colors ${picked ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-300 text-slate-900 hover:border-slate-400'}`}>
              <span className="flex flex-col leading-tight">
                <span className="text-base font-extrabold">{time12(t)}</span>
                {who && <span className={`text-xs font-semibold ${picked ? 'text-teal-100' : 'text-slate-500'}`}>{g} game{g === 1 ? '' : 's'}</span>}
              </span>
              {picked && <Check size={18} strokeWidth={3} />}
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={`${title}: times free`}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl px-4 pt-2.5 pb-5 sm:p-5 flex flex-col gap-3">
        <div className="sm:hidden self-center w-10 h-1.5 rounded-full bg-slate-300" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-600 mt-0.5">{who ? `Tap the times ${who} is free.` : "Tap the times you're free. The assigner still decides which games you work."}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200"><X size={16} /></button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {am.length > 0 && <button type="button" onClick={() => setSel(am)} className="h-8 px-3 rounded-full border border-slate-300 bg-white text-[13px] font-bold text-slate-700 hover:bg-slate-50">Mornings</button>}
          {pm.length > 0 && <button type="button" onClick={() => setSel(pm)} className="h-8 px-3 rounded-full border border-slate-300 bg-white text-[13px] font-bold text-slate-700 hover:bg-slate-50">Afternoons</button>}
          <button type="button" onClick={() => setSel(all)} className="h-8 px-3 rounded-full border border-slate-300 bg-white text-[13px] font-bold text-slate-700 hover:bg-slate-50">All of them</button>
          <button type="button" onClick={() => setSel([])} className="h-8 px-2 text-[13px] font-bold text-slate-500 underline">Clear</button>
        </div>
        {group('MORNING', am)}
        {group('AFTERNOON', pm)}
        <p className={`rounded-xl px-3 py-2.5 text-[13px] leading-snug ${n ? 'bg-teal-50 text-teal-900' : 'bg-amber-50 text-amber-800'}`}>{summary}</p>
        <button type="button" onClick={save} disabled={!n || saving}
          className="h-12 rounded-xl bg-teal-700 text-white text-base font-extrabold hover:bg-teal-800 disabled:bg-slate-300">
          {saving ? 'Saving…' : n ? `Save · free at ${n} time${n === 1 ? '' : 's'}` : 'Save'}
        </button>
      </div>
    </div>
  )
}
