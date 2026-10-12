'use client'

import { useEffect, useRef, useState } from 'react'
import { agoLabel } from '@/lib/presenceTime'

// Nav pill for event-running roles: how many other people are in the app right
// now, and who. Polls every minute while the tab is visible.
interface Row { id: string; name: string; role: string; lastSeenAt: string | null; lastLoginAt: string | null; me?: boolean }

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', director: 'Director', club_director: 'Club director', assigner: 'Assigner',
  scheduler: 'Scheduler', coach: 'Coach', staff: 'Staff', parent: 'Parent', viewer: 'Viewer',
}

export default function WhoIsOn() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/presence').then(r => (r.ok ? r.json() : null)).then(d => { if (alive && d) setRows(d.users || []) }).catch(() => {})
    }
    load()
    const t = setInterval(load, 60_000)
    document.addEventListener('visibilitychange', load)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', load) }
  }, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (rows === null) return null
  const others = rows.filter(r => !r.me)
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        title={others.length ? `${others.length} other ${others.length === 1 ? 'person' : 'people'} on now` : 'Nobody else is on'}
        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-600 hover:border-slate-300 transition-colors">
        <span className={`w-2 h-2 rounded-full ${others.length ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden />
        {others.length} on
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-lg z-50 py-2">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">On now (last 5 min)</p>
          {rows.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Nobody else right now.</p>}
          {rows.map(r => (
            <div key={r.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden />
              <span className="font-medium text-slate-800 truncate flex-1">{r.name}{r.me && <span className="text-slate-400 font-normal"> (you)</span>}</span>
              <span className="text-[11px] text-slate-500 shrink-0">{ROLE_LABEL[r.role] ?? r.role}</span>
              <span className="text-[11px] text-slate-400 shrink-0 w-14 text-right">{agoLabel(r.lastSeenAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
