'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarDays, CheckCircle2, ExternalLink, Pencil } from 'lucide-react'
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
          <div key={w.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden" data-testid="parent-waiver">
            <div className="flex gap-3.5 items-center p-4">
              <span aria-hidden className="w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br from-[#0b1f3a] to-[#0e7490] text-white text-[22px] font-extrabold flex items-center justify-center">{f.jerseyNumber || first[0]}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-bold text-slate-900 leading-tight">{w.playerName || 'Player'}</h3>
                <div className="text-[13px] text-slate-600">{[f.position, f.grade && `Grade ${f.grade}`, f.jerseyNumber && `#${f.jerseyNumber}`].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div className="px-4 pb-3.5 space-y-2">
              {where && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="font-semibold text-sm text-slate-900">{w.team || where}</span>
                  {w.division && <span className="text-xs font-semibold text-teal-700 bg-teal-50 border border-teal-100 rounded-full px-2.5 py-0.5">{w.division}</span>}
                </div>
              )}
              {w.eventName && (
                <div className={`flex items-center gap-2 text-sm font-semibold ${w.past ? 'text-slate-500' : 'text-teal-700'}`}>
                  {w.past ? <CalendarDays size={16} className="shrink-0" /> : <CheckCircle2 size={16} className="shrink-0" />}
                  <span>{w.past ? 'Event over' : 'Waiver on file'} · {w.eventName}{w.eventDates && `, ${w.eventDates}`}</span>
                </div>
              )}
            </div>
            {(w.passUrl || (!w.past && editing !== w.id)) && (
              <div className="grid grid-cols-2 border-t border-slate-200">
                {w.passUrl
                  ? <a href={w.passUrl} target="_blank" rel="noopener" className="min-h-[48px] flex items-center justify-center gap-1.5 text-sm font-bold text-teal-700 border-r border-slate-200"><ExternalLink size={14} /> Player card</a>
                  : <span className="border-r border-slate-200" />}
                {!w.past && editing !== w.id
                  ? <button type="button" onClick={() => setEditing(w.id)} className="min-h-[48px] flex items-center justify-center gap-1.5 text-sm font-bold text-teal-700"><Pencil size={14} /> Edit details</button>
                  : <span />}
              </div>
            )}
            {editing === w.id && !w.past && (
              <div className="px-4 pb-4"><Editor w={w} onCancel={() => setEditing('')} onSaved={fields => {
                onChange(waivers.map(x => x.id === w.id ? { ...x, fields } : x))
                setEditing('')
                toast.success(`Saved ${first}’s details`)
              }} /></div>
            )}
          </div>
        )
      })}
    </div>
  )
}
