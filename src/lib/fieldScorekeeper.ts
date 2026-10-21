import { prisma } from '@/lib/db'
import { getPayRate, parsePayRates } from '@/lib/utils'
import { spotOf, type OfficialChange } from '@/lib/officialChangeAlerts'

// SCOREKEEPERS BELONG TO FIELDS, NOT GAMES (Bo, Oct 21 2026: "Even when we move
// games, just leave the same scorekeeper wherever they're supposed to be. They're
// assigned to fields, not games.")
//
// A game used to carry its scorekeeper when it moved, so moving a Field 5 game to
// Field 1 put Field 5's scorekeeper on Field 1 at a time she is also at her own
// table, and left the game that came in its place with nobody. Now a move to
// another day or field hands the game to that field's scorekeeper for that day --
// whoever keeps score on that field's other games that day -- and the game's old
// scorekeeper stays behind on their own field. A field with no scorekeeper that day
// leaves the game open. A move to another time on the same field changes nothing.
//
// Returns the changes for lib/officialChangeAlerts (who is off, who is on). Never
// throws: a failed hand-off must not fail the move that caused it.

type GameLike = { id: string; tournamentId: string; date: string; startTime: string; location: string; gameNumber: string; division: string; team1: string; team2: string; isCanceled?: boolean | null }

/** The scorekeeper on most of this field's other games that day, or null. */
export async function fieldScorekeeperFor(tournamentId: string, date: string, location: string, exceptGameId: string): Promise<string | null> {
  if (!date || !location) return null
  const rows = await prisma.assignment.findMany({
    where: { role: 'scorekeeper', game: { tournamentId, date, location, id: { not: exceptGameId }, isCanceled: false } },
    select: { workerId: true },
  })
  const n = new Map<string, number>()
  for (const r of rows) n.set(r.workerId, (n.get(r.workerId) || 0) + 1)
  let best: string | null = null, most = 0
  n.forEach((c, w) => { if (c > most) { most = c; best = w } })
  return best
}

export async function keepScorekeeperOnField(
  before: GameLike & { assignments: { workerId: string; role: string }[] },
  after: GameLike,
): Promise<{ handled: boolean; changes: OfficialChange[] }> {
  try {
    const moved = before.date !== after.date || before.location !== after.location
    if (!moved || !after.date || !after.location) return { handled: false, changes: [] }
    const current = before.assignments.find(a => a.role === 'scorekeeper')?.workerId || null
    let target = await fieldScorekeeperFor(after.tournamentId, after.date, after.location, after.id)
    // Never into two places at once: a field scorekeeper already working another
    // field at that time stays put. Their own field at that time doesn't count: that
    // is the other half of a swap the Scheduler is still saving (A onto B's cell,
    // then B onto A's), and B's move takes them off it a moment later.
    if (target && after.startTime) {
      const busy = await prisma.assignment.findFirst({
        where: { workerId: target, game: { tournamentId: after.tournamentId, date: after.date, startTime: after.startTime, id: { not: after.id }, location: { not: after.location } } },
        select: { id: true },
      })
      if (busy) target = null
    }
    if (target === current) return { handled: true, changes: [] }
    const spot = spotOf(after as any)
    const changes: OfficialChange[] = []
    if (current) {
      await prisma.assignment.deleteMany({ where: { gameId: after.id, role: 'scorekeeper' } })
      changes.push({ kind: 'removed', workerId: current, role: 'scorekeeper', spot: spotOf(before as any) })
    }
    if (target) {
      const [worker, t] = await Promise.all([
        prisma.worker.findUnique({ where: { id: target }, select: { payRateOverride: true, certLevel: true } }),
        prisma.tournament.findUnique({ where: { id: after.tournamentId }, select: { payRates: true } }),
      ])
      const payRate = worker?.payRateOverride ?? getPayRate(worker?.certLevel as any, 'scorekeeper', parsePayRates(t?.payRates as any))
      await prisma.assignment.upsert({
        where: { gameId_role: { gameId: after.id, role: 'scorekeeper' } },
        create: { gameId: after.id, workerId: target, role: 'scorekeeper', payRate },
        update: { workerId: target, payRate },
      })
      changes.push({ kind: 'added', workerId: target, role: 'scorekeeper', spot })
    }
    return { handled: true, changes }
  } catch (e) {
    console.error('[fieldScorekeeper]', e)
    return { handled: false, changes: [] }
  }
}
