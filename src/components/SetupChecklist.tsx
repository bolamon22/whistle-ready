'use client'

import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Trash2, Check, Plus } from 'lucide-react'
import type { ChecklistItem } from '@/lib/setupChecklist'

// The shared setup checklist, as one card: progress, the items, and a box to
// add one. Used by the checklist page staff open on their phones and by the
// tournament's Tasks tab, so both read and write the same list
// (/api/tournaments/[id]/checklists, which stamps who checked what).

type Props = {
  tournamentId: string
  /** Done / total after every load and save, so a page can keep its counts in step. */
  onProgress?: (p: { done: number; total: number }) => void
}

export default function SetupChecklist({ tournamentId, onProgress }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving] = useState(false)
  const report = useRef(onProgress)
  report.current = onProgress

  function load() {
    fetch(`/api/tournaments/${tournamentId}/checklists`).then(r => r.ok ? r.json() : null).then(d => {
      if (d && Array.isArray(d.items)) setItems(d.items)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }
  useEffect(() => { if (tournamentId) load() }, [tournamentId])

  useEffect(() => {
    if (loaded) report.current?.({ done: items.filter(i => i.done).length, total: items.length })
  }, [items, loaded])

  // Persist the full list; the server stamps done-by and returns the cleaned list.
  async function save(next: ChecklistItem[]) {
    setItems(next) // optimistic
    setSaving(true)
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/checklists`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: next }),
      })
      if (res.ok) { const d = await res.json(); if (Array.isArray(d.items)) setItems(d.items) }
      else { const e = await res.json().catch(() => ({})); toast.error(e.error || 'Failed to save'); load() }
    } catch { toast.error('Failed to save'); load() } finally { setSaving(false) }
  }

  function toggle(itemId: string) {
    save(items.map(i => i.id === itemId ? { ...i, done: !i.done } : i))
  }
  function remove(itemId: string) {
    save(items.filter(i => i.id !== itemId))
  }
  function add() {
    const text = newItem.trim()
    if (!text) return
    const item: ChecklistItem = { id: Math.random().toString(36).slice(2, 10), text, done: false }
    setNewItem('')
    save([...items, item])
  }

  const doneCount = items.filter(i => i.done).length
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      {/* progress */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-slate-700">{doneCount} of {items.length} done</span>
        <span className="text-xs text-slate-400">{pct}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
      </div>

      {/* items */}
      <div className="space-y-2 mb-3">
        {loaded && items.length === 0 && <p className="text-sm text-slate-400 py-2">No items yet — add the first one below.</p>}
        {items.map(item => (
          <div key={item.id} className="group flex items-center gap-3">
            <button type="button" onClick={() => toggle(item.id)}
              className={`flex-1 flex items-center gap-3 p-2.5 rounded-xl border text-left ${item.done ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}>
              <span className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-teal-600 text-white' : 'bg-white border border-slate-300 text-transparent'}`}><Check size={14} /></span>
              <span className="min-w-0">
                <span className={`block text-sm ${item.done ? 'text-slate-800 font-medium' : 'text-slate-600'}`}>{item.text}</span>
                {item.done && item.doneBy && (
                  <span className="block text-[11px] text-slate-400">{item.doneBy}{item.doneAt ? ` · ${new Date(item.doneAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</span>
                )}
              </span>
            </button>
            {/* Always visible on a touch screen (phone or iPad, no hover there); with a mouse, it shows on hover. */}
            <button type="button" onClick={() => remove(item.id)} aria-label={`Remove ${item.text}`} title="Remove item"
              className="text-slate-300 hover:text-red-500 flex-shrink-0 p-1 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus:opacity-100 transition-opacity"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      {/* add item */}
      <div className="flex gap-2 pt-2 border-t border-slate-100">
        <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="Add a setup item…" aria-label="Add a setup item"
          className="flex-1 min-w-0 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
        <button type="button" onClick={add} disabled={!newItem.trim() || saving}
          className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg font-semibold text-sm ${newItem.trim() && !saving ? 'bg-teal-600 hover:bg-teal-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}><Plus size={16} /> Add</button>
      </div>
    </div>
  )
}
