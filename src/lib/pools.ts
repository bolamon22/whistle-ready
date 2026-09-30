import { prisma } from '@/lib/db'
import { poolKey, samePool } from '@/lib/poolNames'

// The rename cascade. The pure name helpers live in lib/poolNames so client
// components can use them without importing Prisma; they are re-exported here so
// server callers still have one import.
export * from '@/lib/poolNames'

export type PoolRenameCounts = { games: number }

/**
 * Move every reference to a pool name within one division.
 *
 * Scoped to the division on purpose: "Pool A" exists in most of them, and renaming
 * Boys High School A's Pool A must not touch the Girls U14 games.
 *
 * Matches games on poolKey rather than an exact string, because the scheduler and
 * the Divisions page have historically disagreed about the "Pool " prefix -- an
 * equality match would miss every game stored as the bare letter. Never throws: a
 * rename that half-succeeds is worse reported than crashed, so the caller gets the
 * count of what actually moved.
 */
export async function renamePoolRefs(
  tournamentId: string, division: string, oldName: string, newName: string,
): Promise<PoolRenameCounts> {
  const n: PoolRenameCounts = { games: 0 }
  if (!tournamentId || !division || !oldName || !newName) return n
  if (poolKey(oldName) === poolKey(newName) && oldName === newName) return n

  try {
    const games = await prisma.game.findMany({
      where: { tournamentId, division },
      select: { id: true, pool: true },
    })
    const ids = games.filter(g => g.pool && samePool(g.pool, oldName)).map(g => g.id)
    if (ids.length) {
      const r = await prisma.game.updateMany({ where: { id: { in: ids } }, data: { pool: newName } })
      n.games = r.count
    }
  } catch { /* the pool row still renamed; the caller reports 0 games moved */ }

  return n
}
