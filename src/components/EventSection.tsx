'use client'
import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Collapsible section card for the public event page. Opens automatically when
// its id is the URL hash (so the "Event info" dropdown jumps to and reveals it).
export default function EventSection({ id, title, defaultOpen = false, children }: { id?: string; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  useEffect(() => {
    if (!id) return
    const check = () => { if (window.location.hash === '#' + id) setOpen(true) }
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [id])
  return (
    <section id={id} className="scroll-mt-24 bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-50/60 transition-colors" aria-expanded={open}>
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900 flex-1">{title}</h2>
        <ChevronDown size={20} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <div hidden={!open} className="px-5 pb-5 pt-4 border-t border-slate-100">{children}</div>
    </section>
  )
}
