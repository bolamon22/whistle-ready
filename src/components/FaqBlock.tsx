'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Collapsible question/answer list.
export default function FaqBlock({ items }: { items: { q: string; a: string }[] }) {
  const list = (items || []).filter(it => it && it.q)
  const [open, setOpen] = useState<number | null>(0)
  if (!list.length) return null
  return (
    <div className="divide-y divide-slate-100">
      {list.map((it, i) => (
        <div key={i}>
          <button type="button" onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center gap-3 py-3 text-left">
            <span className="flex-1 font-semibold text-slate-800">{it.q}</span>
            <ChevronDown size={18} className={`text-slate-400 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
          </button>
          {open === i && it.a && <p className="text-sm text-slate-600 leading-relaxed pb-4 whitespace-pre-line">{it.a}</p>}
        </div>
      ))}
    </div>
  )
}
