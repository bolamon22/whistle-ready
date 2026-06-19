'use client'
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Bold, open-by-default section. Accent bar + large heading; still collapsible.
export default function EventSection({ id, title, defaultOpen = true, children }: { id?: string; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    if (!id) return
    const check = () => { if (window.location.hash === '#' + id) setOpen(true) }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [id])
  return (
    <section id={id} className="scroll-mt-28">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 text-left" aria-expanded={open}>
        <span className="w-1.5 h-7 rounded-full bg-teal-500 shrink-0" aria-hidden="true" />
        <h2 className="flex-1 text-2xl sm:text-[28px] font-extrabold tracking-tight text-slate-900">{title}</h2>
        <ChevronDown size={22} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div hidden={!open} className="pt-4 sm:pl-[18px]">{children}</div>
    </section>
  )
}
