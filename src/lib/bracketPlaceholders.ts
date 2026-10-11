import { prisma } from '@/lib/db'

// A bracket game's schedulable row (Game, "B7") holds where its teams come from
// until they are known: "Seed 3", "W-B5", "L-B6". Those B numbers are the
// schedule's numbers, which for Flight B start after Flight A's games
// (Bracket.numberOffset). The rows used to be written with the flight's own
// numbering, so in a split division Flight B's "winner of its game 3" read
// "W-B3" -- Flight A's B3 -- on the Scheduler, the assigner and the public
// schedule, and the Scheduler's bracket timing checked the wrong game (Bo, Oct
// 11 2026: "It's saying B1 v Winner of B3, but it should be the B flight").

/** "seed:3" -> "Seed 3", "winner:3" -> "W-B<3 + offset>", "loser:3" -> "L-B<3 + offset>". */
export function bracketSrcLabel(src: string, offset = 0): string {
  if (src.startsWith('seed:')) return 'Seed ' + src.slice(5)
  if (src.startsWith('winner:')) return 'W-B' + (Number(src.slice(7)) + offset)
  if (src.startsWith('loser:')) return 'L-B' + (Number(src.slice(6)) + offset)
  return src
}

const PLACEHOLDER = /^(Seed \d+|[WL]-B\d+)$/i

/**
 * Put every bracket game's placeholder teams back in step with its bracket.
 * Only a slot still holding a placeholder is touched; a real team name typed in
 * is left alone. Writes nothing when everything already matches, so it is cheap
 * to run on each staff load of the games. Returns how many games changed.
 */
export async function syncBracketPlaceholders(tournamentId: string): Promise<number> {
  try {
    const brackets = await prisma.bracket.findMany({
      where: { tournamentId },
      select: { division: true, numberOffset: true, games: { select: { gameNumber: true, team1Source: true, team2Source: true } } },
    })
    if (!brackets.length) return 0
    const want = new Map<string, [string, string]>()
    for (const b of brackets) {
      const off = b.numberOffset ?? 0
      for (const g of b.games) want.set(`${b.division}|B${g.gameNumber + off}`, [bracketSrcLabel(g.team1Source || '', off), bracketSrcLabel(g.team2Source || '', off)])
    }
    const games = await prisma.game.findMany({
      where: { tournamentId, gameNumber: { startsWith: 'B' } },
      select: { id: true, division: true, gameNumber: true, team1: true, team2: true },
    })
    let changed = 0
    for (const g of games) {
      const w = want.get(`${g.division}|${g.gameNumber}`)
      if (!w) continue
      const data: { team1?: string; team2?: string } = {}
      if (PLACEHOLDER.test((g.team1 || '').trim()) && PLACEHOLDER.test(w[0]) && g.team1 !== w[0]) data.team1 = w[0]
      if (PLACEHOLDER.test((g.team2 || '').trim()) && PLACEHOLDER.test(w[1]) && g.team2 !== w[1]) data.team2 = w[1]
      if (data.team1 === undefined && data.team2 === undefined) continue
      await prisma.game.update({ where: { id: g.id }, data })
      changed++
    }
    return changed
  } catch { return 0 }
}
