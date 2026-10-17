// Staff pay split into groups, so each assigner sees only the pay they run.
// Bo, Oct 13 2026: two assigners, "one for boys refs and one for girls refs ...
// they can only view their own ... they also don't need access to the
// scorekeeper's pay", with the option to give one person everything "in case
// it's all one person managing everybody".
//
// Pure: no database or server imports, so API routes, roleScope and client pages
// all sort pay the same way. The assigner's chosen groups are read on the server
// by lib/payScope.

import { gameGender, type GameGender } from './gameGender'

export type PayGroup = 'boys' | 'girls' | 'scorekeepers' | 'ops'

export const PAY_GROUPS: { value: PayGroup; label: string; hint: string }[] = [
  { value: 'boys',         label: 'Boys refs',            hint: "Refs on boys' games" },
  { value: 'girls',        label: 'Girls refs',           hint: "Refs on girls' games" },
  { value: 'scorekeepers', label: 'Scorekeepers',         hint: 'Scorekeeper slots' },
  { value: 'ops',          label: 'Field ops & trainers', hint: 'Hourly staff' },
]

export const ALL_PAY_GROUPS: PayGroup[] = PAY_GROUPS.map(g => g.value)

/** An assigner nobody has set up yet: refs, boys and girls, and no scorekeepers or
 *  hourly staff. Narrower than before Oct 13, when an assigner saw everyone's pay. */
export const DEFAULT_ASSIGNER_GROUPS: PayGroup[] = ['boys', 'girls']

/** Which pay a viewer sees. `all` = every group (admin, director, or an assigner
 *  given all four), which also unlocks the event-wide pay totals. */
export interface PayScope { all: boolean; groups: PayGroup[] }
export const FULL_PAY_SCOPE: PayScope = { all: true, groups: [...ALL_PAY_GROUPS] }
export const NO_PAY_SCOPE: PayScope = { all: false, groups: [] }

/** Known groups only, in display order, no repeats. */
export function cleanPayGroups(v: unknown): PayGroup[] {
  const arr = Array.isArray(v) ? v.map(String) : []
  return ALL_PAY_GROUPS.filter(g => arr.includes(g))
}

export function payScopeOf(groups: unknown): PayScope {
  const g = cleanPayGroups(groups)
  return { all: g.length === ALL_PAY_GROUPS.length, groups: g }
}

export function payGroupsLabel(groups: PayGroup[]): string {
  const g = cleanPayGroups(groups)
  if (!g.length) return 'No staff pay'
  if (g.length === ALL_PAY_GROUPS.length) return 'All staff pay'
  return PAY_GROUPS.filter(x => g.includes(x.value)).map(x => x.label).join(', ')
}

// A ref's own "Can ref" setting: boys, girls, or both.
function refGroups(gender?: string | null): PayGroup[] {
  return gender === 'boys' ? ['boys'] : gender === 'girls' ? ['girls'] : ['boys', 'girls']
}

/** The group(s) one game slot's pay belongs to. A ref slot follows the game's
 *  division, or the event's side when the division says neither (lib/eventTeams);
 *  a game that is still neither follows the ref's own setting, so a coed game counts
 *  for both assigners only when the ref does both. */
export function assignmentPayGroups(role: string, division: string, workerGender?: string | null, side: GameGender = 'both'): PayGroup[] {
  if (role === 'scorekeeper') return ['scorekeepers']
  if (/^ref/.test(role || '')) {
    const g = gameGender(division, side)
    return g === 'both' ? refGroups(workerGender) : [g]
  }
  return ['ops']
}

/** Hourly time (Time Entries) by the person's main job: field ops and trainers,
 *  unless they are a scorekeeper or ref by default. */
export function timeEntryPayGroups(w: { defaultRole?: string | null; gender?: string | null } | null | undefined): PayGroup[] {
  if (w?.defaultRole === 'scorekeeper') return ['scorekeepers']
  if (w?.defaultRole === 'ref') return refGroups(w.gender)
  return ['ops']
}

/** Every group a staff member can be paid in, from their roles. Decides who sees
 *  the rate and payout details on their staff record. */
export function workerPayGroups(w: { roles?: string | null; defaultRole?: string | null; gender?: string | null } | null | undefined): PayGroup[] {
  if (!w) return []
  let roles: string[] = []
  try { const r = JSON.parse(w.roles || '[]'); if (Array.isArray(r)) roles = r.map(String) } catch { /* bad JSON: fall back */ }
  if (!roles.length && w.defaultRole) roles = [w.defaultRole]
  const out = new Set<PayGroup>()
  for (const r of roles) {
    if (r === 'ref') refGroups(w.gender).forEach(g => out.add(g))
    else if (r === 'scorekeeper') out.add('scorekeepers')
    else out.add('ops')
  }
  if (!out.size) out.add('ops')
  return ALL_PAY_GROUPS.filter(g => out.has(g))
}

/** The viewer sees pay that touches any of these groups. */
export function seesPay(scope: PayScope | null | undefined, groups: PayGroup[]): boolean {
  if (!scope) return true
  return scope.all || groups.some(g => scope.groups.includes(g))
}

/** Hours on one time entry: manual hours win, else clock out minus clock in. */
export function entryHours(e: { clockIn: string | null; clockOut: string | null; hoursManual: number | null }): number {
  if (e.hoursManual != null) return e.hoursManual
  if (e.clockIn && e.clockOut) {
    const [ih, im] = e.clockIn.split(':').map(Number), [oh, om] = e.clockOut.split(':').map(Number)
    return Math.max(0, (oh * 60 + om - (ih * 60 + im)) / 60)
  }
  return 0
}
