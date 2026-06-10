import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTemplate } from '@/lib/bracketTemplates'

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function fmtSrc(src: string): string {
  if (src.startsWith('seed:')) return 'Seed ' + src.slice(5)
  if (src.startsWith('winner:')) return 'W-B' + src.slice(7)
  if (src.startsWith('loser:')) return 'L-B' + src.slice(6)
  return src
}


// ── Algorithmic bracket generator (any team count) ─────────────────────────
type Sect = 'winners' | 'losers' | 'consolation' | 'championship'
interface Gen { gameNumber: number; round: number; section: Sect; t1: string; t2: string; label: string }

function generateSEGames(teamCount: number, consolationCount: number): Gen[] {
  const n = Math.max(2, teamCount)
  const games: Gen[] = []
  let gn = 1

  if (n === 2) {
    games.push({ gameNumber: gn++, round: 1, section: 'championship', t1: 'seed:1', t2: 'seed:2', label: 'Championship' })
  } else {
    // Find smallest power of 2 >= n; byes go to top seeds
    let slots = 2
    while (slots < n) slots *= 2
    const byes = slots - n
    const byeSeeds = Array.from({ length: byes }, (_, i) => `seed:${i + 1}`)
    const r1Seeds = Array.from({ length: n - byes }, (_, i) => i + byes + 1)

    // Round 1: pair highest vs lowest remaining
    const r1Winners: string[] = []
    for (let i = 0; i < r1Seeds.length / 2; i++) {
      const s1 = r1Seeds[i], s2 = r1Seeds[r1Seeds.length - 1 - i]
      games.push({ gameNumber: gn, round: 1, section: 'winners', t1: `seed:${s1}`, t2: `seed:${s2}`, label: '' })
      r1Winners.push(`winner:${gn}`)
      gn++
    }

    // Subsequent rounds: byes slot in first (best seeds), then r1 winners
    let sources: string[] = [...byeSeeds, ...r1Winners]
    let round = 2
    while (sources.length > 1) {
      const next: string[] = []
      for (let i = 0; i < Math.floor(sources.length / 2); i++) {
        const s1 = sources[i], s2 = sources[sources.length - 1 - i]
        const isChamp = sources.length === 2
        games.push({ gameNumber: gn, round, section: isChamp ? 'championship' : 'winners', t1: s1, t2: s2, label: isChamp ? 'Championship' : '' })
        next.push(`winner:${gn}`)
        gn++
      }
      sources = next
      round++
    }
  }

  // Consolation slots — auto-fill with seeds starting at teamCount + 1
  for (let i = 0; i < consolationCount; i++) {
    const s1 = n + 1 + i * 2
    const s2 = n + 2 + i * 2
    games.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `seed:${s1}`, t2: `seed:${s2}`, label: consolationCount > 1 ? `Consolation ${i + 1}` : 'Consolation' })
  }

  return games
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; division: string } }
) {
  const division = decodeURIComponent(params.division)
  try {
    const bracket = await prisma.bracket.findFirst({
      where: { tournamentId: params.id, division },
      include: { games: { orderBy: { gameNumber: 'asc' } } },
    })
    if (!bracket) return NextResponse.json(null)
    return NextResponse.json({ ...bracket, seeds: JSON.parse(bracket.seeds || '{}') })
  } catch {
    return NextResponse.json(
      { error: 'Bracket tables not yet created. Run DB migration.' },
      { status: 503 }
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; division: string } }
) {
  const division = decodeURIComponent(params.division)
  const { format, teamCount, consolationCount = 0, seeds } = await req.json()

  // Use predefined template if available; otherwise generate algorithmically
  const rawTemplate = getTemplate(format, teamCount)
  const template: Gen[] = rawTemplate
    ? rawTemplate.map((g, _) => ({
        gameNumber: g.gameNumber, round: g.round,
        section: g.section as Sect,
        t1: g.t1, t2: g.t2, label: g.label || '',
      }))
    : generateSEGames(teamCount, consolationCount)

  try {
    const existing = await prisma.bracket.findFirst({
      where: { tournamentId: params.id, division },
    })
    if (existing) {
      await prisma.bracketGame.deleteMany({ where: { bracketId: existing.id } })
      await prisma.bracket.delete({ where: { id: existing.id } })
    }
    await prisma.game.deleteMany({
      where: { tournamentId: params.id, division, gameNumber: { startsWith: 'B' } },
    })

    const bracketId = genId()
    await prisma.bracket.create({
      data: {
        id: bracketId, tournamentId: params.id, division, format,
        teamCount, seeds: JSON.stringify(seeds || {}),
      },
    })

    const games = await Promise.all(
      template.map((g) =>
        prisma.bracketGame.create({
          data: {
            id: genId(), bracketId,
            gameNumber: g.gameNumber, round: g.round, section: g.section,
            team1Source: g.t1, team2Source: g.t2, label: g.label,
            team1: '', team2: '', winner: '', loser: '', field: '', startTime: '', gameDate: '',
          },
        })
      )
    )

    await Promise.all(
      template.map((g) =>
        prisma.game.create({
          data: {
            tournamentId: params.id, division,
            gameNumber: 'B' + g.gameNumber,
            isChampionship: g.section === 'championship',
            team1: fmtSrc(g.t1), team2: fmtSrc(g.t2),
            date: '', startTime: '', location: '', refCount: 2,
          },
        })
      )
    )

    return NextResponse.json({
      id: bracketId, tournamentId: params.id, division, format, teamCount,
      seeds: seeds || {}, games,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create bracket. DB migration may be needed.' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; division: string } }
) {
  const division = decodeURIComponent(params.division)
  const body = await req.json()

  try {
    const bracket = await prisma.bracket.findFirst({
      where: { tournamentId: params.id, division },
      include: { games: { orderBy: { gameNumber: 'asc' } } },
    })
    if (!bracket) return NextResponse.json({ error: 'No bracket found' }, { status: 404 })

    // ── Update label ──────────────────────────────────────────────────
    if (body.updateLabel !== undefined) {
      const { gameNumber, label } = body.updateLabel
      await prisma.bracketGame.updateMany({ where: { bracketId: bracket.id, gameNumber }, data: { label } })
      return NextResponse.json({ ok: true })
    }

    // ── Add a single game ──────────────────────────────────────────────
    if (body.addGame) {
      const { gameNumber, round, section, t1Source, t2Source, label } = body.addGame
      await prisma.bracketGame.create({
        data: {
          id: genId(), bracketId: bracket.id,
          gameNumber, round, section,
          team1Source: t1Source, team2Source: t2Source, label: label || '',
          team1: '', team2: '', winner: '', loser: '', field: '', startTime: '', gameDate: '',
        },
      })
      // Also create the scheduler Game record
      await prisma.game.create({
        data: {
          tournamentId: params.id, division,
          gameNumber: 'B' + gameNumber,
          isChampionship: section === 'championship',
          team1: fmtSrc(t1Source), team2: fmtSrc(t2Source),
          date: '', startTime: '', location: '', refCount: 2,
        },
      })
      const updated = await prisma.bracket.findFirst({
        where: { id: bracket.id },
        include: { games: { orderBy: { gameNumber: 'asc' } } },
      })
      return NextResponse.json({ ...updated, seeds: JSON.parse(updated!.seeds || '{}') })
    }

    // ── Remove a single game ───────────────────────────────────────────
    if (body.removeGame !== undefined) {
      const gameNum = Number(body.removeGame)
      await prisma.bracketGame.deleteMany({ where: { bracketId: bracket.id, gameNumber: gameNum } })
      await prisma.game.deleteMany({
        where: { tournamentId: params.id, division, gameNumber: 'B' + gameNum },
      })
      const updated = await prisma.bracket.findFirst({
        where: { id: bracket.id },
        include: { games: { orderBy: { gameNumber: 'asc' } } },
      })
      return NextResponse.json({ ...updated, seeds: JSON.parse(updated!.seeds || '{}') })
    }

    // ── Update seeds ───────────────────────────────────────────────────
    if (body.seeds !== undefined) {
      await prisma.bracket.update({
        where: { id: bracket.id },
        data: { seeds: JSON.stringify(body.seeds) },
      })
      return NextResponse.json({ ok: true, seeds: body.seeds })
    }

    return NextResponse.json({ error: 'No operation specified' }, { status: 400 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Operation failed' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; division: string } }
) {
  const division = decodeURIComponent(params.division)
  try {
    const bracket = await prisma.bracket.findFirst({ where: { tournamentId: params.id, division } })
    if (!bracket) return NextResponse.json({ ok: true })
    await prisma.bracketGame.deleteMany({ where: { bracketId: bracket.id } })
    await prisma.bracket.delete({ where: { id: bracket.id } })
    await prisma.game.deleteMany({
      where: { tournamentId: params.id, division, gameNumber: { startsWith: 'B' } },
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete bracket' }, { status: 500 })
  }
}
