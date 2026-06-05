import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET — list existing pool games for this division
export async function GET(_req: NextRequest, { params }: { params: { id: string; division: string } }) {
  const division = decodeURIComponent(params.division)
  const games = await prisma.game.findMany({
    where: { tournamentId: params.id, division, pool: { not: null } },
    orderBy: [{ pool: 'asc' }, { gameNumber: 'asc' }],
  })
  return NextResponse.json(games)
}

// POST — generate round-robin pool games OR add a single game
export async function POST(req: NextRequest, { params }: { params: { id: string; division: string } }) {
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
    const { date, refCount, clearExisting } = body

    const pools = await prisma.pool.findMany({ where: { tournamentId: params.id, division } })
    if (pools.length === 0) return NextResponse.json({ error: 'No pools found for this division' }, { status: 400 })

    // Optionally clear existing pool games for this division
    if (clearExisting) {
      await prisma.game.deleteMany({ where: { tournamentId: params.id, division, pool: { not: null } } })
    }

    // Find the highest game number across the whole tournament
    const allGames = await prisma.game.findMany({
      where: { tournamentId: params.id },
      select: { gameNumber: true },
    })
    let nextNum = allGames.reduce((max, g) => {
      const n = parseInt(g.gameNumber)
      return isNaN(n) ? max : Math.max(max, n)
    }, 0) + 1

    const created: { id: string; gameNumber: string; pool: string | null; team1: string; team2: string }[] = []

    for (const pool of pools) {
      const teamNames: string[] = JSON.parse(pool.teamNames || '[]')
      if (teamNames.length < 2) continue

      // Round-robin: every pair plays once
      for (let i = 0; i < teamNames.length; i++) {
        for (let j = i + 1; j < teamNames.length; j++) {
          const game = await prisma.game.create({
            data: {
              tournamentId: params.id,
              division,
              pool: pool.name,
              gameNumber: String(nextNum++),
              date: date ?? '',
              startTime: '',
              location: '',
              team1: teamNames[i],
              team2: teamNames[j],
              refCount: Number(refCount ?? 2),
            },
          })
          created.push({ id: game.id, gameNumber: game.gameNumber, pool: game.pool, team1: game.team1, team2: game.team2 })
        }
      }
    }

    return NextResponse.json({ generated: created.length, games: created })
  }

  // Renumber pool games for this division sequentially
  if (body.action === 'renumber') {
    const { startFrom } = body
    const games = await prisma.game.findMany({
      where: { tournamentId: params.id, division, pool: { not: null } },
      orderBy: [{ pool: 'asc' }, { createdAt: 'asc' }],
    })
    let num = Number(startFrom ?? 1)
    await Promise.all(games.map(g => prisma.game.update({ where: { id: g.id }, data: { gameNumber: String(num++) } })))
    return NextResponse.json({ renumbered: games.length })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// DELETE — remove all pool games for this division
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; division: string } }) {
  const division = decodeURIComponent(params.division)
  const { count } = await prisma.game.deleteMany({
    where: { tournamentId: params.id, division, pool: { not: null } },
  })
  return NextResponse.json({ deleted: count })
}
