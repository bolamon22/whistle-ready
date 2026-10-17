'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import type { NavMenu, NavMenuKey } from './navConfig'

// The four header menus at desktop width (xl and up). A menu with one link is
// just that link, under the link's own name (a field director's Staff menu is only
// Training videos). Open state lives in NavBar so only one menu is open at a time,
// and a click outside, Escape or a page change closes it.
export default function NavMenus({ menus, open, setOpen, current, overdue }: {
  menus: NavMenu[]
  open: string | null
  setOpen: (k: string | null) => void
  current: NavMenuKey | null
  overdue: number
}) {
  if (menus.length === 0) return null
  return (
    <nav aria-label="Main" className="hidden xl:flex items-center gap-0.5 flex-shrink-0">
      {menus.map(m => {
        const isOpen = open === m.key, isCurrent = current === m.key
        const trigger = `relative flex items-center gap-1 h-9 px-3 rounded-full text-sm font-semibold transition-colors ${isOpen ? 'bg-teal-50 text-teal-700' : isCurrent ? 'text-teal-700 hover:bg-slate-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`
        const mark = isCurrent && !isOpen ? <span aria-hidden className="absolute left-3 right-3 -bottom-[14px] h-0.5 rounded-full bg-teal-600" /> : null
        if (m.items.length === 1) {
          return <Link key={m.key} href={m.items[0].href} className={trigger} aria-current={isCurrent ? 'page' : undefined}>{m.items[0].label}{mark}</Link>
        }
        return (
          <div key={m.key} className="relative" data-nav-pop={m.key}>
            <button type="button" aria-expanded={isOpen} aria-haspopup="true" onClick={() => setOpen(isOpen ? null : m.key)} className={trigger}>
              {m.label}
              <ChevronDown size={14} aria-hidden className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              {mark}
            </button>
            {isOpen && (
              <div className={`absolute left-0 top-full mt-2 z-50 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ${m.items.length > 5 ? 'w-[600px] grid grid-cols-2 gap-0.5' : 'w-[340px] flex flex-col'}`}>
                {m.note && <p className={`px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 ${m.items.length > 5 ? 'col-span-2' : ''}`}>{m.note}</p>}
                {m.items.map(i => {
                  const Icon = i.icon
                  return (
                    <Link key={i.href} href={i.href} onClick={() => setOpen(null)}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-slate-900 hover:bg-slate-50 focus:bg-slate-50 focus:outline-none">
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700"><Icon size={18} aria-hidden /></span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-semibold">{i.label}</span>
                        <span className="text-xs text-slate-600">{i.desc}</span>
                      </span>
                      {i.badge === 'overdue' && overdue > 0 && (
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">{overdue} overdue</span>
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}
