'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, ExternalLink, Pencil } from 'lucide-react'
import { PARENT_FIELD_GROUPS, type ParentField } from '@/lib/parentWaiverFields'

// My Players on the parent page: the waivers in this parent's account (made at the
// end of the waiver, see ParentAccountOffer) and an editor for the details a parent
// may change (lib/parentWaiverFields). Saves go to PATCH /api/parent/waivers/<id>,
// which records "parent: <name>" in the waiver's edit history for staff.

export type ParentWaiver = {
  id: string
  tournamentId: string
  /** With the team, how the schedule names it: (division, team). Blank when the team was typed in. */
  division: string
  playerName: string
  eventName: string
  eventDates: string
  startDate: string
  past: boolean
  clubName: string
  team: string
  submittedAt: string
  passUrl: string
  fields: Record<string, string>
  shown: string[]
}

const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500'
const labelCls = 'block text-xs font-semibold text-gray-500 mb-1'

function FieldInput({ f, value, onChange }: { f: ParentField; value: string; onChange: (v: string) => void }) {
  if (f.type === 'select') {
    const opts = f.options || []
    return (
      <select className={inputCls} name={f.key} value={value} onChange={e => onChange(e.target.value)}>
        {(!f.required || !value) && <option value="">{f.required ? 'Select…' : '—'}</option>}
        {/* An answer from before the list changed still shows as it was saved. */}
        {value && !opts.includes(value) && <option value={value}>{value}</option>}
        {opts.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }
  if (f.key === 'jerseyNumber') {
    return <input className={inputCls} name={f.key} value={value} inputMode="numeric" autoComplete="off" maxLength={3}
      placeholder={f.placeholder} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 3))} />
  }
  return <input className={inputCls} name={f.key} type={f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'} value={value}
    placeholder={f.placeholder} maxLength={200} onChange={e => onChange(e.target.value)} />
}

function Editor({ w, onSaved, onCancel }: { w: ParentWaiver; onSaved: (fields: Record<string, string>) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({ ...w.fields })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const shown = new Set(w.shown)
  const groups = PARENT_FIELD_GROUPS
    .map(g => ({ ...g, fields: g.fields.filter(f => shown.has(f.key) && (!f.when || draft[f.when.key] === f.when.is)) }))
    .filter(g => g.fields.length)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const changes: Record<string, string> = {}
    for (const k of w.shown) if ((draft[k] ?? '') !== (w.fields[k] ?? '')) changes[k] = draft[k] ?? ''
    if (!Object.keys(changes).length) { onCancel(); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/parent/waivers/${encodeURIComponent(w.id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'That didn’t save. Try again.'); return }
      onSaved(j.fields || { ...w.fields, ...changes })
    } catch { setError('That didn’t save. Check your connection and try again.') } finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} className="mt-4 pt-4 border-t border-gray-100 space-y-5" data-testid="waiver-editor">
      {groups.map(g => (
        <fieldset key={g.title}>
          <legend className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{g.title}</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {g.fields.map(f => (
              <div key={f.key}>
                <label className={labelCls}>{f.label}</label>
                <FieldInput f={f} value={draft[f.key] ?? ''} onChange={v => { setDraft(p => ({ ...p, [f.key]: v })); if (error) setError('') }} />
              </div>
            ))}
          </div>
        </fieldset>
      ))}
      <p className="text-xs text-gray-400 leading-relaxed">The player&rsquo;s name, date of birth and team can&rsquo;t be changed here. Ask your club director or the event office.</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold px-5 py-2 rounded-lg">{saving ? 'Saving…' : 'Save changes'}</button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-800 px-3 py-2">Cancel</button>
      </div>
    </form>
  )
}

export default function ParentWaiverList({ waivers, onChange }: { waivers: ParentWaiver[]; onChange: (next: ParentWaiver[]) => void }) {
  const [editing, setEditing] = useState('')

  return (
    <div className="space-y-3" data-testid="parent-waivers">
      {waivers.map(w => {
        const f = w.fields
        const where = [w.clubName, w.team].filter(Boolean).join(' · ')
        const first = w.playerName.trim().split(/\s+/)[0] || 'Player'
        return (
          <div key={w.id} className="bg-white border border-gray-200 rounded-xl px-5 py-4" data-testid="parent-waiver">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-gray-800">
                  {w.playerName || 'Player'}
                  {f.jerseyNumber && <span className="ml-2 text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5 align-middle">#{f.jerseyNumber}</span>}
                </div>
                {w.eventName && (
                  <div className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
                    <CalendarDays size={14} className="text-gray-400 shrink-0" />
                    <span>{w.eventName}{w.eventDates && <span className="text-gray-400"> · {w.eventDates}</span>}</span>
                  </div>
                )}
                {where && <div className="text-xs text-gray-400 mt-0.5">{where}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {w.passUrl && (
                  <a href={w.passUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg">
                    <ExternalLink size={13} /> Player card
                  </a>
                )}
                {w.past
                  ? <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">Event over</span>
                  : editing !== w.id && (
                    <button onClick={() => setEditing(w.id)} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg">
                      <Pencil size={13} /> Edit details
                    </button>
                  )}
              </div>
            </div>
            {editing === w.id && !w.past && (
              <Editor w={w} onCancel={() => setEditing('')} onSaved={fields => {
                onChange(waivers.map(x => x.id === w.id ? { ...x, fields } : x))
                setEditing('')
                toast.success(`Saved ${first}’s details`)
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
