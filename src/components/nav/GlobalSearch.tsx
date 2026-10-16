'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { roleCanAccess } from '@/lib/routeAccess'
import { type NavEvent, type NavMenu, dateRange, eventHref } from './navConfig'

// One search box in the header for events, staff, logins, clubs and pages
// (Bo, Oct 13 2026: "so I can have access to different people and their users").
// Each list loads the first time the box is used, through the same APIs the
// pages use, so it shows only what this role may see there: staff for roles with
// the Staff Pool, logins for admins, clubs for roles with the Club database.
// Ctrl+K (Cmd+K on a Mac) jumps to it.

type Hit = { group: string; label: string; sub: string; href: string }

const JOB: Record<string, string> = { ref: 'Ref', scorekeeper: 'Scorekeeper', athletic_trainer: 'Athletic trainer', field_ops: 'Field ops' }
const ROLE: Record<string, string> = {
  admin: 'Admin', director: 'Director', club_director: 'Club director', assigner: 'Assigner',
  scheduler: 'Scheduler', field_director: 'Field director', coach: 'Coach', staff: 'Staff', parent: 'Parent',
}
function jobsOf(w: { roles?: unknown; defaultRole?: string | null }): string[] {
  let r: unknown = w.roles
  if (typeof r === 'string') { try { r = JSON.parse(r) } catch { r = [] } }
  const list = Array.isArray(r) && r.length ? r.map(String) : (w.defaultRole ? [w.defaultRole] : [])
  return list.map(j => JOB[j] ?? j)
}

