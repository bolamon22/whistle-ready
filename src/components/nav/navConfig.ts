// The header's menus. Bo, Oct 13 2026: the top bar had grown to about ten links
// plus controls ("we are due for a little bit of a redesign"), so they are grouped
// into four menus. Each link shows only to roles that can open it (lib/routeAccess,
// the same rule middleware enforces), so nobody sees a link that leads to "not
// allowed", and a menu with nothing in it is left out.
//
// Staff, not People (Bo, Oct 17 2026): the event header has its own People menu
// (the teams, staff, media and vendors at that one event), and two menus with one
// name kept confusing people being shown around the app. This one is the
// organization's own staff, across every event. Logins, which only admins can
// open, sits in Admin, next to Organizations as on the admin pages' tabs.

import type { LucideIcon } from 'lucide-react'
import {
  Trophy, ListChecks, BookUser, Users, KeyRound, UserCog, GraduationCap, Globe, FileText, Megaphone,
  Building2, Image, Scale, Camera, LayoutGrid, Building, Shield, Map, CreditCard,
} from 'lucide-react'
import { roleCanAccess } from '@/lib/routeAccess'
import { ownerTitle } from '@/lib/orgPlans'

export type NavItem = {
  href: string; label: string; desc: string; icon: LucideIcon
  roles?: string[]          // only these roles, on top of the route check
  badge?: 'overdue'         // the overdue tasks count
}
export type NavMenuKey = 'events' | 'staff' | 'org' | 'admin'
export type NavMenu = { key: NavMenuKey; label: string; note?: string; items: NavItem[] }

export const NAV_MENUS: NavMenu[] = [
  { key: 'events', label: 'Events', items: [
    { href: '/', label: 'All tournaments', desc: 'Every event, upcoming and past', icon: Trophy },
    { href: '/tasks', label: 'Tasks', desc: 'Your checklist for each event', icon: ListChecks, badge: 'overdue' },
    { href: '/contacts', label: 'Event contacts', desc: 'Venues, vendors, rentals, city and county', icon: BookUser },
  ] },
  { key: 'staff', label: 'Staff', items: [
    { href: '/staff', label: 'Staff Pool', desc: 'Refs, scorekeepers, trainers and field ops', icon: Users },
    { href: '/dashboard/org', label: 'Your team', desc: 'Add people to your organization and set roles', icon: UserCog, roles: ['director'] },
    { href: '/dashboard/org/videos', label: 'Training videos', desc: 'Send videos to staff and see who watched', icon: GraduationCap, roles: ['admin', 'director'] },
    { href: '/dashboard/assigner/videos', label: 'Training videos', desc: 'Send videos to the officials you run', icon: GraduationCap, roles: ['assigner'] },
    { href: '/dashboard/field-director/videos', label: 'Training videos', desc: 'Send videos to your scorekeepers, trainers and field ops', icon: GraduationCap, roles: ['field_director'] },
  ] },
  { key: 'org', label: 'Organization', items: [
    { href: '/dashboard/org/site', label: 'Website', desc: 'Your public site and event pages', icon: Globe },
    { href: '/dashboard/org/forms', label: 'Forms', desc: 'Waivers, vendor requests, staff applications', icon: FileText },
    { href: '/dashboard/org/social', label: 'Social scheduler', desc: 'Instagram and Facebook posts', icon: Megaphone },
    { href: '/dashboard/org/clubs', label: 'Club database', desc: 'Returning teams and win-back invites', icon: Building2 },
    { href: '/dashboard/org/assets', label: 'Brand & media', desc: 'Logos, documents and maps', icon: Image },
    { href: '/dashboard/org/rules', label: 'Rules library', desc: 'Rule sets you reuse across events', icon: Scale },
    { href: '/dashboard/org/photographers', label: 'Photographers', desc: 'Who appears on Book photo & video', icon: Camera },
  ] },
  { key: 'admin', label: 'Admin', note: 'Only admins see this menu', items: [
    { href: '/admin', label: 'Platform dashboard', desc: 'Every organization at a glance', icon: LayoutGrid },
    { href: '/admin/orgs', label: 'Organizations', desc: 'Add or edit organizations', icon: Building },
    { href: '/admin/users', label: 'Logins', desc: 'Who can sign in and when they were last on', icon: KeyRound },
    { href: '/admin/permissions', label: 'Permissions', desc: 'What each role can open', icon: Shield },
    { href: '/admin/roadmap', label: 'Roadmap', desc: 'What gets built next', icon: Map },
    { href: '/admin/payment-providers', label: 'Payment providers', desc: 'How each organization takes payments', icon: CreditCard },
  ] },
]

/** The menus this role sees, each with only the links it can open (the
 *  organization's plan included: lib/orgPlans). */
