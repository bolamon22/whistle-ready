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
    // equalByes: same number of byes and R1 games — use standard bracket seeding layout
    const equalByes = byes === r1Seeds.length / 2

    // Round 1: when equalByes, pair inner-to-outer (weakest game first, adjacent to Seed 1)
    // Otherwise outer-to-inner (highest seed vs lowest)
    const r1Winners: string[] = []
    const mid = r1Seeds.length / 2
    for (let i = 0; i < r1Seeds.length / 2; i++) {
      const s1 = equalByes ? r1Seeds[mid - 1 - i] : r1Seeds[i]
      const s2 = equalByes ? r1Seeds[mid + i] : r1Seeds[r1Seeds.length - 1 - i]
      games.push({ gameNumber: gn, round: 1, section: 'winners', t1: `seed:${s1}`, t2: `seed:${s2}`, label: '' })
      r1Winners.push(`winner:${gn}`)
      gn++
    }

    // Subsequent rounds: interleave byes+r1Winners when equalByes (no crossing lines)
    let sources: string[]
    if (equalByes) {
      sources = []
      for (let i = 0; i < byeSeeds.length; i++) sources.push(byeSeeds[i], r1Winners[i])
    } else {
      sources = [...byeSeeds, ...r1Winners]
    }
    let round = 2
    let firstRound = true
    while (sources.length > 1) {
      const next: string[] = []
      const adj = equalByes && firstRound
      for (let i = 0; i < Math.floor(sources.length / 2); i++) {
        const s1 = adj ? sources[2 * i] : sources[i]
        const s2 = adj ? sources[2 * i + 1] : sources[sources.length - 1 - i]
        const isChamp = sources.length === 2
        games.push({ gameNumber: gn, round, section: isChamp ? 'championship' : 'winners', t1: s1, t2: s2, label: isChamp ? 'Championship' : '' })
        next.push(`winner:${gn}`)
        gn++
      }
      sources = next
      round++
      firstRound = false
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


// ── Owes-2 generator: everyone in the bracket + loser-fed consolation + if-needed ──
// Used when (guarantee - pool games) >= 2: pool play gives fewer games, so the
// bracket must guarantee 2 — first-round losers get a 2nd game; bye seeds get a
// conditional "if needed" game. Reuses generateSEGames for the winners bracket.
function generateOwes2(teamCount: number): Gen[] {
  const games = generateSEGames(teamCount, 0)
  let gn = games.length + 1
  const isSeed = (x: string) => x.startsWith('seed:')
  const seedNum = (x: string) => parseInt(x.split(':')[1])
  const twoSeed = games.filter(g => isSeed(g.t1) && isSeed(g.t2))   // both entered fresh -> loser is short
  const mixed = games.filter(g => isSeed(g.t1) !== isSeed(g.t2))    // bye seed vs play-in winner -> if needed
  const extra: Gen[] = []
  const consTotal = Math.floor(twoSeed.length / 2)
  let cn = 1
  for (let i = 0; i + 1 < twoSeed.length; i += 2) {
    extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${twoSeed[i].gameNumber}`, t2: `loser:${twoSeed[i + 1].gameNumber}`, label: consTotal > 1 ? `Consolation ${cn++}` : 'Consolation' })
  }
  const leftoverTwo = twoSeed.length % 2 === 1 ? twoSeed[twoSeed.length - 1] : null
  const strongestTwo = [...twoSeed].sort((a, b) => Math.min(seedNum(a.t1), seedNum(a.t2)) - Math.min(seedNum(b.t1), seedNum(b.t2)))[0]
  for (let j = 0; j + 1 < mixed.length; j += 2) {
    extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${mixed[j].gameNumber}`, t2: `loser:${mixed[j + 1].gameNumber}`, label: 'If needed' })
  }
  const leftoverMixed = mixed.length % 2 === 1 ? mixed[mixed.length - 1] : null
  if (leftoverTwo) {
    // odd number of definite-loser games: give the leftover a guaranteed 2nd game by pairing it
    // with a bye-seed game (which doubles as that bye seed's if-needed), else the strongest other loser
    const opp = leftoverMixed ?? strongestTwo
    if (opp) extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${leftoverTwo.gameNumber}`, t2: `loser:${opp.gameNumber}`, label: 'Consolation' })
  } else if (leftoverMixed && strongestTwo) {
    extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${leftoverMixed.gameNumber}`, t2: `loser:${strongestTwo.gameNumber}`, label: 'If needed' })
  }
  return [...games, ...extra]
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
  const { format, teamCount, consolationCount = 0, seeds, loserConsolation = false } = await req.json()

  // loserConsolation = the "owes 2" mode (everyone in + loser-fed consolation + if-needed).
  // Otherwise: predefined template if available, else algorithmic single-elim (+ seed-paired consolation).
  const rawTemplate = loserConsolation ? null : getTemplate(format, teamCount)
  const template: Gen[] = loserConsolation
    ? generateOwes2(teamCount)
    : rawTemplate
    ? (() => {
        const base: Gen[] = rawTemplate.map((g) => ({
          gameNumber: g.gameNumber, round: g.round,
          section: g.section as Sect,
          t1: g.t1, t2: g.t2, label: g.label || '',
        }))
        let gn = base.length + 1
        const cons: Gen[] = []
        for (let i = 0; i < consolationCount; i++) {
          cons.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `seed:${teamCount + 1 + i * 2}`, t2: `seed:${teamCount + 2 + i * 2}`, label: consolationCount > 1 ? `Consolation ${i + 1}` : 'Consolation' })
        }
        return [...base, ...cons]
      })()
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
