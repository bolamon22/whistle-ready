import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff, isStaffRequest } from '@/lib/apiAuth'
import { getPublicVisibility, applyPublicView } from '@/lib/publicView'
import { refsLookup } from '@/lib/refRules'

// GET – list existing pool games for this division
export async function GET(_req: NextRequest, { params }: { params: { id: string; division: string } }) {
  const division = decodeURIComponent(params.division)
  const scope = new URL(_req.url).searchParams.get('scope')
  // scope=bracket -> the division's bracket games (gameNumber B1, B2 ...); default -> pool games
  const where = scope === 'bracket'
    ? { tournamentId: params.id, division, gameNumber: { startsWith: 'B' } }
    : { tournamentId: params.id, division, pool: { not: null } }
  const games = await prisma.game.findMany({
    where,
    orderBy: [{ pool: 'asc' }, { gameNumber: 'asc' }],
  })
  if (await isStaffRequest()) return NextResponse.json(games)
  // Not staff: only what the public schedule is allowed to show.
  return NextResponse.json(applyPublicView(games, await getPublicVisibility(params.id)))
}

// Circle rotation round-robin: returns game pairings grouped by scheduling round.
// Within each round every team appears at most once — safe to run simultaneously.
// Numbering games round-by-round means P1, P2, P3... never puts the same team back-to-back.
//
// Example (4 teams A,B,C,D):
//   Round 1: (A,D), (B,C)   → P1, P2
//   Round 2: (A,C), (D,B)   → P3, P4
//   Round 3: (A,B), (C,D)   → P5, P6
//
// Scheduling P1 then P2: A,B,C,D all rest (different teams).
// A's next game after P1 is P3 — one game of rest in between. ✓
function roundRobinByRound(teams: string[]): [string, string][][] {
  const t = [...teams]
  if (t.length % 2 === 1) t.push('__bye__') // pad to even
  const n = t.length
  const rounds: [string, string][][] = []

  for (let r = 0; r < n - 1; r++) {
    const round: [string, string][] = []
    for (let i = 0; i < n / 2; i++) {
      const home = t[i]
      const away = t[n - 1 - i]
      if (home !== '__bye__' && away !== '__bye__') {
        round.push([home, away])
      }
    }
    rounds.push(round)
    // Rotate: keep t[0] fixed, move t[n-1] to position 1, shift 1..n-2 right
    const last = t[n - 1]
    for (let i = n - 1; i > 1; i--) t[i] = t[i - 1]
    t[1] = last
  }
  return rounds
}

// ---------------------------------------------------------------------------
// GENERATOR RULES
//
// Bo, Oct 2026: "can we have some rules -- avoid teams from the same club, and put
// them in order so they can have optimal game times if we schedule in order."
// Both are preferences, not laws: a pool of four where three teams share a club
// cannot avoid a club meeting, and the generator says how often it had to give in
// rather than pretending it succeeded.
// ---------------------------------------------------------------------------

/** Same club = same clubName on the registration. Teams with no registration
 *  behind them (typed straight into a pool) constrain nothing: guessing from the
 *  name would pair "Miami Reign" with "Miami Thunder", which are two clubs. */
function sameClub(clubOf: Map<string, string>, a: string, b: string): boolean {
  const ca = clubOf.get(a), cb = clubOf.get(b)
  return !!ca && !!cb && ca === cb
}

const countSameClub = (round: [string, string][], clubOf: Map<string, string>) =>
  round.filter(([a, b]) => sameClub(clubOf, a, b)).length

/**
 * RULE 1 -- pick the rounds that hold the fewest club meetings.
 *
 * Every round of a circle round robin is a complete pairing, so ANY `want` rounds
 * give each team the same number of games. Which ones is therefore free, and the
 * cheapest version of this rule is to spend that freedom: sort by how many same-club
 * games a round carries, keep the cheapest, then put them back in circle order so
 * the rotation's spread survives.
 *
 * Optimal, not approximate: the total is a plain sum over rounds and no round
 * affects another, so the smallest `want` individually is the smallest total.
 */
function pickRounds(all: [string, string][][], want: number, clubOf: Map<string, string>): [string, string][][] {
  if (want >= all.length) return [...all]
  return all
    .map((round, idx) => ({ round, idx, cost: countSameClub(round, clubOf) }))
    .sort((x, y) => x.cost - y.cost || x.idx - y.idx)
    .slice(0, want)
    .sort((x, y) => x.idx - y.idx)
    .map(x => x.round)
}

