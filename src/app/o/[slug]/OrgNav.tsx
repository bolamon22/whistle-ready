'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Menu, X } from 'lucide-react'

type NavLink = { title: string; href: string }
type NavItem = { type: 'link'; title: string; href: string } | { type: 'group'; label: string; children: NavLink[] }

// Interactive org nav: desktop links + tap/hover dropdowns, and a real
// hamburger menu on mobile (the old CSS-hover dropdown never opened on touch).
export default function OrgNav({ nav, registerHref }: { nav: NavItem[]; registerHref?: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<number | null>(null)
  const closeAll = () => { setMenuOpen(false); setOpenGroup(null) }

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-7 text-[13px] font-semibold uppercase tracking-wide text-slate-600 ml-auto mr-2">
        {nav.map((it, i) => it.type === 'link'
          ? <Link key={i} href={it.href} className="hover:text-teal-700 transition-colors">{it.title}</Link>
          : (
            <div key={i} className="relative" onMouseEnter={() => setOpenGroup(i)} onMouseLeave={() => setOpenGroup(null)}>
              <button type="button" onClick={() => setOpenGroup(openGroup === i ? null : i)} aria-expanded={openGroup === i} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-teal-700 transition-colors">
                {it.label} <ChevronDown size={13} className={openGroup === i ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {openGroup === i && (
                <div className="absolute left-0 top-full pt-3 z-50">
                  <div className="bg-white rounded-xl shadow-xl border border-slate-200 py-2 min-w-[200px]">
                    {it.children.map((c, j) => <Link key={j} href={c.href} onClick={() => setOpenGroup(null)} className="block px-4 py-2 text-slate-600 normal-case tracking-normal text-sm hover:bg-slate-50 hover:text-teal-700">{c.title}</Link>)}
                  </div>
                </div>
              )}
            </div>
          ))}
      </nav>

      {/* Desktop register */}
      {registerHref && <Link href={registerHref} className="hidden md:inline-flex text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-full transition-colors flex-shrink-0 shadow-sm">Register</Link>}

      {/* Mobile hamburger */}
      <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label="Menu" aria-expanded={menuOpen} className="md:hidden ml-auto -mr-1 p-2 text-slate-700 hover:text-teal-700">
        {menuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Mobile menu panel */}
      {menuOpen && (
        <>
          <div className="md:hidden fixed inset-0 top-16 z-40 bg-black/20" onClick={closeAll} />
          <div className="md:hidden absolute left-0 right-0 top-full z-50 bg-white border-t border-slate-200 shadow-lg max-h-[calc(100vh-4rem)] overflow-y-auto">
            <nav className="px-4 py-3 flex flex-col">
              {nav.map((it, i) => it.type === 'link'
                ? <Link key={i} href={it.href} onClick={closeAll} className="py-3 border-b border-slate-100 text-slate-800 font-semibold">{it.title}</Link>
                : (
                  <div key={i} className="py-2 border-b border-slate-100">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 pt-1 pb-1">{it.label}</p>
                    {it.children.map((c, j) => <Link key={j} href={c.href} onClick={closeAll} className="block py-2 text-slate-700">{c.title}</Link>)}
                  </div>
                ))}
              {registerHref && <Link href={registerHref} onClick={closeAll} className="mt-3 text-center text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-full">Register</Link>}
            </nav>
          </div>
        </>
      )}
    </>
  )
}
