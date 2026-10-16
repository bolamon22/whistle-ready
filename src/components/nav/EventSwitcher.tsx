'use client'

import Link from 'next/link'
import { Check, ChevronDown } from 'lucide-react'
import { type NavEvent, dateRange, eventHref, upcomingEvents, whenLabel } from './navConfig'

// The event button next to the logo: the event you're working on (the one whose
// pages you're on, else the next one) with its date, and a list to jump to another.
// Replaces the row of event logos the old bar had. 'pill' sits in the desktop bar;
// 'card' is the same thing at the top of the phone menu.

function Logo({ e, size }: { e: NavEvent; size: string }) {
  return e.logoUrl
    ? <img src={e.logoUrl} alt="" className={`${size} flex-shrink-0 rounded-lg border border-slate-200 bg-white object-contain`} />
    : <span className={`${size} flex flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600`}>{(e.name || '?').charAt(0)}</span>
}

export default function EventSwitcher({ events, current, role, planOff, today, canCreate, open, setOpen, variant }: {
  events: NavEvent[]
  current: NavEvent | null
  role: string
  planOff?: readonly string[] | null
  today: string
  canCreate: boolean
  open: boolean
  setOpen: (o: boolean) => void
  variant: 'pill' | 'card'
}) {
  if (!current) return null
  const when = whenLabel(current, today)
  const upcoming = upcomingEvents(events, today).slice(0, 5)
  const list = upcoming.length ? upcoming : [...events].sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''))).slice(0, 3)
  const listLabel = upcoming.length ? 'Upcoming' : 'Recent'

  const panel = (
    <div className={variant === 'pill'
      ? 'absolute left-0 top-full mt-2 z-50 w-[340px] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl'
      : 'mt-2 rounded-2xl border border-slate-200 bg-white p-2'}>
      <p className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{listLabel}</p>
      {list.map(e => (
        <Link key={e.id} href={eventHref(role, e.id, planOff)} onClick={() => setOpen(false)}
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 ${e.id === current.id ? 'bg-teal-50' : ''}`}>
          <Logo e={e} size="h-8 w-8" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold text-slate-900">{e.name}</span>
            <span className="truncate text-xs text-slate-600">{[dateRange(e), e.location].filter(Boolean).join(' · ')}</span>
          </span>
          {e.id === current.id && <Check size={16} aria-hidden className="flex-shrink-0 text-teal-700" />}
        </Link>
      ))}
      <div className="mx-1 my-1.5 h-px bg-slate-200" />
      <Link href="/" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">All tournaments</Link>
      {canCreate && <Link href="/?new=1" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-slate-50">+ New tournament</Link>}
    </div>
  )

  if (variant === 'card') {
    return (
      <div>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-teal-50 p-2 pr-3 text-left">
          <Logo e={current} size="h-10 w-10" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-bold text-slate-900">{current.name}</span>
            <span className="truncate text-xs text-slate-600">{[dateRange(current), when].filter(Boolean).join(' · ')}</span>
          </span>
          <span className="text-xs font-bold text-teal-700">{open ? 'Close' : 'Switch'}</span>
        </button>
        {open && panel}
      </div>
    )
  }

  return (
    <div className="relative flex-shrink-0" data-nav-pop="event">
      <button type="button" aria-expanded={open} aria-haspopup="true" aria-label={`Event: ${current.name}. Switch event`} onClick={() => setOpen(!open)}
        className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white py-0 pl-1 pr-3 text-left hover:border-slate-300">
        {current.logoUrl
          ? <img src={current.logoUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded-full border border-slate-200 bg-white object-contain" />
          : <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{current.name.charAt(0)}</span>}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="max-w-[180px] truncate text-[13px] font-bold text-slate-900">{current.name}</span>
          <span className="text-[11px] text-slate-600">{[dateRange(current), when].filter(Boolean).join(' · ')}</span>
        </span>
        <ChevronDown size={14} aria-hidden className={`flex-shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && panel}
    </div>
  )
}
