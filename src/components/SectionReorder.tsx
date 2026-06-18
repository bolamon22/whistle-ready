'use client'
import { useState } from 'react'
import { GripVertical, ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react'
import { SECTION_LABELS, resolveSectionOrder } from '@/lib/eventSections'

// Drag-to-reorder + show/hide list for the public event page sections.
// Pure UI: parent owns `order` and `hidden`, this calls onChange with new values.
export default function SectionReorder({ order, hidden, onChange }: {
  order?: string[]
  hidden?: string[]
  onChange: (order: string[], hidden: string[]) => void
}) {
  const items = resolveSectionOrder(order)
  const hiddenSet = new Set(Array.isArray(hidden) ? hidden : [])
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [m] = next.splice(from, 1)
    next.splice(to, 0, m)
    onChange(next, Array.from(hiddenSet))
  }
  const toggle = (key: string) => {
    const next = new Set(hiddenSet)
    next.has(key) ? next.delete(key) : next.add(key)
    onChange(items, Array.from(next))
  }

  return (
    <div className="space-y-1.5">
      {items.map((key, i) => {
        const isHidden = hiddenSet.has(key)
        return (
          <div
            key={key}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => { e.preventDefault(); setOver(i) }}
            onDrop={() => { if (drag !== null) move(drag, i); setDrag(null); setOver(null) }}
            onDragEnd={() => { setDrag(null); setOver(null) }}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 bg-white transition-colors ${over === i && drag !== null ? 'border-teal-400 ring-1 ring-teal-200' : 'border-slate-200'} ${isHidden ? 'opacity-55' : ''}`}
          >
            <GripVertical size={16} className="text-slate-300 cursor-grab shrink-0" />
            <span className={`flex-1 text-sm font-medium ${isHidden ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{SECTION_LABELS[key] || key}</span>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className="p-1 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Move up"><ChevronUp size={15} /></button>
              <button type="button" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} className="p-1 rounded text-slate-400 hover:bg-slate-100 disabled:opacity-30" title="Move down"><ChevronDown size={15} /></button>
              <button type="button" onClick={() => toggle(key)} className={`p-1 rounded hover:bg-slate-100 ${isHidden ? 'text-slate-400' : 'text-teal-600'}`} title={isHidden ? 'Hidden — click to show' : 'Visible — click to hide'}>
                {isHidden ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