export default function GlobalSearch({ role, planOff, menus, events, previewOrgId, hotkey = false, variant = 'bar', onDone }: {
  role: string
  planOff?: readonly string[] | null
  menus: NavMenu[]
  events: NavEvent[]
  previewOrgId: string | null
  hotkey?: boolean
  variant?: 'bar' | 'sheet'
  onDone?: () => void
}) {
  const router = useRouter()
  const listId = useId()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [staff, setStaff] = useState<any[] | null>(null)
  const [logins, setLogins] = useState<any[] | null>(null)
  const [clubs, setClubs] = useState<any[] | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const loaded = useRef(false)
  const canStaff = roleCanAccess(role, '/staff', planOff)
  const canLogins = role === 'admin'
  const canClubs = roleCanAccess(role, '/dashboard/org/clubs', planOff)
  const placeholder = canClubs ? 'Search people, events, clubs' : canStaff ? 'Search people and events' : 'Search events and pages'

  useEffect(() => {
    if (!hotkey) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); input.current?.select() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hotkey])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  // An admin switching organization gets that organization's lists next time.
  useEffect(() => {
    const reset = () => { loaded.current = false; setStaff(null); setLogins(null); setClubs(null) }
    window.addEventListener('preview-org-changed', reset)
    return () => window.removeEventListener('preview-org-changed', reset)
  }, [])

  function load() {
    if (loaded.current) return
    loaded.current = true
    const org = role === 'admin' && previewOrgId ? encodeURIComponent(previewOrgId) : ''
    const list = (r: Response) => (r.ok ? r.json() : [])
    if (canStaff) fetch('/api/workers' + (org ? `?viewOrgId=${org}` : '')).then(list).then(d => setStaff(Array.isArray(d) ? d : [])).catch(() => setStaff([]))
    if (canLogins) fetch('/api/admin/users').then(list).then(d => setLogins(Array.isArray(d) ? d : [])).catch(() => setLogins([]))
    if (canClubs) fetch('/api/org-clubs' + (org ? `?org=${org}` : '')).then(r => (r.ok ? r.json() : null)).then(d => setClubs(Array.isArray(d?.clubs) ? d.clubs : [])).catch(() => setClubs([]))
  }

  const s = q.trim().toLowerCase()
  const hits = useMemo<Hit[]>(() => {
    if (s.length < 2) return []
    const has = (...v: unknown[]) => v.some(x => typeof x === 'string' && x.toLowerCase().includes(s))
    const first = <T,>(arr: T[], name: (t: T) => string) =>
      arr.map(t => ({ t, r: name(t).toLowerCase().startsWith(s) ? 0 : 1 })).sort((a, b) => a.r - b.r).map(x => x.t)
    const out: Hit[] = []
    for (const e of first(events.filter(e => has(e.name, e.location)), e => e.name).slice(0, 5)) {
      out.push({ group: 'Events', label: e.name, sub: [dateRange(e), e.location].filter(Boolean).join(' · '), href: eventHref(role, e.id, planOff) })
    }
    for (const w of first((staff ?? []).filter(w => has(w.name, w.email, ...jobsOf(w))), w => String(w.name || '')).slice(0, 5)) {
      out.push({ group: 'Staff', label: String(w.name || ''), sub: jobsOf(w).join(', '), href: `/staff/${w.id}` })
    }
    for (const u of first((logins ?? []).filter(u => has(u.name, u.email, ROLE[u.role], ...(u.clubs ?? []), ...((u.staff?.jobs ?? []) as string[]).map(j => JOB[j] ?? j))), u => String(u.name || '')).slice(0, 5)) {
      out.push({ group: 'Logins', label: String(u.name || ''), sub: [ROLE[u.role] ?? u.role, u.email].filter(Boolean).join(' · '), href: `/admin/users?q=${encodeURIComponent(u.email || u.name || '')}` })
    }
    for (const c of first((clubs ?? []).filter(c => !c.archived && has(c.club, c.city, c.contact)), c => String(c.club || '')).slice(0, 5)) {
      out.push({ group: 'Clubs', label: String(c.club || ''), sub: [c.city, c.contact].filter(Boolean).join(' · '), href: `/dashboard/org/clubs?q=${encodeURIComponent(c.club || '')}` })
    }
    for (const i of menus.flatMap(m => m.items).filter(i => has(i.label, i.desc)).slice(0, 4)) {
      out.push({ group: 'Pages', label: i.label, sub: i.desc, href: i.href })
    }
    return out
  }, [s, events, staff, logins, clubs, menus, role, planOff])

  const loading = (canStaff && staff === null) || (canLogins && logins === null) || (canClubs && clubs === null)
  const groups = useMemo(() => {
    const g: { name: string; hits: { h: Hit; i: number }[] }[] = []
    hits.forEach((h, i) => { let x = g.find(y => y.name === h.group); if (!x) { x = { name: h.group, hits: [] }; g.push(x) } x.hits.push({ h, i }) })
    return g
  }, [hits])

  function go(h: Hit | undefined) {
    if (!h) return
    setOpen(false); setQ('')
    router.push(h.href)
    onDone?.()
  }

  const showList = open && s.length >= 2
  const optionId = (i: number) => `${listId}-o${i}`

  return (
    <div ref={box} className="relative" data-nav-pop="search">
      <label className={`flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2.5 focus-within:ring-2 focus-within:ring-teal-500 ${variant === 'bar' ? 'h-10 w-full' : 'h-11 w-full'}`}>
        <Search size={16} aria-hidden className="flex-shrink-0 text-slate-500" />
        <input
          ref={input}
          type="search"
          role="combobox"
          aria-label={placeholder}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && hits[active] ? optionId(active) : undefined}
          placeholder={placeholder}
          value={q}
          onFocus={() => { setOpen(true); load() }}
          onChange={e => { setQ(e.target.value); setActive(0); setOpen(true); load() }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, Math.max(0, hits.length - 1))) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
            else if (e.key === 'Enter') { e.preventDefault(); go(hits[active]) }
            else if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
        />
        {hotkey && <kbd className="hidden 2xl:inline whitespace-nowrap rounded border border-slate-200 px-1.5 text-[11px] font-semibold text-slate-500">Ctrl K</kbd>}
      </label>
      {showList && (
        <div className={variant === 'bar'
          ? 'absolute right-0 top-full mt-2 z-50 w-[380px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl'
          : 'mt-2 rounded-2xl border border-slate-200 bg-white p-2'}>
          {hits.length === 0
            ? <p className="px-3 py-3 text-sm text-slate-600">{loading ? 'Searching…' : `Nothing matches “${q.trim()}”.`}</p>
            : (
              <ul id={listId} role="listbox" aria-label="Search results" className="max-h-[60vh] overflow-y-auto">
                {groups.map(g => (
                  <li key={g.name} role="presentation">
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{g.name}</p>
                    <ul role="group" aria-label={g.name}>
                      {g.hits.map(({ h, i }) => (
                        <li key={g.name + i} id={optionId(i)} role="option" aria-selected={i === active}
                          onMouseDown={e => { e.preventDefault(); go(h) }} onMouseEnter={() => setActive(i)}
                          className={`cursor-pointer rounded-xl px-3 py-2 ${i === active ? 'bg-teal-50' : ''}`}>
                          <span className="block truncate text-sm font-semibold text-slate-900">{h.label}</span>
                          {h.sub && <span className="block truncate text-xs text-slate-600">{h.sub}</span>}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                {loading && <li role="presentation" className="px-3 py-2 text-xs text-slate-500">Still loading…</li>}
              </ul>
            )}
        </div>
      )}
    </div>
  )
}
