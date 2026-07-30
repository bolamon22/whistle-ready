import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

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
  return NextResponse.json(games)
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
        refCount: Number(refCount ?? 2),
      },
    })
    return NextResponse.json(game, { status: 201 })
  }

  // Generate round-robin
  if (body.action === 'generate') {
    const { date, refCount, gamesPerTeam, clearExisting } = body

    const pools = await prisma.pool.findMany({ where: { tournamentId: params.id, division } })
    if (pools.length === 0) return NextResponse.json({ error: 'No pools found for this division' }, { status: 400 })

    if (clearExisting) {
      // Delete ALL games for the division (pool and non-pool) so old legacy games don't persist
      await prisma.game.deleteMany({ where: { tournamentId: params.id, division } })
    }

    // Count existing pool games for this division to continue numbering from there
    const existingCount = await prisma.game.count({
      where: { tournamentId: params.id, division, pool: { not: null } },
    })
    let poolGameNum = existingCount + 1

    // Build round-based schedule for each pool using circle rotation
    const poolSchedules: { poolName: string; rounds: [string, string][][]; rc: number }[] = []
    for (const pool of pools) {
      const teamNames: string[] = JSON.parse(pool.teamNames || '[]')
      if (teamNames.length < 2) continue

      const teamsCount = teamNames.length
      const allRounds = roundRobinByRound(teamNames)
      const maxRounds = allRounds.length // n-1 for even teams, n for odd (with bye slot)
      const gpt = Number(gamesPerTeam) > 0 ? Number(gamesPerTeam) : teamsCount - 1
      // Full round-robin: each team plays (teamsCount-1) games regardless of odd/even.
      // For odd teams, that requires ALL maxRounds rounds (one sit-out per team).
      // For partial RRs, use gpt rounds directly.
      const roundsToUse = gpt >= teamsCount - 1 ? maxRounds : Math.min(gpt, maxRounds)

      poolSchedules.push({ poolName: pool.name, rounds: allRounds.slice(0, roundsToUse), rc: Number(refCount ?? 2) })
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

    return NextResponse.json({ generated: created.length, games: created })
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
