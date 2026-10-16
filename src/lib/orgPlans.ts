// What each organization pays for (Bo, Oct 16 2026: an assigner who wants the app
// "to assign just referees ... they wouldn't have access to every other feature but
// they could also pay their refs and do everything that's associated with referees
// and scorekeepers", and "we would also want be able to turn feature on or off if
// they want to be like a tournament director").
//
// Two plans:
//   Whistle Ready Tournament  everything (Sunshine Events Group and every organization
//                             that had no plan before this).
//   Whistle Ready Assigner    officials only: events and their games, the Assigner
//                             board, Staff Pool, availability, roster, confirmations,
//                             time entries and staff pay.
// On top of the plan, the admin can switch each group below on or off for one
// organization (Admin → Organizations → the org → Plan). A group that is off is off
// for everyone in that organization, whatever their role: its pages leave the menus
// and middleware turns them away, the same way a role without the page is.
//
// Officials are never a switch: they are what both plans are for.
//
// The organization's choice is AppSetting `orgPlan:<orgId>` (lib/orgPlanStore, server
// only); the groups that are off ride in the login token as `planOff` (lib/auth), so
// middleware and the menus can check a page without asking the database. This file
// has no database import, so client components can use it.

export type PlanKey = 'tournament' | 'assigner'
export type GroupKey = 'registration' | 'scheduling' | 'scores' | 'gameday' | 'money' | 'tasks' | 'website'

export type FeatureGroup = {
  key: GroupKey
  label: string
  desc: string
  /** Features in role-permissions.json this group owns: every page of these features. */
  features: string[]
  /** Pages this group owns that sit under a feature it doesn't own. */
  routes?: string[]
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  { key: 'registration', label: 'Registration', desc: 'Team and player registration, waivers, travel and hotels, media and vendors, the club database',
    features: ['tournament_registrations', 'tournament_player_regs', 'tournament_people', 'tournament_vendors'], routes: ['/dashboard/org/clubs'] },
  { key: 'scheduling', label: 'Event setup & scheduling', desc: 'Event dashboard, divisions and teams, the scheduler, tournament setup and the event page',
    features: ['tournament_setup', 'tournament_dashboard'] },
  { key: 'scores', label: 'Scores', desc: 'Posting scores and live scorekeeping',
    features: ['tournament_scores', 'game_scorekeeper'] },
  { key: 'gameday', label: 'Game-day tools', desc: 'Communications, ops, incidents, checklists, directory, emergency plan, score tables and awards',
    features: ['staff_gameday'] },
  { key: 'money', label: 'Event money', desc: 'Event financials: team fees, invoices, income and expenses',
    features: ['tournament_financials'] },
  { key: 'tasks', label: 'Tasks', desc: 'Task lists and event contacts',
    features: ['tasks'] },
  { key: 'website', label: 'Website & media', desc: 'Public website, forms, social scheduler, brand and media, rules library, photographers',
    features: ['social_scheduler'], routes: ['/dashboard/org/site', '/dashboard/org/forms', '/dashboard/org/assets', '/dashboard/org/rules', '/dashboard/org/photographers'] },
]
export const GROUP_KEYS = FEATURE_GROUPS.map(g => g.key)

export type Plan = { key: PlanKey; label: string; short: string; desc: string; on: GroupKey[] }
export const PLANS: Record<PlanKey, Plan> = {
  tournament: { key: 'tournament', label: 'Whistle Ready Tournament', short: 'Tournament', desc: 'Everything: registration, scheduling, officials, scores, game day, money and the website.', on: [...GROUP_KEYS] },
  assigner: { key: 'assigner', label: 'Whistle Ready Assigner', short: 'Assigner', desc: 'Officials only: events and games, the Assigner, Staff Pool, availability, confirmations and staff pay.', on: [] },
}
export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[]
export const isPlanKey = (v: unknown): v is PlanKey => typeof v === 'string' && v in PLANS

/** An organization's plan and its switches. `features` holds every group, true = on. */
export type OrgPlan = { plan: PlanKey; features: Record<GroupKey, boolean> }

/** The plan's own switches, before any change for one organization. */
export function planDefaults(plan: PlanKey): OrgPlan {
  const on = new Set(PLANS[plan].on)
  return { plan, features: Object.fromEntries(GROUP_KEYS.map(k => [k, on.has(k)])) as Record<GroupKey, boolean> }
}

/** Reads a saved value; anything missing or unknown falls back to the plan's defaults
 *  (and no plan at all is Tournament, so nothing changes for an organization nobody
 *  has set up). */
export function normalizePlan(v: unknown): OrgPlan {
  const o = (v && typeof v === 'object' ? v : {}) as { plan?: unknown; features?: unknown }
  const base = planDefaults(isPlanKey(o.plan) ? o.plan : 'tournament')
  const f = (o.features && typeof o.features === 'object' ? o.features : {}) as Record<string, unknown>
  for (const k of GROUP_KEYS) if (typeof f[k] === 'boolean') base.features[k] = f[k] as boolean
  return base
}

/** The groups that are off: what rides in the login token. */
export function offGroups(p: OrgPlan): GroupKey[] {
  return GROUP_KEYS.filter(k => !p.features[k])
}

/** True when the switches are not exactly the plan's own. */
export function isCustomized(p: OrgPlan): boolean {
  const d = planDefaults(p.plan)
  return GROUP_KEYS.some(k => d.features[k] !== p.features[k])
}

const routeRe = (route: string) => new RegExp('^' + route.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+').replace(/\/$/, '') + '(?=/|$)')
const GROUP_ROUTES = FEATURE_GROUPS.map(g => ({ key: g.key, features: new Set(g.features), routes: (g.routes || []).map(routeRe) }))

/** False when the page belongs to a group that is off. `feature` is the page's owner
 *  in role-permissions.json (lib/routeAccess works it out). */
export function planAllows(planOff: readonly string[] | null | undefined, pathname: string, feature: string | null): boolean {
  if (!planOff || !planOff.length) return true
  for (const g of GROUP_ROUTES) {
    if (!planOff.includes(g.key)) continue
    if (feature && g.features.has(feature)) return false
    if (g.routes.some(re => re.test(pathname))) return false
  }
  return true
}

/** Short summary for lists: "Assigner", "Assigner + Scores", "Tournament − Website". */
export function planSummary(p: OrgPlan): string {
  const d = planDefaults(p.plan)
  const label = (k: GroupKey) => FEATURE_GROUPS.find(g => g.key === k)!.label
  const added = GROUP_KEYS.filter(k => p.features[k] && !d.features[k]).map(label)
  const removed = GROUP_KEYS.filter(k => !p.features[k] && d.features[k]).map(label)
  return [PLANS[p.plan].short, ...added.map(a => `+ ${a}`), ...removed.map(r => `− ${r}`)].join(' ')
}
