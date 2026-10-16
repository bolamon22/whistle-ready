'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'
import { BellRing, ChevronDown, LogOut, Shield, UserRound } from 'lucide-react'
import { ROLE_COLORS, roleTitle } from './navConfig'
import { ViewAsRow } from './ViewAsMenu'

// The avatar menu at the right of the header (Bo, Oct 13 2026): your name and
// role, Profile, Game-day alerts, Light/Dark, View as (admins: an organization and
// a role, components/nav/ViewAsMenu) and Sign out.
// These used to be separate controls in the bar itself. Club portal is there for a
// staff login that also directs a club (a field director with a club of his own).

export function initials(name?: string | null): string {
  return (name || '').split(/\s+/).filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'
}

export function Avatar({ name, image, size = 'h-9 w-9 text-xs' }: { name?: string | null; image?: string | null; size?: string }) {
  return image
    ? <img src={image} alt="" className={`${size} flex-shrink-0 rounded-full border border-slate-200 object-cover`} />
    : <span aria-hidden className={`${size} flex flex-shrink-0 items-center justify-center rounded-full bg-teal-100 font-extrabold text-teal-700`}>{initials(name)}</span>
}

const ROW = 'flex min-h-[40px] items-center gap-2.5 rounded-xl px-3 text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none'
const ITEM = `${ROW} font-medium text-slate-900`

export default function AccountMenu({ name, image, role, plan, isAdmin, isPreview, open, setOpen, showAlerts, showTheme, dark, toggleTheme, poweredBy, clubPortal = false }: {
  name?: string | null
  image?: string | null
  role: string
  plan?: string | null        // the organization's plan: names its director (roleTitle)
  isAdmin: boolean            // the signed-in person is an admin (View as)
  isPreview: boolean
  open: boolean
  setOpen: (o: boolean) => void
  showAlerts: boolean
  showTheme: boolean
  dark: boolean
  toggleTheme: () => void
  poweredBy: boolean
  clubPortal?: boolean        // this login can open a club's portal (lib/clubAccess)
}) {
  const label = roleTitle(role, plan)
  return (
    <div className="relative flex-shrink-0" data-nav-pop="account">
      <button type="button" aria-label="Your account" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-full p-0.5 text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">
        <Avatar name={name} image={image} />
        <ChevronDown size={14} aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[288px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <Avatar name={name} image={image} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{name}</p>
              <span data-role-badge className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${isPreview ? 'bg-amber-100 text-amber-800' : ROLE_COLORS[role] ?? 'bg-slate-100 text-slate-600'}`}>
                {isPreview ? `Previewing as ${label}` : label}
              </span>
            </div>
          </div>
          <div className="mx-1 my-1 h-px bg-slate-200" />
          <Link href="/profile" onClick={() => setOpen(false)} className={ITEM}><UserRound size={16} aria-hidden className="text-slate-500" />Profile</Link>
          {showAlerts && <Link href="/dashboard/alerts" onClick={() => setOpen(false)} className={ITEM}><BellRing size={16} aria-hidden className="text-slate-500" />Game-day alerts</Link>}
          {clubPortal && <Link href="/dashboard/club-director" onClick={() => setOpen(false)} className={ITEM}><Shield size={16} aria-hidden className="text-slate-500" />Club portal</Link>}
          {showTheme && (
            <div className="flex min-h-[44px] items-center justify-between gap-3 px-3">
              <span className="text-sm font-medium text-slate-900">Appearance</span>
              <div role="group" aria-label="Appearance" className="flex rounded-full border border-slate-200 p-0.5">
                {(['Light', 'Dark'] as const).map(m => {
                  const on = (m === 'Dark') === dark
                  return (
                    <button key={m} type="button" aria-pressed={on} onClick={() => { if (!on) toggleTheme() }}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? 'bg-teal-700 text-white' : 'text-slate-600 hover:text-slate-900'}`}>{m}</button>
                  )
                })}
              </div>
            </div>
          )}
          {isAdmin && <ViewAsRow idPrefix="va-account" />}
          <div className="mx-1 my-1 h-px bg-slate-200" />
          <button type="button" onClick={() => signOut({ callbackUrl: '/login' })} className={`${ROW} w-full font-semibold text-red-700`}>
            <LogOut size={16} aria-hidden />Sign out
          </button>
          {poweredBy && <p className="px-3 pb-1 pt-1.5 text-[11px] text-slate-500">Powered by Whistle Ready</p>}
        </div>
      )}
    </div>
  )
}
