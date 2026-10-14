'use client'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Check, ChevronRight, Clock, Lock } from 'lucide-react'
import ExactTimesSheet from '@/components/ExactTimesSheet'
import { AvailAnswer, DayState, allDaysPhrase, dayTitle, timesList, availLocked, availChangeBy } from '@/lib/availabilityAnswers'

// "Which days can you work?" on the staff home, inside each event they're working
// (Bo, Oct 14 2026). The head assigner said refs and staff had trouble listing their
// availability: it hid behind a "Set my availability" link, All day was picked for
// everyone so tapping it saved nothing, and Part of day asked for the times they
// can't work. Now each day asks for one tap (All day, Morning, Afternoon, Can't work)
// and saves it, so the assigner can see who has answered. Once the schedule is
// published, a day can be narrowed to exact game times instead. Answers:
// api/availability/answers (staff can only answer for themselves).

export type AvDay = { date: string; posted: { t: string; n: number }[]; state: DayState | null }

const CHOICES: { a: AvailAnswer; label: string }[] = [
  { a: 'all', label: 'All day' },
  { a: 'am', label: 'Morning' },
  { a: 'pm', label: 'Afternoon' },
  { a: 'no', label: "Can't work" },
]

function chipClass(picked: boolean, a: AvailAnswer): string {
  if (!picked) return 'bg-white border-slate-300 text-slate-700 hover:border-slate-400'
  if (a === 'all') return 'bg-teal-700 border-teal-700 text-white'
  if (a === 'no') return 'bg-rose-700 border-rose-700 text-white'
  return 'bg-amber-400 border-amber-500 text-amber-950'
}