/*
 * RULE 2 -- game ORDER, deliberately not implemented yet.
 *
 * Bo also asked for games ordered so teams get decent gaps when the schedule is
 * laid down in sequence. The obvious version -- re-sort each round so teams keep
 * the position they had in the round before -- was written, measured, and thrown
 * away: across 4,000 random pools it moved the average minimum gap from 2.76 games
 * to 2.15. WORSE than doing nothing.
 *
 * The reason is that the circle rotation already carries a team's position forward
 * from round to round, so re-sorting by that same signal mostly scrambles what was
 * already there. Beating it needs the real thing -- an assignment per round that
 * maximises the smallest gap -- not a sort.
 *
 * Left out rather than shipped half-right: a rule that makes the schedule worse is
 * worse than no rule, and the number above is why.
 */

/**
 * Rounds under-deliver when a pool has an odd number of teams.
 *
 * roundRobinByRound pads an odd list with a bye, so every round drops one pairing
 * and a different team sits out each time. Taking the first `gpt` rounds therefore
 * leaves exactly `gpt` teams one game short -- invisible on a FULL round robin,
 * where every team eventually takes its bye, and wrong on every partial one.
 *
 * Girls Lower School, Oct 2026: 7 teams at 2 games each is 7 games (14 team-slots,
 * halved). The generator made 6, and Florida Elite LS Girls and Jup RevLax 2035/36
 * came out with 1 apiece -- they were the two who sat. Bo spotted that the game
 * between those two was the whole of what was missing. It was.
 *
 * A pool schedule does not need rounds to be simultaneous, so the fix is to keep
 * pairing the neediest teams that have not met until nobody short is left with a
 * partner. Never a rematch: a team playing someone twice is worse than a team being
 * one short, and the uneven-pool warning says so either way.
 */
function topUpShortTeams(rounds: [string, string][][], teamNames: string[], gpt: number, clubOf: Map<string, string>): [string, string][] {
  const pairKey = (a: string, b: string) => [a, b].sort().join('\u0000')
  const counts = new Map<string, number>(teamNames.map(t => [t, 0]))
  const played = new Set<string>()
  for (const round of rounds) {
    for (const [a, b] of round) {
      counts.set(a, (counts.get(a) ?? 0) + 1)
      counts.set(b, (counts.get(b) ?? 0) + 1)
      played.add(pairKey(a, b))
    }
  }

  const extra: [string, string][] = []
  // Repeat only so a team short by more than one is still handled; the usual case
  // is settled in a single pass, because the circle gives each team at most one bye
  // in a partial round robin.
  for (;;) {
    const short = teamNames
      .filter(t => (counts.get(t) ?? 0) < gpt)
      .sort((a, b) => (counts.get(a)! - counts.get(b)!) || a.localeCompare(b))
    if (short.length < 2) break
    // Two passes: pair everyone we can without a club meeting, then let the
    // leftovers meet rather than leave them a game short. A club playing itself is
    // a disappointment; a team short of its games is a broken promise.
    const fresh = (a: string, b: string) => !played.has(pairKey(a, b))
    let pairs = bestPairing(short, (a, b) => fresh(a, b) && !sameClub(clubOf, a, b))
    if (pairs.length * 2 < short.length - 1) {
      const taken = new Set(pairs.flat())
      const rest = short.filter(t => !taken.has(t))
      pairs = [...pairs, ...bestPairing(rest, fresh)]
    }
    if (!pairs.length) break   // every short team has already met every other
    for (const [a, b] of pairs) {
      extra.push([a, b])
      played.add(pairKey(a, b))
      counts.set(a, counts.get(a)! + 1)
      counts.set(b, counts.get(b)! + 1)
    }
  }
  return extra
}

/**
 * The most teams that can be paired off at once, given who has already met.
 *
 * A maximum matching rather than "walk the list taking the first partner that
 * works". Greedy strands people: seven teams at four games each leaves four short,
 * and the obvious first pairing can leave the remaining two as a couple who have
 * already played -- one extra game instead of two, and a team short for no reason.
 * Checked across pool sizes 3-18 at one to five games each.
 *
 * Exhaustive with a bound, which is affordable because the short list is at most
 * one team per round played. The cap is a guard for a pool far larger than anything
 * this app schedules, where greedy is still better than hanging.
 */