export function visibleMenus(role: string, planOff?: readonly string[] | null): NavMenu[] {
  return NAV_MENUS
    .map(m => ({ ...m, items: m.items.filter(i => (!i.roles || i.roles.includes(role)) && roleCanAccess(role, i.href, planOff)) }))
    .filter(m => m.items.length > 0)
}

/** The menu holding the page you're on (marked in the bar), by its longest matching link. */
export function currentMenu(menus: NavMenu[], pathname: string): NavMenuKey | null {
  let best: { key: NavMenuKey; len: number } | null = null
  for (const m of menus) for (const i of m.items) {
    if (i.href === '/') continue
    if ((pathname === i.href || pathname.startsWith(i.href + '/')) && (!best || i.href.length > best.len)) best = { key: m.key, len: i.href.length }
  }
  return best?.key ?? null
}

// ── Events for the switcher ──
export type NavEvent = { id: string; name: string; logoUrl?: string | null; startDate?: string | null; endDate?: string | null; location?: string | null; slug?: string | null }

export function todayYmd(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const endOf = (e: NavEvent) => e.endDate || e.startDate || ''

/** Events still to come or on now, soonest first. */
export function upcomingEvents(list: NavEvent[], today: string): NavEvent[] {
  return list.filter(e => e.startDate && endOf(e) >= today).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))
}

/** The event the switcher shows: the one whose pages you're on, else the next one,
 *  else the most recent. */
export function currentEvent(list: NavEvent[], pathname: string, today: string): NavEvent | null {
  const m = /^\/tournaments\/([^/]+)/.exec(pathname || '')
  if (m) { const hit = list.find(e => e.id === m[1] || (!!e.slug && e.slug === m[1])); if (hit) return hit }
  const next = upcomingEvents(list, today)[0]
  if (next) return next
  return [...list].filter(e => e.startDate).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0] ?? list[0] ?? null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const parts = (ymd: string) => { const [y, mo, d] = ymd.split('-').map(Number); return { y, mo, d } }

/** "Oct 24–25", "Oct 31 – Nov 1", "Oct 24". */
export function dateRange(e: NavEvent): string {
  if (!e.startDate) return ''
  const s = parts(e.startDate), en = e.endDate ? parts(e.endDate) : s
  const sl = `${MONTHS[s.mo - 1]} ${s.d}`
  if (en.y === s.y && en.mo === s.mo) return en.d === s.d ? sl : `${sl}–${en.d}`
  return `${sl} – ${MONTHS[en.mo - 1]} ${en.d}`
}

/** "On now", "Tomorrow", "in 11 days", or nothing for a past event. */
export function whenLabel(e: NavEvent, today: string): string {
  if (!e.startDate) return ''
  if (e.startDate <= today && endOf(e) >= today) return 'On now'
  if (e.startDate < today) return ''
  const a = parts(today), b = parts(e.startDate)
  const days = Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / 86_400_000)
  return days === 1 ? 'Tomorrow' : `in ${days} days`
}

/** Where an event opens for this role: its dashboard, else the board, else the
 *  scheduler, else game day (a field director). */
export function eventHref(role: string, id: string, planOff?: readonly string[] | null): string {
  const base = `/tournaments/${id}`
  return [`${base}/dashboard`, base, `${base}/scheduler`, `${base}/communications`, `${base}/roster`].find(h => roleCanAccess(role, h, planOff)) ?? base
}

// ── Roles, for the account menu and View as ──
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', director: 'Tournament Director', club_director: 'Club Director', assigner: 'Assigner',
  scheduler: 'Scheduler', field_director: 'Field Director', coach: 'Coach', staff: 'Staff', parent: 'Parent',
}
export const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-100 text-red-700', director: 'bg-purple-100 text-purple-700', club_director: 'bg-violet-100 text-violet-700',
  assigner: 'bg-indigo-100 text-indigo-700', scheduler: 'bg-cyan-100 text-cyan-700', field_director: 'bg-orange-100 text-orange-700', coach: 'bg-blue-100 text-blue-700',
  staff: 'bg-teal-100 text-teal-700', parent: 'bg-pink-100 text-pink-700',
}
/** The roles an admin can preview the app as. */
export const VIEW_AS_ROLES = ['director', 'club_director', 'assigner', 'scheduler', 'field_director', 'coach', 'staff', 'parent']
/** A role's name in an organization on this plan (lib/orgPlans): the director is the
 *  Head Assigner on the Assigner plan, the Tournament Director otherwise. */
export function roleTitle(role: string, plan?: string | null): string {
  return role === 'director' ? ownerTitle(plan) : ROLE_LABELS[role] ?? role
}
