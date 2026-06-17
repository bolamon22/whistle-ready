'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { ClipboardList, Globe, MapPin, ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  id: string
  name: string
  logoUrl?: string
  stats?: { games: number; assigned: number; pct: number }
}

interface TournamentMeta {
  sport: string
  startDate: string
  endDate: string
  location: string
  dates: string
  logoUrl: string
}

type NavItem = { href: string; label: string }
type NavGroup = { label: string; href?: string; items?: NavItem[] }

function fmtDate(d: string) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${parseInt(m)}/${parseInt(day)}/${y.slice(2)}`
}

export default function TournamentNav({ id, name, logoUrl, stats }: Props) {
  const pathname = usePathname()
  const base = `/tournaments/${id}`
  const [meta, setMeta] = useState<TournamentMeta | null>(null)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => { try { setCollapsed(localStorage.getItem('gdNavCollapsed') === '1') } catch {} }, [])
  function toggleCollapsed() { setCollapsed(c => { const n = !c; try { localStorage.setItem('gdNavCollapsed', n ? '1' : '0') } catch {} ; return n }) }

  useEffect(() => {
    fetch(`/api/tournaments/${id}`)
      .then(r => r.json())
      .then(d => setMeta(d))
      .catch(() => {})
  }, [id])

  // Close any open menu on route change or outside click.
  useEffect(() => { setOpenMenu(null) }, [pathname])
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const groups: NavGroup[] = [
    { label: 'Dashboard', href: `${base}/dashboard` },
    { label: 'Setup', items: [
      { href: `${base}/builder`,    label: 'Tournament setup' },
      { href: `${base}/divisions`,  label: 'Divisions & teams' },
      { href: `${base}/scheduler`,  label: 'Scheduler' },
      { href: `${base}`,            label: 'Assigner' },
      { href: `${base}/checklist`,  label: 'Checklist' },
    ]},
    { label: 'People', items: [
      { href: `${base}/registrations`,        label: 'Team registrations' },
      { href: `${base}/player-registrations`, label: 'Player rosters' },
      { href: `${base}/player-waivers`,       label: 'Player Waiver' },
      { href: `${base}/vendor-requests`,      label: 'Vendor Requests' },
      { href: `${base}/roster`,               label: 'Staff roster' },
    ]},
    { label: 'Game Day', items: [
      { href: `${base}/scores`,         label: 'Post scores' },
      { href: `${base}/assignments`,    label: 'Assignments' },
      { href: `${base}/communications`, label: 'Communications' },
    ]},
    { label: 'Financials', href: `${base}/financials` },
    { label: 'Settings',   href: `${base}/settings` },
  ]

  const hrefActive = (href: string) => href === base ? pathname === base : pathname.startsWith(href)
  const groupActive = (g: NavGroup) => g.href ? hrefActive(g.href) : !!g.items?.some(i => hrefActive(i.href))

  // Countdown
  const countdown = (() => {
    if (!meta?.startDate) return null
    const today = new Date(); today.setHours(0,0,0,0)
    const start = new Date(meta.startDate); start.setHours(0,0,0,0)
    const end   = meta.endDate ? new Date(meta.endDate) : start; end.setHours(0,0,0,0)
    const diff  = Math.round((start.getTime() - today.getTime()) / 86400000)
    if (today >= start && today <= end) return { label: 'In Progress', color: 'bg-emerald-500/20 text-emerald-300' }
    if (diff === 0)  return { label: 'Today!',         color: 'bg-emerald-500/20 text-emerald-300' }
    if (diff === 1)  return { label: 'Tomorrow',       color: 'bg-amber-500/20 text-amber-300' }
    if (diff > 1)    return { label: `${diff} days away`, color: 'bg-sky-500/20 text-sky-300' }
    if (diff === -1) return { label: 'Yesterday',      color: 'bg-slate-500/20 text-slate-400' }
    return { label: `${Math.abs(diff)} days ago`,      color: 'bg-slate-500/20 text-slate-400' }
  })()

  const logo    = meta?.logoUrl || logoUrl
  const dateStr = meta?.startDate
    ? (meta.endDate && meta.endDate !== meta.startDate
        ? `${fmtDate(meta.startDate)} – ${fmtDate(meta.endDate)}`
        : fmtDate(meta.startDate))
    : (() => { try { return JSON.parse(meta?.dates || '[]').map(fmtDate).join(' · ') } catch { return '' } })()

  const tabBase = 'px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex items-center gap-1'
  const tabOn = 'border-teal-400 text-teal-300'
  const tabOff = 'border-transparent text-slate-400 hover:text-white hover:border-white/20'

  return (
    <div className="bg-[#0f1f3d] mb-6 rounded-xl" ref={navRef}>
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-0">

        {/* Header row */}
        {!collapsed && (
        <div className="flex items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-3 min-w-0">

            {/* Logo */}
            <Link href={`${base}/dashboard`} className="flex-shrink-0">
              {logo
                ? <img src={logo} alt="logo" className="h-11 w-11 sm:h-12 sm:w-12 object-contain rounded-xl border border-white/10 bg-white/5 hover:border-white/30 transition-colors" />
                : <div className="h-11 w-11 sm:h-12 sm:w-12 rounded-xl border border-white/10 bg-white/5 flex-shrink-0" />
              }
            </Link>

            <div className="min-w-0">
              <div className="text-[10px] text-slate-500 mb-0.5">
                <Link href="/" className="hover:text-teal-400 transition-colors">Tournaments</Link>
                <span className="mx-1 opacity-40">/</span>
              </div>
              <Link href={`${base}/dashboard`}
                className="text-base sm:text-lg font-bold text-white leading-tight hover:text-teal-300 transition-colors block truncate">
                {name}
              </Link>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {meta?.sport && (
                  <span className="text-[10px] bg-teal-500/20 text-teal-300 px-1.5 py-0.5 rounded-full font-medium">{meta.sport}</span>
                )}
                {countdown && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${countdown.color}`}>{countdown.label}</span>
                )}
                {dateStr && <span className="text-[10px] text-slate-400">{dateStr}</span>}
                {meta?.location && <span className="text-[10px] text-slate-500 hidden sm:flex items-center gap-1 truncate max-w-[200px]"><MapPin size={11} className="flex-shrink-0" />{meta.location}</span>}
                {stats && (
                  <>
                    <span className="text-slate-600 text-[10px]">·</span>
                    <span className="text-[10px] text-sky-400">{stats.assigned}/{stats.games} assigned</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 flex-shrink-0">
            <Link href={`${base}/register`}
              className="text-xs text-white border border-white/15 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5">
              <ClipboardList size={14} /> Register
            </Link>
            <Link href={`${base}/public`} target="_blank"
              className="text-xs text-slate-300 hover:text-white border border-white/15 hover:border-white/30 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1.5">
              <Globe size={14} /> Public
            </Link>
          </div>
        </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-0 flex-wrap items-center">
          {collapsed && (
            <Link href={`${base}/dashboard`} className="flex items-center gap-2 mr-3 py-2 min-w-0">
              {logo && <img src={logo} alt="" className="h-7 w-7 object-contain rounded-lg border border-white/10 bg-white/5 flex-shrink-0" />}
              <span className="text-xs font-semibold text-white truncate max-w-[160px]">{name}</span>
            </Link>
          )}
          {groups.map(g =>
            g.items ? (
              <div key={g.label} className="relative">
                <button
                  onClick={() => setOpenMenu(m => m === g.label ? null : g.label)}
                  className={`${tabBase} ${groupActive(g) ? tabOn : tabOff}`}>
                  {g.label}
                  <ChevronDown size={13} className={`opacity-60 transition-transform ${openMenu === g.label ? 'rotate-180' : ''}`} />
                </button>
                {openMenu === g.label && (
                  <div className="absolute top-full left-0 z-50 py-1 bg-[#162844] border border-white/10 rounded-b-lg shadow-xl min-w-[180px]">
                    {g.items.map(item => (
                      <Link key={item.href} href={item.href}
                        className={`block px-4 py-2 text-xs font-medium transition-colors ${
                          hrefActive(item.href) ? 'text-teal-300 bg-white/10' : 'text-slate-300 hover:text-white hover:bg-white/5'
                        }`}>
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link key={g.label} href={g.href!}
                className={`${tabBase} ${groupActive(g) ? tabOn : tabOff}`}>
                {g.label}
              </Link>
            )
          )}
          <button onClick={toggleCollapsed} title={collapsed ? 'Expand header' : 'Minimize header'}
            className="ml-auto px-3 py-3 text-slate-400 hover:text-white transition-colors flex items-center">
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