function bestPairing(nodes: string[], canPair: (a: string, b: string) => boolean): [string, string][] {
  if (nodes.length > 14) {
    const out: [string, string][] = []
    const used = new Set<string>()
    for (let i = 0; i < nodes.length; i++) {
      if (used.has(nodes[i])) continue
      for (let j = i + 1; j < nodes.length; j++) {
        if (used.has(nodes[j]) || !canPair(nodes[i], nodes[j])) continue
        out.push([nodes[i], nodes[j]]); used.add(nodes[i]); used.add(nodes[j]); break
      }
    }
    return out
  }

  let best: [string, string][] = []
  const search = (remaining: string[], acc: [string, string][]) => {
    if (acc.length > best.length) best = [...acc]
    if (remaining.length < 2) return
    if (acc.length + Math.floor(remaining.length / 2) <= best.length) return   // cannot win
    const [first, ...rest] = remaining
    for (let i = 0; i < rest.length; i++) {
      if (!canPair(first, rest[i])) continue
      acc.push([first, rest[i]])
      search(rest.filter((_, j) => j !== i), acc)
      acc.pop()
    }
    search(rest, acc)   // leaving `first` out may still pair more of the others
  }
  search(nodes, [])
  return best
}

/** Spread extra pairings over as few rounds as possible without a team appearing
 *  twice in one, so the P-numbering keeps its no-back-to-back property. */
function packIntoRounds(pairs: [string, string][]): [string, string][][] {
  const left = [...pairs]
  const rounds: [string, string][][] = []
  while (left.length) {
    const round: [string, string][] = []
    const used = new Set<string>()
    for (let i = 0; i < left.length;) {
      const [a, b] = left[i]
      if (used.has(a) || used.has(b)) { i++; continue }
      round.push(left[i]); used.add(a); used.add(b); left.splice(i, 1)
    }
    rounds.push(round)
  }
  return rounds
}

