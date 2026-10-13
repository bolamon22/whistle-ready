'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { dateRange } from '@/components/nav/navConfig'

// Which events one field director works (lib/fieldDirector): they see only these, on
// their home page and everywhere else. Each click saves. Used on Logins (admin) and
// Your team (director). Several field directors can work the same event.
export type FieldDirectorEvent = { id: string; name: string; startDate: string; endDate: string; orgId: string | null }

export default function FieldDirectorEvents({ userId, events, selected, onSaved }: {
  userId: string
  events: FieldDirectorEvent[]
  selected: string[]
  onSaved?: (events: string[]) => void
}) {
  const [sel, setSel] = useState<string[]>(selected)
  const [busy, setBusy] = useState(false)

  async function toggle(id: string) {
    const before = sel
    const next = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]
    setSel(next); setBusy(true)
    try {
      const res = await fetch('/api/field-director-events', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, events: next }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setSel(before); toast.error(d?.error || 'That didn’t save. Please try again.'); return }
      const saved: string[] = Array.isArray(d?.events) ? d.events : next
      setSel(saved); onSaved?.(saved)
      toast.success('Events saved')
    } catch {
      setSel(before); toast.error('That didn’t save. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Events they work">
      <span className="text-[11px] font-semibold text-slate-500 mr-0.5">Works</span>
      {events.map(e => {
        const on = sel.includes(e.id)
        const when = dateRange(e)
        return (
          <button key={e.id} type="button" disabled={busy} onClick={() => toggle(e.id)} aria-pressed={on} title={when ? `${e.name}, ${when}` : e.name}
            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors disabled:opacity-60 ${on ? 'bg-orange-600 border-orange-600 text-white' : 'bg-white border-slate-300 text-slate-500 hover:border-orange-400 hover:text-orange-700'}`}>
            {on ? '✓ ' : ''}{e.name}{when ? <span className={on ? 'text-orange-100' : 'text-slate-400'}> · {when}</span> : null}
          </button>
        )
      })}
      {events.length === 0 && <span className="text-[11px] text-slate-400">No upcoming events to pick</span>}
      {events.length > 0 && sel.length === 0 && <span className="text-[11px] text-amber-700">Pick their events: until then they see none</span>}
    </div>
  )
}
