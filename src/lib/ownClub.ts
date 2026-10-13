// YOUR OWN CLUB'S GAMES: SOMEONE ELSE POSTS THE SCORE
//
// Bo, Oct 13 2026, on Terry Crowley, who directs his club and works the same
// event as a field director: "We should actually just have someone else post the
// scores. He never posted them anyways. And then if we set the role up for someone
// else in the future, it will already be that way."
//
// So a login that can open a club's registration at an event (lib/clubAccess)
// doesn't post, change or clear the score of a game that club plays there, whatever
// its staff role. A game is the club's when either team is one of the club's
// registered team names (or the club's own name), compared loosely (lib/names
// nameKey), the way the club portal picks out the club's schedule. The admin and
// the tournament director run the whole event and still score every game.
//
// Every score write asks this: Post scores and the scorekeeper (PATCH
// /api/games/[id], POST live-scores) and the results import. The staff game lists
// mark these games `ownClub: true`, so the pages say who posts the score instead
// of showing a box that would only refuse.
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { nameKey } from '@/lib/names'
import { openableRegistrations } from '@/lib/clubAccess'

/** Roles that score every game, their own club's included. */
const SCORES_EVERY_GAME = ['admin', 'director']

export const OWN_CLUB_REFUSAL = 'Your club plays in this game, so someone else posts its score.'

/** The teams (nameKey) this login's clubs field at this event. Empty for the admin
 *  and the tournament director, and for a login with no club there. */
export async function ownClubTeams(role: string, userId: string, tournamentId: string | null | undefined): Promise<Set<string>> {
  const keys = new Set<string>()
  if (!userId || !tournamentId || SCORES_EVERY_GAME.includes(role)) return keys
  const regs = await openableRegistrations(userId, String(tournamentId))
  if (!regs.length) return keys
  for (const r of regs) keys.add(nameKey(r.clubName))
  const teams = await prisma.registeredTeam.findMany({ where: { registrationId: { in: regs.map(r => r.id) } }, select: { teamName: true } })
  for (const t of teams) keys.add(nameKey(t.teamName))
  keys.delete('')
  return keys
}

/** Does one of these teams play in this game? */
export function isOwnClubGame(teams: Set<string>, game: { team1?: unknown; team2?: unknown }): boolean {
  return teams.size > 0 && (teams.has(nameKey(game.team1)) || teams.has(nameKey(game.team2)))
}

/** The refusal to send back when this login's club is one of these teams, or null. */
export async function ownClubRefusal(gate: { role: string; userId: string }, tournamentId: string | null | undefined, teamNames: unknown[]): Promise<NextResponse | null> {
  if (SCORES_EVERY_GAME.includes(gate.role)) return null
  const mine = await ownClubTeams(gate.role, gate.userId, tournamentId)
  if (!teamNames.some(n => mine.has(nameKey(n)))) return null
  return NextResponse.json({ error: OWN_CLUB_REFUSAL, ownClub: true }, { status: 403 })
}
