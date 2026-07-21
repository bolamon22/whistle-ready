'use client'
import { X } from 'lucide-react'

// Public "Info" content for parents and coaches (medical, parking, lost & found…),
// shown under the Info button on the public page.
//
// Shared by the Setup wizard and the Settings page so the two can't drift — the same
// mistake with staff pay meant payroll silently used the wrong rates.

export type InfoSection = { icon: string; title: string; body: string }

export const INFO_ICON_OPTIONS = ['info', 'heart-pulse', 'shirt', 'square-parking', 'scroll-text', 'utensils', 'phone', 'cloud-lightning']

export function loadInfoSections(id: string): Promise<InfoSection[]> {
  return fetch(`/api/tournaments/${id}/info`)
    .then(r => (r.ok ? r.json() : null))
    .then(d => (d && Array.isArray(d.sections) ? d.sections : []))
    .catch(() => [])
}

/** Persist. Returns true on success — never throws. */
export function saveInfoSections(id: string, sections: InfoSection[]): Promise<boolean> {
  return fetch(`/api/tournaments/${id}/info`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections: sections.filter(s => s.title || s.body) }),
  }).then(r => r.ok).catch(() => false)
}

export default function TournamentInfoEditor({
  value, onChange,
}: {
  value: InfoSection[]
  onChange: (next: InfoSection[]) => void
}) {
  const patch = (i: number, p: Partial<InfoSection>) => onChange(value.map((x, xi) => (xi === i ? { ...x, ...p } : x)))

  return (
    <div>
      <div className="space-y-3">
        {value.map((s, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50">
            <div className="flex items-center gap-2 mb-2">
              <select value={s.icon} onChange={e => patch(i, { icon: e.target.value })}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400">
                {INFO_ICON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <input value={s.title} onChange={e => patch(i, { title: e.target.value })}
                placeholder="Section title"
                className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500" />
              <button type="button" onClick={() => onChange(value.filter((_, xi) => xi !== i))}
                className="text-red-400 hover:text-red-600 flex-shrink-0"><X size={15} /></button>
            </div>
            <textarea value={s.body} onChange={e => patch(i, { body: e.target.value })} rows={2} placeholder="Details…"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
        ))}
        {value.length === 0 && (
          <p className="text-sm text-slate-400">No info sections yet. Add one below — until you save any, the public page shows sensible defaults.</p>
        )}
      </div>
      <button type="button" onClick={() => onChange([...value, { icon: 'info', title: '', body: '' }])}
        className="mt-3 border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium">+ Add section</button>
      <p className="text-[11px] text-slate-400 mt-2">Appears on the public page under the “Info” button. The icon dropdown matches the public display.</p>
    </div>
  )
}