export default function MyAvailability({ eventId, days, onChange }: { eventId: string; days: AvDay[]; onChange: (days: AvDay[]) => void }) {
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState('')   // the day whose game times are open
  const answered = days.filter(d => d.state).length
  // Each day locks 48 hours before it (lib/availabilityAnswers); the API refuses it too.
  const locked = (d: AvDay) => availLocked(d.date)
  const anyLocked = days.some(locked)
  const done = days.length > 0 && answered === days.length

  async function save(dates: string[], a: AvailAnswer, times: string[] = []): Promise<boolean> {
    if (busy) return false
    const before = days
    onChange(days.map(d => dates.includes(d.date) ? { ...d, state: { a, times, by: 'self', at: new Date().toISOString() } } : d))
    setBusy(true)
    const res = await fetch('/api/availability/answers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tournamentId: eventId, dates, answer: a, times }),
    }).catch(() => null)
    const j = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    if (!res?.ok) { onChange(before); toast.error(j.error || 'Could not save. Try again.'); return false }
    if (j.days) onChange(before.map(d => ({ ...d, state: j.days[d.date] || null })))
    return true
  }

  const open = days.find(d => d.date === sheet)
  return (
    <div data-avail>
      <div className="px-4 pt-3.5 pb-3 flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[15px] font-extrabold text-slate-900">Which days can you work?</p>
          <span className={`text-xs font-extrabold whitespace-nowrap ${done ? 'text-teal-700' : 'text-amber-700'}`}>{answered} of {days.length} answered</span>
        </div>
        <p className="text-[13px] text-slate-600 -mt-1">Tap one for each day. It saves right away, and the assigner sees it. Each day locks 48 hours before it starts, so answer early.</p>
        {answered === 0 && days.length > 0 && !anyLocked && (
          <button type="button" onClick={() => save(days.map(d => d.date), 'all')} disabled={busy}
            className="h-11 rounded-xl border-[1.5px] border-teal-500 bg-teal-50 text-teal-700 text-sm font-extrabold inline-flex items-center justify-center gap-1.5 hover:bg-teal-100 disabled:opacity-60">
            <Check size={15} strokeWidth={3} />I can work {allDaysPhrase(days.length)}, all day
          </button>
        )}
      </div>
      {days.map(d => {
        const s = d.state
        const shut = locked(d)
        const later = d.posted.length ? '' : ' You can pick exact games once the schedule is posted.'
        const hint = s?.a === 'am' ? 'Morning means games that start before noon.' + later
          : s?.a === 'pm' ? 'Afternoon means games that start at noon or later.' + later
          : s?.a === 'no' ? "You won't be put on any games this day." : ''
        return (
          <div key={d.date} className={`border-t border-slate-100 px-3 pt-3 pb-3.5 flex flex-col gap-2.5 ${s || shut ? 'bg-white' : 'bg-amber-50'}`}>
            <div className="px-0.5 flex items-center justify-between gap-2">
              <span className="text-sm font-extrabold text-slate-900">{dayTitle(d.date)}</span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${shut ? 'text-slate-500' : s ? 'text-teal-700' : 'text-amber-700'}`}>
                {shut ? <Lock size={12} /> : <span className={`w-2 h-2 rounded-full ${s ? 'bg-teal-500' : 'bg-amber-500'}`} />}{shut ? 'Locked' : s ? 'Saved' : 'No answer yet'}
              </span>
            </div>
            <div role="group" aria-label={dayTitle(d.date)} className="grid grid-cols-4 gap-1.5">
              {CHOICES.map(c => {
                const picked = s?.a === c.a
                return (
                  <button key={c.a} type="button" aria-pressed={picked} disabled={busy || shut} onClick={() => { if (!picked && !shut) save([d.date], c.a) }}
                    className={`h-11 px-0.5 rounded-[10px] border-[1.5px] text-[13px] font-bold whitespace-nowrap transition-colors ${chipClass(picked, c.a)}${shut && !picked ? ' opacity-50' : ''}`}>
                    {c.label}
                  </button>
                )
              })}
            </div>
            {shut
              ? <p className="px-0.5 text-xs text-slate-600 leading-snug">This day locked 48 hours before it starts. To change it, call or text the assigner.</p>
              : <>{hint && <p className="px-0.5 text-xs text-slate-600 leading-snug">{hint}</p>}{s && <p className="px-0.5 text-[11px] text-slate-500">You can change this until the end of {availChangeBy(d.date)}.</p>}</>}
            {s?.a === 'times' && (
              <div className="rounded-xl bg-teal-50 border border-teal-200 px-3 py-2.5 flex items-start gap-2.5">
                <Clock size={17} className="text-teal-700 shrink-0 mt-px" />
                <p className="flex-1 min-w-0 text-[13px] text-teal-900 leading-snug"><b>{s.times.length} game time{s.times.length === 1 ? '' : 's'}:</b> {timesList(s.times)}</p>
                {d.posted.length > 0 && !shut && <button type="button" onClick={() => setSheet(d.date)} className="shrink-0 text-[13px] font-extrabold text-teal-700 underline">Edit</button>}
              </div>
            )}
            {s?.a === 'out' && (
              <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-900 leading-snug">The assigner has you out at {timesList(s.times)}. Tap an answer above to change it.</p>
            )}
            {s && s.by !== 'self' && s.by && s.a !== 'out' && <p className="px-0.5 text-xs text-slate-500">Set by {s.by}. Tap another answer to change it.</p>}
            {d.posted.length > 0 && !shut && s?.a !== 'no' && s?.a !== 'times' && (
              <button type="button" onClick={() => setSheet(d.date)} className="self-start px-0.5 inline-flex items-center gap-1 text-[13px] font-bold text-teal-700 hover:text-teal-900">
                Pick exact game times instead<span className="font-medium text-slate-500">· {d.posted.length} posted</span><ChevronRight size={14} />
              </button>
            )}
          </div>
        )
      })}
      {open && (
        <ExactTimesSheet title={dayTitle(open.date)} posted={open.posted} initial={open.state?.a === 'times' ? open.state.times : []}
          onClose={() => setSheet('')} onSave={times => save([open.date], 'times', times)} />
      )}
    </div>
  )
}
