import { gameGender } from './gameGender'

// WHEN OFFICIALS SEE THEIR GAMES (Bo, Oct 15 2026).
//
// Assigners build the officials' schedule in the background -- auto-assign, swaps,
// fixes -- and it is not ready to show until they say so. Before this, every saved
// assignment showed on the ref's staff home at once, so refs saw half-built
// schedules (Monster Mash, Oct 2026). Now each crew is hidden from staff logins
// until an assigner shows it on the Assigner page, or sends Notify officials for it.
//
// Three crews, because boys and girls officials have different assigners and are
// released separately; scorekeepers are their own crew. A coed game's officials
// belong to both sides, so either side releasing it shows it.
//
// No database import here: the Assigner page uses these too. The stored state is
// in lib/staffReleaseStore.

export const CREWS = ['boys', 'girls', 'scorekeepers'] as const
export type Crew = typeof CREWS[number]
export const CREW_LABEL: Record<Crew, string> = { boys: 'Boys officials', girls: 'Girls officials', scorekeepers: 'Scorekeepers' }

export type CrewRelease = { at: string; by: string } | null
export type ReleaseState = Record<Crew, CrewRelease>

export function isCrew(v: unknown): v is Crew { return (CREWS as readonly string[]).includes(String(v)) }

/** Which crews an assignment belongs to, from its slot and the game's division. */
export function crewsOf(role: string, division: string): Crew[] {
  if (role === 'scorekeeper') return ['scorekeepers']
  const g = gameGender(division)
  return g === 'both' ? ['boys', 'girls'] : [g]
}

export function isReleased(rel: ReleaseState, role: string, division: string): boolean {
  return crewsOf(role, division).some(c => !!rel[c])
}

// Logins that always see every assignment, shown or not: the people who build and
// run the schedule. Refs and scorekeepers log in as 'staff'.
export const SEES_UNRELEASED = ['admin', 'director', 'assigner', 'scheduler', 'field_director']
export const seesUnreleased = (role: unknown) => SEES_UNRELEASED.includes(String(role || ''))
