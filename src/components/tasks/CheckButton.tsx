'use client'

import { Check } from 'lucide-react'
import { addDays, dueBucket, isYmd, type TaskView } from '@/lib/taskTemplate'

// The round check-off button and the due-date color, shared by the task board
// and the dashboard cards so a task looks the same wherever it shows.

export function CheckButton({ done, onClick, label, size = 22 }: { done: boolean; onClick: () => void; label: string; size?: number }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={done} aria-label={label} title={label}
      className="group/check flex-shrink-0 p-1.5 -m-1.5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
      <span style={{ width: size, height: size }}
        className={`rounded-full border-2 flex items-center justify-center transition-colors ${done
          ? 'bg-teal-600 border-teal-600 text-white'
          : 'bg-white border-slate-400 text-transparent group-hover/check:border-teal-500 group-hover/check:text-teal-500'}`}>
        <Check size={Math.round(size * 0.6)} strokeWidth={3} />
      </span>
    </button>
  )
}

/** Red when late, amber when due today or tomorrow, darker the sooner it is due. */
export function dueTone(t: Pick<TaskView, 'done' | 'dueDate'>, today: string): string {
  if (t.done) return 'text-emerald-700'
  const b = dueBucket(t.dueDate, today)
  if (b === 'overdue') return 'text-red-700'
  if (b === 'week') return isYmd(t.dueDate) && t.dueDate <= addDays(today, 1) ? 'text-amber-700' : 'text-slate-700'
  return 'text-slate-500'
}
