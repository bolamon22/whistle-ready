'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ChevronDown, Menu, X, UserRound } from 'lucide-react'
import { roleHome } from '@/lib/roleHome'

type NavLink = { title: string; href: string }
type NavItem = { type: 'link'; title: string; href: string } | { type: 'group'; label: string; children: NavLink[] }

// Interactive org nav: desktop links + tap/hover dropdowns, and a real
// hamburger menu on mobile (the old CSS-hover dropdown never opened on touch).
export default function OrgNav({ nav, registerHref }: { nav: NavItem[]; registerHref?: string }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [openGroup, setOpenGroup] = useState<number | null>(null)
  const closeAll = () => { setMenuOpen(false); setOpenGroup(null) }
  // One sign-in for every role, on the org's own site: a club director who
  // couldn't find their portal link had nowhere to start from here. Signed in,
  // the same spot reads "My account" and goes to that role's home. While the
  // session loads it reads "Log in", which is right for most visitors.
  const sess = useSession()
  const signedIn = sess?.status === 'authenticated'
  const accountHref = signedIn ? roleHome((sess?.data?.user as { role?: string } | undefined)?.role, true) : '/login'
  const accountLabel = signedIn ? 'My account' : 'Log in'

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex items-center gap-5 lg:gap-7 whitespace-nowrap text-[13px] font-semibold uppercase tracking-wide text-slate-600 ml-auto mr-2">
        {nav.map((it, i) => it.type === 'link'
          ? <Link key={i} href={it.href} className="hover:text-teal-700 transition-colors">{it.title}</Link>
          : (
            <div key={i} className="relative" onMouseEnter={() => setOpenGroup(i)} onMouseLeave={() => setOpenGroup(null)}>
              <button type="button" onClick={() => setOpenGroup(openGroup === i ? null : i)} aria-expanded={openGroup === i} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-teal-700 transition-colors">
                {it.label} <ChevronDown size={13} className={openGroup === i ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {openGroup === i && (
                <div className="absolute left-0 top-full pt-3 z-50">
                  <div className="bg-white rounded-xl shadow-xl border border-slate-200 py-2 min-w-[200px] whitespace-normal">
                    {it.children.map((c, j) => <Link key={j} href={c.href} onClick={() => setOpenGroup(null)} className="block px-4 py-2 text-slate-600 normal-case tracking-normal text-sm hover:bg-slate-50 hover:text-teal-700">{c.title}</Link>)}
                  </div>
                </div>
              )}
            </div>
          ))}
      </nav>

      {/* Desktop sign-in. Icon only on tablet widths, where the words squeezed
          the org name down to two letters. */}
      <Link href={accountHref} aria-label={accountLabel} title={accountLabel} className="hidden md:inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-teal-700 border border-slate-300 hover:border-teal-400 p-2.5 lg:px-4 rounded-full transition-colors flex-shrink-0">
        <UserRound size={15} /><span className="hidden lg:inline">{accountLabel}</span>
      </Link>

      {/* Desktop register */}
      {registerHref && <Link href={registerHref} className="hidden md:inline-flex text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-full transition-colors flex-shrink-0 shadow-sm">Register</Link>}

      {/* Mobile sign-in: an icon here so a long org name still fits; the menu has it in words */}
      <Link href={accountHref} aria-label={accountLabel} title={accountLabel} className="md:hidden ml-auto p-2 text-slate-700 hover:text-teal-700 flex-shrink-0">
        <UserRound size={22} />
      </Link>

      {/* Mobile hamburger */}
      <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label="Menu" aria-expanded={menuOpen} className="md:hidden -ml-2 -mr-1 p-2 text-slate-700 hover:text-teal-700">
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
              <Link href={accountHref} onClick={closeAll} className="mt-3 inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-700 border border-slate-300 px-5 py-3 rounded-full">
                <UserRound size={16} /> {accountLabel}
              </Link>
              {registerHref && <Link href={registerHref} onClick={closeAll} className="mt-2 text-center text-sm font-semibold bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-full">Register</Link>}
            </nav>
          </div>
        </>
      )}
    </>
  )
}
