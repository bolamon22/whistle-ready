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
