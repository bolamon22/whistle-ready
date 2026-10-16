'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSession, signOut } from 'next-auth/react'
import { ChevronDown, ListChecks, Menu, Moon, Sun, X } from 'lucide-react'
import { useRole } from '@/lib/role-context'
import { useOrg } from '@/lib/org-context'
import { isStaffThemeRoute } from './ThemeShell'
import { roleCanAccess } from '@/lib/routeAccess'
import WhoIsOn from '@/components/WhoIsOn'
import { canSeePresence } from '@/lib/presenceTime'
import NavMenus from '@/components/nav/NavMenus'
import EventSwitcher from '@/components/nav/EventSwitcher'
import GlobalSearch from '@/components/nav/GlobalSearch'
import AccountMenu, { Avatar } from '@/components/nav/AccountMenu'
import { ViewAsBanner, ViewAsChip, ViewAsRow } from '@/components/nav/ViewAsMenu'
import { OrgBrand, OrgSheetList, useMyOrgs } from '@/components/nav/OrgSwitcher'
import { type NavEvent, currentEvent, currentMenu, roleTitle, todayYmd, visibleMenus } from '@/components/nav/navConfig'
import { isLegalPath } from '@/lib/legalRoutes'

// The app header (redesigned Oct 13 2026; Bo: "we are due for a little bit of a
// redesign now that we've added a lot of stuff to it"). Left to right: logo, the
// event you're working on (a switcher), four menus (Events, People, Organization,
// Admin) holding only the links this role can open, then search (Ctrl K), Tasks
// with the overdue count, who's on, View as, and the account menu. Below 1280px
// the menus fold into one phone menu. A login that works in more than one
// organization (lib/orgMembers) gets the organization switcher on the logo. An
// admin's View as (an organization and a role, components/nav/ViewAsMenu) puts an
// amber bar on top while it's on.

const SHEET_LINK = 'flex min-h-[44px] items-center justify-between gap-3 px-1 text-[15px] font-medium text-slate-900 hover:text-teal-700'

