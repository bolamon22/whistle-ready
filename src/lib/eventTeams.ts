// What kind of teams an event has (Bo, Oct 17 2026: "When the assigner is setting up
// the tournament, we should ask if it's boys, men's, girls or women's teams"). Asked
// on New Tournament and Edit, any that apply. When they are all one side, a game
// whose division name says neither boys nor girls is that side's game
// (lib/gameGender): the Assigner board's Boys/Girls filter, Auto-assign, Clear
// assignments, the boys' and girls' refs pay groups, Notify officials and what staff
// see all follow it. Men's games are boys' rules and women's are girls', the same
// split the officials have.
//
// Pure: no database import, so client pages use it too. Stored by
// lib/eventTeamsStore (AppSetting `eventTeams:{tournamentId}`).

import type { GameGender } from './gameGender'

export type TeamKind = 'boys' | 'mens' | 'girls' | 'womens'

export const TEAM_KINDS: { value: TeamKind; label: string }[] = [
  { value: 'boys', label: 'Boys' },
  { value: 'mens', label: 'Men’s' },
  { value: 'girls', label: 'Girls' },
  { value: 'womens', label: 'Women’s' },
]

/** Known kinds only, in display order, no repeats. */
export function cleanTeams(v: unknown): TeamKind[] {
  const arr = Array.isArray(v) ? v.map(String) : []
  return TEAM_KINDS.map(k => k.value).filter(k => arr.includes(k))
}

/** The side a division that says neither belongs to: boys or girls when every kind
 *  picked is that side, else both (nothing picked, or both sides). */
export function teamsSide(teams: unknown): GameGender {
  const t = cleanTeams(teams)
  const boys = t.includes('boys') || t.includes('mens')
  const girls = t.includes('girls') || t.includes('womens')
  return boys && !girls ? 'boys' : girls && !boys ? 'girls' : 'both'
}

/** "Boys, Girls" for a badge; empty when nothing is picked. */
export function teamsLabel(teams: unknown): string {
  const t = cleanTeams(teams)
  return TEAM_KINDS.filter(k => t.includes(k.value)).map(k => k.label).join(', ')
}

/** Who may set them: the people who set up events. */
export const SETS_TEAMS = ['admin', 'director', 'scheduler']
