'use client'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Globe, Pencil, Plus } from 'lucide-react'
import { nameKey } from '@/lib/names'

// Notes on the public schedule page, written here (Bo, Oct 11 2026): one for this
// division and one for every division. The public page shows them at the top of a
// division (public/page.tsx DivisionView). Server side: lib/divisionNotes and
// /api/tournaments/[id]/division-notes.

type Notes = { all: string; divisions: Record<string, string> }
type Which = 'division' | 'all'
const MAX = 600   // NOTE_MAX in lib/divisionNotes, which can't be imported here (it reads the database)

export default function DivisionNotes({ tournamentId, division }: { tournamentId: string; division: string }) {
  const [notes, setNotes] = useState<Notes | null>(null)
  const [editing, setEditing] = useState<Which | ''>('')
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    fetch(`/api/tournaments/${tournamentId}/division-notes`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!live || !d || typeof d !== 'object') return
        setNotes({ all: typeof d.all === 'string' ? d.all : '', divisions: d.divisions && typeof d.divisions === 'object' ? d.divisions : {} })
      })
      .catch(() => {})
    return () => { live = false }
  }, [tournamentId])
  // Another division: whatever was half-typed belonged to the last one.
  useEffect(() => { setEditing(''); setError('') }, [division])

  if (!notes) return null
  const divNote = Object.entries(notes.divisions).find(([d]) => nameKey(d) === nameKey(division))?.[1] ?? ''
  const allNote = notes.all

  function open(which: Which) {
    setEditing(which); setDraft(which === 'all' ? allNote : divNote); setError('')
  }

  async function save() {
    if (!editing || saving) return
    setSaving(true); setError('')
    try {
      const r = await fetch(`/api/tournaments/${tournamentId}/division-notes`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ division: editing === 'all' ? '' : division, note: draft }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'That note didn’t save. Try again.'); return }
      setNotes({ all: typeof j.all === 'string' ? j.all : '', divisions: j.divisions && typeof j.divisions === 'object' ? j.divisions : {} })
      toast.success(draft.trim() ? 'Note saved' : 'Note removed')
      setEditing('')
    } catch {
      setError('That note didn’t save. Check your connection and try again.')
    } finally { setSaving(false) }
  }

  const heading = (
    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5 flex-shrink-0">
      <Globe size={12} /> Notes on the public schedule
    </span>
  )
  const addBtn = (which: Which, label: string) => (
    <button onClick={() => open(which)} className="text-xs font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1">
      <Plus size={13} /> {label}
    </button>
  )

  // Nothing written and nothing open: one line, so the tabs don't move down.
  if (!divNote && !allNote && !editing) {
    return (
      <div className="mb-3 flex items-center gap-x-4 gap-y-1.5 flex-wrap bg-white border border-slate-200 rounded-xl px-4 py-2.5" data-testid="division-notes-editor">
        {heading}
        {addBtn('division', 'Note for this division')}
        {addBtn('all', 'Note for all divisions')}
      </div>
    )
  }

  const row = (which: Which, label: string, hint: string, text: string) => (
    <div className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
      <span className="w-24 flex-shrink-0 text-xs font-semibold text-slate-500 pt-0.5">{label}</span>
      {editing === which ? (
        <div className="flex-1 min-w-0">
          <textarea value={draft} onChange={e => { setDraft(e.target.value); if (error) setError('') }} rows={3} maxLength={MAX} autoFocus
            placeholder={which === 'all' ? 'e.g. Games are 2 x 20 minute halves. Semifinals and finals are 2 x 25.' : 'e.g. Top 2 teams in each pool play in the semifinals.'}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500" />
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <button onClick={save} disabled={saving} className="bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">{saving ? 'Saving…' : 'Save'}</button>
            <button onClick={() => { setEditing(''); setError('') }} disabled={saving} className="text-xs text-slate-500 hover:text-slate-800">Cancel</button>
            <span className="text-[11px] text-slate-400 ml-auto">{hint} · {draft.length}/{MAX}</span>
          </div>
          {error && <p role="alert" className="text-xs text-red-700 mt-1.5">{error}</p>}
        </div>
      ) : text ? (
        <div className="flex-1 min-w-0 flex items-start gap-2">
          <p className="flex-1 min-w-0 text-sm text-slate-700 whitespace-pre-line break-words">{text}</p>
          <button onClick={() => open(which)} disabled={!!editing} title="Edit note" aria-label={`Edit the note for ${which === 'all' ? 'all divisions' : division}`}
            className="p-1 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 disabled:opacity-40 flex-shrink-0"><Pencil size={13} /></button>
        </div>
      ) : (
        <div className="flex-1 min-w-0 pt-0.5">{!editing && addBtn(which, 'Add a note')}</div>
      )}
    </div>
  )

  return (
    <div className="mb-3 bg-white border border-slate-200 rounded-xl px-4 py-3" data-testid="division-notes-editor">
      <div className="mb-2">{heading}</div>
      <div className="divide-y divide-slate-100">
        {row('division', 'This division', `Shows on ${division}`, divNote)}
        {row('all', 'All divisions', 'Shows on every division', allNote)}
      </div>
    </div>
  )
}