export default function NavBar() {
  const pathname = usePathname() || ''
  const [tournaments, setTournaments] = useState<NavEvent[]>([])
  const [previewOrgId, setPreviewOrgId] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)       // which desktop menu is open
  const [sheet, setSheet] = useState(false)                    // phone menu
  const [sheetEvent, setSheetEvent] = useState(false)          // event list inside it
  const [sheetGroup, setSheetGroup] = useState<string | null>(null)
  const [dark, setDark] = useState(false)                      // mirrors <ThemeShell>'s preference
  const [today, setToday] = useState('')
  const org = useOrg()
  const { data: session } = useSession()
  const { effectiveRole, isPreview, planOff } = useRole()
  const myOrgs = useMyOrgs()

  const realRole = session?.user?.role ?? 'staff'
  const role = effectiveRole
  const isAdmin = realRole === 'admin'
  const hasOrg = !!org?.id
  const signedIn = !!session

  useEffect(() => {
    function fetchTournaments() {
      const previewOrg = document.cookie.match(/(?:^|; )preview-org=([^;]*)/)
      const orgId = previewOrg ? decodeURIComponent(previewOrg[1]) : null
      setPreviewOrgId(orgId)
      const url = isAdmin && orgId
        ? `/api/tournaments?viewOrgId=${encodeURIComponent(orgId)}`
        : '/api/tournaments'
      fetch(url)
        .then(r => r.json())
        .then((data: NavEvent[]) => { if (Array.isArray(data)) setTournaments(data) })
        .catch(() => {})
    }

    if (!signedIn) return
    fetchTournaments()
    window.addEventListener('preview-org-changed', fetchTournaments)
    return () => window.removeEventListener('preview-org-changed', fetchTournaments)
  }, [isAdmin, signedIn])

  // Today's date on this device, set after the first render so the server's
  // clock never decides "On now" / "in 3 days".
  useEffect(() => { setToday(todayYmd()) }, [pathname])

  // Close menus whenever the page changes.
  useEffect(() => { setOpen(null); setSheet(false); setSheetEvent(false) }, [pathname])

  // A click outside the open menu, or Escape, closes it.
  useEffect(() => {
    if (!open && !sheet) return
    const onDown = (e: MouseEvent) => {
      if (!open) return
      const pop = (e.target as Element | null)?.closest?.('[data-nav-pop]')
      if (!pop || pop.getAttribute('data-nav-pop') !== open) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (open) {
        const trigger = document.querySelector<HTMLElement>(`[data-nav-pop="${open}"] > button`)
        setOpen(null)
        trigger?.focus()
      }
      setSheet(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, sheet])

  // Light/Dark lives in <ThemeShell> (localStorage + body class); the account
  // menu flips the same key and both sides sync over a 'gd-theme' window event.
  useEffect(() => {
    try { setDark(localStorage.getItem('gd-staff-theme') === 'dark') } catch {}
    const onTheme = (e: Event) => setDark(!!(e as CustomEvent).detail?.dark)
    window.addEventListener('gd-theme', onTheme)
    return () => window.removeEventListener('gd-theme', onTheme)
  }, [])

  // Overdue tasks, as a red count on Tasks. Overdue only: a badge that also
  // counted "due this week" was always lit. Reloaded when a task changes, when
  // the admin switches org, and on page changes at most once a minute (a new
  // day makes more tasks overdue).
  const canTasks = !!session && roleCanAccess(role, '/tasks', planOff)
  const [overdue, setOverdue] = useState(0)
  const tasksAt = useRef(0)
  const loadOverdue = useCallback(() => {
    tasksAt.current = Date.now()
    fetch('/api/tasks/overview?counts=1')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.counts) setOverdue(Number(d.counts.overdue) || 0) })
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (!canTasks) { setOverdue(0); return }
    loadOverdue()
    window.addEventListener('tasks-changed', loadOverdue)
    window.addEventListener('preview-org-changed', loadOverdue)
    return () => {
      window.removeEventListener('tasks-changed', loadOverdue)
      window.removeEventListener('preview-org-changed', loadOverdue)
    }
  }, [canTasks, loadOverdue])
  useEffect(() => {
    if (canTasks && Date.now() - tasksAt.current > 60000) loadOverdue()
  }, [pathname, canTasks, loadOverdue])

  // A staff login that also directs a club (a field director who runs his own
  // club, Oct 13 2026) reaches the club portal from the account menu. Asked once,
  // the first time a menu opens; club directors, coaches and parents already
  // land on their portal.
  const [clubPortal, setClubPortal] = useState(false)
  const clubsAsked = useRef(false)
  useEffect(() => {
    if (clubsAsked.current || !signedIn || !(open === 'account' || sheet)) return
    if (['club_director', 'coach', 'parent'].includes(realRole)) return
    clubsAsked.current = true
    fetch('/api/club-director/links').then(r => r.ok ? r.json() : null)
      .then(d => setClubPortal(Array.isArray(d?.links) && d.links.length > 0)).catch(() => {})
  }, [open, sheet, signedIn, realRole])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    try { localStorage.setItem('gd-staff-theme', next ? 'dark' : 'light') } catch {}
    window.dispatchEvent(new CustomEvent('gd-theme', { detail: { dark: next } }))
  }

  // The public org website (/o/) has its own header.
  if (pathname.startsWith('/o/')) return null
  // Public pay-by-link pages present as the tournament org (Sunshine Events Group), not Whistle Ready.
  if (pathname.startsWith('/pay')) return null
  // The public marketing landing, the /find look-up and the privacy and terms
  // pages have their own header.
  // Signed-out visitors on these pages get the page's own header (LandingNav,
  // or the org's lockup on the org's own domain) -- this nav would be a second
  // one, and on sunshineeventsgroup.com the two named different companies.
  if (!session && (pathname === '/' || pathname === '/find' || pathname === '/guides' || pathname.startsWith('/guides/') || isLegalPath(pathname))) return null

  const menus = session ? visibleMenus(role, planOff) : []
  const current = currentMenu(menus, pathname)
  const canEvents = !!session && roleCanAccess(role, '/', planOff)
  const event = canEvents && today ? currentEvent(tournaments, pathname, today) : null
  const canCreate = role === 'admin' || role === 'director'
  const showTheme = isStaffThemeRoute(pathname)
  const showAlerts = !['coach', 'parent', 'club_director'].includes(role)
  // The director is the Head Assigner in an organization on the Assigner plan (lib/orgPlans).
  const roleLabel = roleTitle(role, org?.plan)
  const taskLabel = overdue > 0 ? `Tasks, ${overdue} overdue` : 'Tasks'

  const brand = myOrgs.orgs.length > 1 ? (
    <OrgBrand org={org} orgs={myOrgs.orgs} active={myOrgs.active} open={open === 'org'} setOpen={o => setOpen(o ? 'org' : null)} />
  ) : hasOrg ? (
    <a href="/" aria-label={`${org.name} home`} className="flex min-w-0 flex-1 items-center gap-2.5 xl:flex-none xl:flex-shrink-0">
      {org.logoUrl
        ? <img src={org.logoUrl} alt="" className="h-9 w-9 flex-shrink-0 rounded-[10px] border border-slate-200 bg-white object-contain p-[3px]" />
        : <span aria-hidden className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-slate-700 text-sm font-bold text-white">{org.name?.charAt(0) ?? '?'}</span>}
      <span className="min-w-0 truncate text-[15px] font-extrabold tracking-tight text-slate-900 xl:hidden min-[1400px]:block min-[1400px]:max-w-[220px]">{org.name}</span>
    </a>
  ) : (
    <a href="/" aria-label="Whistle Ready home" className="flex min-w-0 flex-1 items-center gap-2 xl:flex-none xl:flex-shrink-0">
      <img src="/whistle-ready-icon.png" alt="" className="h-9 w-9 flex-shrink-0 rounded-[10px] object-contain" />
      <span className="truncate text-[15px] font-extrabold tracking-tight text-slate-900 xl:hidden min-[1400px]:block">Whistle Ready</span>
    </a>
  )

  return (
    <div data-app-chrome className="sticky top-0 z-40">
      {/* View as: what's on, Switch view, Back to admin */}
      {isAdmin && <ViewAsBanner open={open === 'viewas-bar'} setOpen={o => setOpen(o ? 'viewas-bar' : null)} />}

      <header className="relative flex h-[60px] items-center gap-2 border-b border-slate-200 bg-white px-3 xl:h-16 xl:gap-3 xl:px-5">
        {brand}

        {event && (
          <>
            <span aria-hidden className="hidden h-6 w-px flex-shrink-0 bg-slate-200 xl:block" />
            <div className="hidden flex-shrink-0 xl:block">
              <EventSwitcher events={tournaments} current={event} role={role} planOff={planOff} today={today} canCreate={canCreate}
                open={open === 'event'} setOpen={o => setOpen(o ? 'event' : null)} variant="pill" />
            </div>
          </>
        )}

        <NavMenus menus={menus} open={open} setOpen={setOpen} current={current} overdue={overdue} />
        {session && menus.length === 0 && (
          <a href="/" className="hidden h-9 items-center rounded-full px-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 xl:flex">Home</a>
        )}

        <div className="hidden flex-1 xl:block" />

        {canEvents && (
          <div className="hidden min-w-[180px] max-w-[300px] shrink basis-[300px] xl:block">
            <GlobalSearch role={role} planOff={planOff} menus={menus} events={tournaments} previewOrgId={isAdmin ? previewOrgId : null} hotkey />
          </div>
        )}

        {canTasks && (
          <Link href="/tasks" aria-label={taskLabel} title={taskLabel}
            className="relative flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:border-slate-300 xl:h-10 xl:w-10">
            <ListChecks size={18} aria-hidden />
            {overdue > 0 && (
              <span aria-hidden className="absolute -right-1 -top-1 h-[18px] min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-[18px] text-white">{overdue}</span>
            )}
          </Link>
        )}

        {session ? (
          <>
            {canSeePresence(role) && <div className="hidden flex-shrink-0 xl:block"><WhoIsOn /></div>}
            {isAdmin && <ViewAsChip open={open === 'viewas'} setOpen={o => setOpen(o ? 'viewas' : null)} />}
            <div className="hidden flex-shrink-0 xl:block">
              <AccountMenu name={session.user?.name} image={session.user?.image} role={role} plan={org?.plan} isAdmin={isAdmin}
                isPreview={isPreview} open={open === 'account'} setOpen={o => setOpen(o ? 'account' : null)}
                showAlerts={showAlerts} showTheme={showTheme} dark={dark} toggleTheme={toggleTheme} poweredBy={hasOrg} clubPortal={clubPortal} />
            </div>

            {/* Below 1280px (phones and tablets) one menu holds everything */}
            <button type="button" onClick={() => { setSheet(s => !s); setOpen(null) }}
              aria-label={sheet ? 'Close menu' : 'Open menu'} aria-expanded={sheet}
              className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-900 xl:hidden">
              {sheet ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>
          </>
        ) : (
          <div className="ml-auto flex flex-shrink-0 items-center gap-2">
            <Link href="/login" className="rounded-full px-3 py-2 text-sm font-semibold text-slate-700 hover:text-teal-700">Sign in</Link>
            {/* "Create account", not "Register": on an event page "Register" read as
                registering a team, and refs used it to sign up to officiate. It made
                them Parent logins (Oct 14 2026); /register now asks who it's for. */}
            <Link href="/register" className="rounded-full bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800 whitespace-nowrap">Create account</Link>
          </div>
        )}
      </header>

      {/* Phone and tablet menu */}
      {sheet && session && (
        <div className="xl:hidden">
          <div className="absolute inset-x-0 top-full h-screen bg-black/30" onClick={() => setSheet(false)} aria-hidden />
          <nav aria-label="Menu" className="absolute inset-x-0 top-full max-h-[calc(100dvh-60px)] overflow-y-auto border-b border-slate-200 bg-white px-4 pb-5 pt-3 shadow-lg">
            <div className="mx-auto flex max-w-xl flex-col gap-1.5">
              <OrgSheetList orgs={myOrgs.orgs} active={myOrgs.active} onDone={() => setSheet(false)} />
              {canEvents && (
                <GlobalSearch role={role} planOff={planOff} menus={menus} events={tournaments} previewOrgId={isAdmin ? previewOrgId : null} variant="sheet" onDone={() => setSheet(false)} />
              )}
              {event && (
                <EventSwitcher events={tournaments} current={event} role={role} planOff={planOff} today={today} canCreate={canCreate}
                  open={sheetEvent} setOpen={setSheetEvent} variant="card" />
              )}

              {menus.length === 0 && <a href="/" className={SHEET_LINK}>Home</a>}
              {menus.map(m => {
                const folded = m.key === 'org' || m.key === 'admin'
                if (folded) {
                  const isOpen = sheetGroup === m.key
                  const names = m.items.map(i => i.label)
                  const summary = names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
                  return (
                    <div key={m.key} className="border-t border-slate-200 pt-1">
                      <button type="button" aria-expanded={isOpen} onClick={() => setSheetGroup(isOpen ? null : m.key)}
                        className="flex min-h-[48px] w-full items-center justify-between gap-3 px-1 text-left">
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[15px] font-semibold text-slate-900">{m.label}</span>
                          <span className="truncate text-xs text-slate-600">{summary}</span>
                        </span>
                        <ChevronDown size={18} aria-hidden className={`flex-shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="pb-1 pl-3">
                          {m.items.map(i => <Link key={i.href} href={i.href} onClick={() => setSheet(false)} className={SHEET_LINK}>{i.label}</Link>)}
                        </div>
                      )}
                    </div>
                  )
                }
                return (
                  <div key={m.key}>
                    <p className="px-1 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{m.label}</p>
                    {m.items.map(i => (
                      <Link key={i.href} href={i.href} onClick={() => setSheet(false)} className={SHEET_LINK}>
                        {i.label}
                        {i.badge === 'overdue' && overdue > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">{overdue} overdue</span>}
                      </Link>
                    ))}
                  </div>
                )
              })}

              <div className="mt-1 border-t border-slate-200 pt-2">
                <div className="flex min-h-[48px] items-center justify-between gap-3 px-1">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={session.user?.name} image={session.user?.image} size="h-8 w-8 text-[11px]" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-bold text-slate-900">{session.user?.name}</span>
                      <span className="text-xs text-slate-600">{isPreview ? `Previewing as ${roleLabel}` : roleLabel} · <Link href="/profile" onClick={() => setSheet(false)} className="font-semibold text-teal-700 underline-offset-2 hover:underline">Profile</Link></span>
                    </span>
                  </span>
                  {canSeePresence(role) && <WhoIsOn />}
                </div>
                {showAlerts && <Link href="/dashboard/alerts" onClick={() => setSheet(false)} className={SHEET_LINK}>Game-day alerts</Link>}
                {clubPortal && <Link href="/dashboard/club-director" onClick={() => setSheet(false)} className={SHEET_LINK}>Club portal</Link>}
                {isAdmin && <div className="-mx-2"><ViewAsRow idPrefix="va-sheet" /></div>}
                <div className="flex gap-2.5 pt-2">
                  {showTheme && (
                    <button type="button" onClick={toggleTheme}
                      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-900">
                      {dark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
                      {dark ? 'Light mode' : 'Dark mode'}
                    </button>
                  )}
                  <button type="button" onClick={() => signOut({ callbackUrl: '/login' })}
                    className="h-11 flex-1 rounded-full border border-red-200 bg-white text-sm font-semibold text-red-700">
                    Sign out
                  </button>
                </div>
                {hasOrg && <p className="px-1 pt-3 text-[11px] text-slate-500">Powered by Whistle Ready</p>}
              </div>
            </div>
          </nav>
        </div>
      )}
    </div>
  )
}
