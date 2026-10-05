import { prisma } from '@/lib/db'
import { nameKey } from '@/lib/names'

// Pool.teamNames is a list of NAMES, with no foreign key to RegisteredTeam.
// That leaves it able to outlive the teams it names, and only one write path
// ever cleaned it up: deleting a team from the Divisions page. Removing a team
// on the Registrations page -- or soft-deleting the whole registration -- left
// its name sitting in the pool.
//
// Nothing surfaced it. The Divisions page draws its pool columns from the
// RegisteredTeam rows (teams.filter(t => t.pool === pool.name)), so a name with
// no team behind it is invisible there: staff cannot see it, drag it out, or
// delete it. The public standings used to be built from the games, so it did
// nothing there either -- until the standings started reading the roster, at
// which point a team deleted weeks ago reappeared publicly with no way to
// remove it.
//
// So: prune on the write paths, and filter on the read path as well, because
// the rows that are already stale have no other way to heal.

/** Loose keys of every team still registered, per division. */
async function registeredKeys(tournamentId: string): Promise<Map<string, Set<string>>> {
  const teams = await prisma.registeredTeam.findMany({
    where: { registration: { tournamentId, deletedAt: null } },
    select: { division: true, teamName: true },
  })
  const byDiv = new Map<string, Set<string>>()
  for (const t of teams) {
    const d = nameKey(t.division)
    if (!byDiv.has(d)) byDiv.set(d, new Set())
    byDiv.get(d)!.add(nameKey(t.teamName))
  }
  return byDiv
}

/**
 * The names in `names` that are still registered in `division`.
 *
 * A division with NO registered teams keeps its list untouched: tournaments run
 * in CSV-import mode have pools and games but never a RegisteredTeam row, and
 * filtering those against an empty set would silently empty every pool.
 */
export function keepRegistered(names: string[], division: string, byDiv: Map<string, Set<string>>): string[] {
  const live = byDiv.get(nameKey(division))
  if (!live || live.size === 0) return names
  return names.filter(n => live.has(nameKey(n)))
}

/**
 * Drop pool entries whose team is no longer registered. Safe to call on any
 * write that removes teams; it only ever writes a pool it actually changed.
 * Returns the number of names removed.
 */
export async function pruneOrphanPoolNames(tournamentId: string): Promise<number> {
  try {
    const [pools, byDiv] = await Promise.all([
      prisma.pool.findMany({ where: { tournamentId } }),
      registeredKeys(tournamentId),
    ])
    let removed = 0
    for (const p of pools) {
      let names: string[] = []
      try {
        const parsed = JSON.parse(p.teamNames || '[]')
        if (!Array.isArray(parsed)) continue
        names = parsed.filter((n: unknown) => typeof n === 'string')
      } catch { continue }
      const kept = keepRegistered(names, p.division, byDiv)
      if (kept.length !== names.length) {
        removed += names.length - kept.length
        await prisma.pool.update({ where: { id: p.id }, data: { teamNames: JSON.stringify(kept) } })
      }
    }
    return removed
  } catch {
    // Pool table not migrated, or the DB is unhappy: never fail the caller's
    // delete over pool bookkeeping.
    return 0
  }
}

export { registeredKeys }

// Waitlisted teams can sit in a pool (Bo, Oct 5 2026): he drags one in on the
// Divisions page to build a practice schedule around it, and nothing about it
// may reach the public -- not the pool list, the standings or its games --
// until Registrations takes it off the waiting list. Staff see everything.
// The flag is the only switch: clearing it makes the team and its games appear
// with nothing else to redo.

/** Loose keys of every waitlisted team, per division. */
export async function waitlistedKeys(tournamentId: string): Promise<Map<string, Set<string>>> {
  const teams = await prisma.registeredTeam.findMany({
    where: { registration: { tournamentId, deletedAt: null }, waitlisted: true },
    select: { division: true, teamName: true },
  })
  const byDiv = new Map<string, Set<string>>()
  for (const t of teams) {
    const d = nameKey(t.division)
    if (!byDiv.has(d)) byDiv.set(d, new Set())
    byDiv.get(d)!.add(nameKey(t.teamName))
  }
  return byDiv
}

/** `names` without the division's waitlisted teams (for anything outsiders see). */
export function dropWaitlisted(names: string[], division: string, wl: Map<string, Set<string>> | null | undefined): string[] {
  const set = wl?.get(nameKey(division))
  if (!set || set.size === 0) return names
  return names.filter(n => !set.has(nameKey(n)))
}

/** True when either side of the game is a waitlisted team in its division. */
export function involvesWaitlisted(g: { division?: string | null; team1?: string | null; team2?: string | null }, wl: Map<string, Set<string>> | null | undefined): boolean {
  const set = wl?.get(nameKey(g.division ?? ''))
  if (!set || set.size === 0) return false
  return set.has(nameKey(g.team1 ?? '')) || set.has(nameKey(g.team2 ?? ''))
}
