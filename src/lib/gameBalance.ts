// Who is short of games.
//
// A pool game is a PAIRING, so removing one team takes a game away from every
// opponent it was drawn against. In a full round robin that is harmless -- each
// team loses exactly the one game against the team that left, and they all stay
// level. In a partial schedule (the normal case: 8 teams, 4 games each) only
// the handful of teams actually drawn against it lose one, and those teams turn
// up on game day a game short of what their club paid for.
//
// That asymmetry IS the detector, and it needs no configuration: within a pool,
// teams should all play the same number of games. Anyone below the pool's usual
// count is short, and by how much. A guarantee, when the organizer has set one,
// is a second check on top -- a pool can be perfectly level and still under it.

export interface BalanceTeam { team: string; games: number; short: number }
export interface BalanceFinding {
  division: string
  pool: string
  /** What most teams in this pool play. */
  expected: number
  /** Teams below `expected`, worst first. */
  shortTeams: BalanceTeam[]
  /** True when even `expected` is under the organizer's guarantee. */
  belowGuarantee: boolean
}

export interface BalanceGame {
  division: string
  pool?: string | null
  team1: string
  team2: string
  isCanceled?: boolean
  isChampionship?: boolean
}

/** Bracket slots ("Seed 3", "W-B2", "TBD") are positions, not teams. */
const PLACEHOLDER = /^(seed\s|w-b|l-b|bracket\b|winner\b|loser\b|tbd$)/i
export const isPlaceholder = (n: string) => !n || !n.trim() || PLACEHOLDER.test(n.trim())

const poolKey = (p: string | null | undefined) => String(p || '').trim().replace(/^(pool|group)\s*/i, '').toLowerCase()

/** What the pool was built to give everyone: the most any one team plays.
 *
 *  NOT the most common count. Drop one team from an 8-team, 4-game pool and it
 *  takes a game from each of its 4 opponents, leaving 4 teams on 3 games and 3
 *  teams on 4 -- so the commonest count becomes the SHORT one, and a detector
 *  built on it reports that everything is fine in exactly the case it exists
 *  for. The maximum has no such blind spot, and it stays honest the other way
 *  too: if one team somehow has an extra game, the rest really are behind it. */
function expectedGames(counts: number[]): number {
  return counts.reduce((m, c) => (c > m ? c : m), 0)
}

/**
 * Pools whose teams do not all play the same number of games.
 *
 * `guarantee` is the organizer's games-per-team promise (0 to skip the check).
 * Pool play only: bracket games are seeded by finish, so an uneven count there
 * is the format working as intended.
 */
export function findShortTeams(games: BalanceGame[], guarantee = 0): BalanceFinding[] {
  const groups = new Map<string, { division: string; pool: string; counts: Map<string, number> }>()

  for (const g of games) {
    if (g.isCanceled || g.isChampionship) continue
    if (!g.division) continue
    const key = `${g.division}\u0000${poolKey(g.pool)}`
    if (!groups.has(key)) groups.set(key, { division: g.division, pool: String(g.pool || ''), counts: new Map() })
    const grp = groups.get(key)!
    for (const name of [g.team1, g.team2]) {
      if (isPlaceholder(name)) continue
      grp.counts.set(name.trim(), (grp.counts.get(name.trim()) || 0) + 1)
    }
  }

  const out: BalanceFinding[] = []
  for (const grp of groups.values()) {
    if (grp.counts.size < 2) continue
    const expected = expectedGames([...grp.counts.values()])
    const shortTeams: BalanceTeam[] = []
    for (const [team, n] of grp.counts) {
      if (n < expected) shortTeams.push({ team, games: n, short: expected - n })
    }
    const belowGuarantee = guarantee > 0 && expected < guarantee
    if (!shortTeams.length && !belowGuarantee) continue
    shortTeams.sort((a, b) => b.short - a.short || a.team.localeCompare(b.team))
    out.push({ division: grp.division, pool: grp.pool, expected, shortTeams, belowGuarantee })
  }

  return out.sort((a, b) => a.division.localeCompare(b.division) || a.pool.localeCompare(b.pool))
}

/** One line an organizer can act on, e.g.
 *  "Riverwolves and Jump play 3 games; the rest of Pool A play 4." */
export function describeFinding(f: BalanceFinding): string {
  const names = f.shortTeams.map(t => t.team)
  const rest = f.pool ? `the rest of ${/^(pool|group)\b/i.test(f.pool) ? f.pool : `Pool ${f.pool}`}` : 'the rest of the division'
  if (!names.length) return `Every team plays ${f.expected} games, under the ${'guarantee'}.`
  const list = names.length === 1 ? names[0]
    : names.length === 2 ? `${names[0]} and ${names[1]}`
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const plays = f.shortTeams[0].games
  const same = f.shortTeams.every(t => t.games === plays)
  return same
    ? `${list} ${names.length === 1 ? 'plays' : 'play'} ${plays} game${plays === 1 ? '' : 's'}; ${rest} play ${f.expected}.`
    : `${list} ${names.length === 1 ? 'is' : 'are'} short of the ${f.expected} games ${rest} play.`
}