// POST – generate round-robin pool games OR add a single game
export async function POST(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const division = decodeURIComponent(params.division)
  const body = await req.json()

  // Single game add
  if (body.action === 'add') {
    const { gameNumber, team1, team2, pool, date, startTime, location, refCount } = body
    const game = await prisma.game.create({
      data: {
        tournamentId: params.id, division, pool: pool || null,
        gameNumber: String(gameNumber ?? ''), date: date ?? '', startTime: startTime ?? '',
        location: location ?? '', team1: team1 ?? 'TBD', team2: team2 ?? 'TBD',
        // the Officials rule for this division unless the caller set one (lib/refRules)
        refCount: refCount !== undefined ? Number(refCount) : (await refsLookup(params.id))(division),
      },
    })
    return NextResponse.json(game, { status: 201 })
  }

  // Generate round-robin
  if (body.action === 'generate') {
    const { date, refCount, gamesPerTeam, clearExisting } = body

    const pools = await prisma.pool.findMany({ where: { tournamentId: params.id, division } })
    if (pools.length === 0) return NextResponse.json({ error: 'No pools found for this division' }, { status: 400 })
    const defaultRefs = (await refsLookup(params.id))(division)

    // Which club each team belongs to, for rule 1. Read from the registration
    // rather than inferred from the team name -- "Jup RevLax 2034/35" and
    // "Jup RevLax 2035/36" are one club, "Miami Reign" and "Miami Thunder" are two,
    // and no amount of string matching tells those apart.
    const clubOf = new Map<string, string>()
    try {
      const registered = await prisma.registeredTeam.findMany({
        where: { registration: { tournamentId: params.id, deletedAt: null }, division },
        select: { teamName: true, clubName: true },
      })
      for (const t of registered) {
        const name = String(t.teamName || '').trim()
        const club = String(t.clubName || '').trim()
        if (name && club) clubOf.set(name, club)
      }
    } catch { /* no club data: rule 1 simply finds nothing to avoid */ }

    if (clearExisting) {
      // Clear the division's pool games (and legacy un-pooled ones) so stale games
      // don't persist -- but NOT the bracket's B-games.
      //
      // This used to delete every game in the division. Bulk Generate calls this for
      // every division with clearExisting, so one run wiped every B-game while the
      // Bracket and BracketGame rows survived in their own tables: the Bracket tab
      // still drew a bracket, the rail's bracket count read 0, and the bracket games
      // disappeared from the Scheduler's parking lot with nothing said. Then bracket
      // generation saw the surviving Bracket row, called it "already exists", and
      // never rebuilt the games it had just destroyed.
      await prisma.game.deleteMany({
        where: { tournamentId: params.id, division, NOT: { gameNumber: { startsWith: 'B' } } },
      })
    }

    // Count existing pool games for this division to continue numbering from there
    const existingCount = await prisma.game.count({
      where: { tournamentId: params.id, division, pool: { not: null } },
    })
    let poolGameNum = existingCount + 1

    // Build round-based schedule for each pool using circle rotation
    const poolSchedules: { poolName: string; rounds: [string, string][][]; rc: number }[] = []
    for (const pool of pools) {
      // Deduped here as well as on save: a pool saved before that guard existed is
      // still on disk, and a regenerate has to be able to fix it without the
      // organizer first dragging a team around. A duplicate reads as a second team
      // to the round robin, which is how a 7-team pool produced 8 games.
      const teamNames: string[] = [...new Set(
        (JSON.parse(pool.teamNames || '[]') as unknown[]).map(n => String(n ?? '').trim()).filter(Boolean)
      )]
      if (teamNames.length < 2) continue

      const teamsCount = teamNames.length
      const allRounds = roundRobinByRound(teamNames)
      const maxRounds = allRounds.length // n-1 for even teams, n for odd (with bye slot)
      const gpt = Number(gamesPerTeam) > 0 ? Number(gamesPerTeam) : teamsCount - 1
      // Full round-robin: each team plays (teamsCount-1) games regardless of odd/even.
      // For odd teams, that requires ALL maxRounds rounds (one sit-out per team).
      // For partial RRs, use gpt rounds directly.
      const roundsToUse = gpt >= teamsCount - 1 ? maxRounds : Math.min(gpt, maxRounds)

      const target = Math.min(gpt, teamsCount - 1)
      // Build it twice and keep the better one. Choosing rounds for rule 1 changes
      // who takes a bye and what has already been played, and in a small number of
      // pools that leaves the top-up fewer legal partners -- measured at 28 of 4,000
      // random pools. A club meeting is a disappointment; a team owed a game and not
      // getting it is a broken promise, so games win and rule 1 stands down.
      const assemble = (useRule1: boolean) => {
        const picked = useRule1 ? pickRounds(allRounds, roundsToUse, clubOf) : allRounds.slice(0, roundsToUse)
        const extra = topUpShortTeams(picked, teamNames, target, useRule1 ? clubOf : new Map())
        return extra.length ? [...picked, ...packIntoRounds(extra)] : picked
      }
      const tally = (rs: [string, string][][]) => rs.reduce((n, r) => n + r.length, 0)
      const withRule = assemble(true)
      const plain = assemble(false)
      const rounds = tally(withRule) >= tally(plain) ? withRule : plain

      poolSchedules.push({ poolName: pool.name, rounds, rc: refCount !== undefined ? Number(refCount) : defaultRefs })
    }

    // Number games ROUND BY ROUND across all pools:
    //   Round 1 of Pool A, Round 1 of Pool B...
    //   Round 2 of Pool A, Round 2 of Pool B...
    // Sequential P-numbers therefore never put the same team back-to-back within a pool.
    const maxRounds = Math.max(...poolSchedules.map(ps => ps.rounds.length), 0)
    const created: any[] = []

    for (let roundIdx = 0; roundIdx < maxRounds; roundIdx++) {
      for (const ps of poolSchedules) {
        if (roundIdx >= ps.rounds.length) continue
        for (const [team1, team2] of ps.rounds[roundIdx]) {
          const game = await prisma.game.create({
            data: {
              tournamentId: params.id,
              division,
              pool: ps.poolName,
              gameNumber: `P${poolGameNum++}`,
              date: date ?? '',
              startTime: '',
              location: '',
              team1,
              team2,
              refCount: ps.rc,
            },
          })
          created.push({ id: game.id, gameNumber: game.gameNumber, pool: game.pool, team1: game.team1, team2: game.team2 })
        }
      }
    }

    // Said out loud rather than buried: a pool whose teams mostly share a club
    // cannot avoid a club meeting, and the organizer should hear that from the
    // generator instead of spotting it on the schedule later.
    const sameClubGames = created.filter(g => sameClub(clubOf, String(g.team1).trim(), String(g.team2).trim())).length
    return NextResponse.json({ generated: created.length, games: created, sameClubGames })
  }

  // Renumber pool games for this division with P prefix.
  // Preserves creation order (which already encodes round-based ordering from generate).
  if (body.action === 'renumber') {
    const games = await prisma.game.findMany({
      where: { tournamentId: params.id, division, pool: { not: null } },
      orderBy: { createdAt: 'asc' },
    })
    let num = 1
    await Promise.all(games.map(g => prisma.game.update({ where: { id: g.id }, data: { gameNumber: `P${num++}` } })))
    return NextResponse.json({ renumbered: games.length })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// DELETE – remove all games for this division (pool and non-pool)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; division: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const division = decodeURIComponent(params.division)
  const { count } = await prisma.game.deleteMany({
    where: { tournamentId: params.id, division },
  })
  return NextResponse.json({ deleted: count })
}
