'use client'
import { Fragment, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { ArrowRight, ChevronDown, Menu, X, UserRound } from 'lucide-react'
import { roleHome } from '@/lib/roleHome'

type NavLink = { title: string; href: string }
type NavItem = { type: 'link'; title: string; href: string; id?: string } | { type: 'group'; label: string; children: NavLink[] }

/** One of the org's next events, shaped on the server (OrgHeader), so this file
 *  needs no date or database code. */
export type HeaderEvent = {
  id: string
  name: string
  href: string
  logoUrl: string
  /** Stand-in for a missing logo, in the color the home page's card gives it. */
  initials: string
  accent: string
  /** "Oct 24–25, 2026" */
  dates: string
  /** "Oct 24", for the phone row */
  day: string
  /** "Wellington, FL" */
  place: string
  registerHref?: string
  badge?: { label: string; cls: string } | null
}

/** The event's logo, or its initials when it has none. */
export function EventMark({ e, className = '' }: { e: HeaderEvent; className?: string }) {
  return e.logoUrl
    ? <img src={e.logoUrl} alt="" loading="lazy" decoding="async" className={`flex-none object-contain bg-white ${className}`} />
    : <span aria-hidden="true" className={`flex-none flex items-center justify-center font-bold text-white ${className}`} style={{ backgroundColor: e.accent }}>{e.initials}</span>
}

// The org's next events beside Tournaments, the way Whistle Ready's own bar shows
// them, so a family on one event's page sees the others and gets to them in one
// click (Bo, Oct 7 2026). Only from xl: narrower, the bar has no room, and
// OrgHeader shows the same events in a row under it instead. A logo means nothing
// to a family that hasn't been to the event, so hover (or keyboard focus) opens a
// card with the name, dates and Register. The event you're on has a teal ring.
function EventLogos({ events, currentId }: { events: HeaderEvent[]; currentId: string }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!events.length) return null
  return (
    <div role="list" aria-label="Upcoming events" className="hidden xl:flex items-center gap-2 -ml-4">
      {events.map(e => {
        const here = e.id === currentId
        const close = () => setOpen(o => (o === e.id ? null : o))
        return (
          <div key={e.id} role="listitem" className="relative"
            onMouseEnter={() => setOpen(e.id)} onMouseLeave={close}
            onFocus={() => setOpen(e.id)}
            onBlur={ev => { if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) close() }}
            onKeyDown={ev => { if (ev.key === 'Escape') close() }}>
            <Link href={e.href} prefetch={false} aria-label={`${e.name}, ${e.dates}`} aria-current={here ? 'true' : undefined}
              className={`block rounded-lg ${here ? 'ring-2 ring-teal-600 ring-offset-2' : ''}`}>
              <EventMark e={e} className={`w-8 h-8 rounded-lg border text-[11px] transition-colors ${here ? 'border-teal-600' : 'border-slate-200 hover:border-teal-400'}`} />
            </Link>
            {open === e.id && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 z-50">
                <div className="relative w-72 bg-white rounded-xl border border-slate-200 shadow-xl p-3.5 text-left normal-case tracking-normal font-normal whitespace-normal">
                  <span aria-hidden="true" className="absolute -top-1.5 left-1/2 -translate-x-1/2 rotate-45 w-3 h-3 bg-white border-l border-t border-slate-200" />
                  <div className="flex items-center gap-3">
                    <EventMark e={e} className="w-12 h-12 rounded-xl border border-slate-100 text-sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 leading-snug">{e.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{[e.dates, e.place].filter(Boolean).join(' · ')}</p>
                      {e.badge && <span className={`inline-block mt-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${e.badge.cls}`}>{e.badge.label}</span>}
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-4 text-sm font-semibold">
                    {e.registerHref && <Link href={e.registerHref} prefetch={false} className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-1.5 rounded-full transition-colors">Register</Link>}
                    <Link href={e.href} prefetch={false} className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900">Event details <ArrowRight size={14} /></Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Interactive org nav: desktop links + tap/hover dropdowns, and a real
// hamburger menu on mobile (the old CSS-hover dropdown never opened on touch).
export default function OrgNav({ nav, registerHref, events = [], currentId = '' }: { nav: NavItem[]; registerHref?: string; events?: HeaderEvent[]; currentId?: string }) {
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
          ? (
            <Fragment key={i}>
              <Link href={it.href} className="hover:text-teal-700 transition-colors">{it.title}</Link>
              {it.id === 'tournaments' && <EventLogos events={events} currentId={currentId} />}
            </Fragment>
          )
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
