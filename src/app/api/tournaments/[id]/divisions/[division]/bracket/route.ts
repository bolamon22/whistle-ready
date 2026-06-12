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
    let slots = 2
    while (slots < n) slots *= 2
    const byes = slots - n
    const byeSeeds = Array.from({ length: byes }, (_, i) => `seed:${i + 1}`)
    const r1Seeds = Array.from({ length: n - byes }, (_, i) => i + byes + 1)
    const equalByes = byes === r1Seeds.length / 2

    const r1Winners: string[] = []
    const mid = r1Seeds.length / 2
    for (let i = 0; i < r1Seeds.length / 2; i++) {
      const s1 = equalByes ? r1Seeds[mid - 1 - i] : r1Seeds[i]
      const s2 = equalByes ? r1Seeds[mid + i] : r1Seeds[r1Seeds.length - 1 - i]
      games.push({ gameNumber: gn, round: 1, section: 'winners', t1: `seed:${s1}`, t2: `seed:${s2}`, label: '' })
      r1Winners.push(`winner:${gn}`)
      gn++
    }

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

  for (let i = 0; i < consolationCount; i++) {
    const s1 = n + 1 + i * 2
    const s2 = n + 2 + i * 2
    games.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `seed:${s1}`, t2: `seed:${s2}`, label: consolationCount > 1 ? `Consolation ${i + 1}` : 'Consolation' })
  }

  return games
}

function generateOwes2(teamCount: number): Gen[] {
  const games = generateSEGames(teamCount, 0)
  let gn = games.length + 1
  const isSeed = (x: string) => x.startsWith('seed:')
  const seedNum = (x: string) => parseInt(x.split(':')[1])
  const twoSeed = games.filter(g => isSeed(g.t1) && isSeed(g.t2))
  const mixed = games.filter(g => isSeed(g.t1) !== isSeed(g.t2))
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
    const opp = leftoverMixed ?? strongestTwo
    if (opp) extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${leftoverTwo.gameNumber}`, t2: `loser:${opp.gameNumber}`, label: 'Consolation' })
  } else if (leftoverMixed && strongestTwo) {
    extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${leftoverMixed.gameNumber}`, t2: `loser:${strongestTwo.gameNumber}`, label: 'If needed' })
  }
  return [...games, ...extra]
}

// Build a bracket template for one bracket (single flight or whole division).
function buildTemplate(format: string, teamCount: number, consolationCount: number, loserConsolation: boolean): Gen[] {
  if (loserConsolation) return generateOwes2(teamCount)
  const rawTemplate = getTemplate(format, teamCount)
  if (rawTemplate) {
    const base: Gen[] = rawTemplate.map((g) => ({
      gameNumber: g.gameNumber, round: g.round,
      section: g.section as Sect, t1: g.t1, t2: g.t2, label: g.label || '',
    }))
    let gn = base.length + 1
    const cons: Gen[] = []
    for (let i = 0; i < consolationCount; i++) {
      cons.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `seed:${teamCount + 1 + i * 2}`, t2: `seed:${teamCount + 2 + i * 2}`, label: consolationCount > 1 ? `Consolation ${i + 1}` : 'Consolation' })
    }
    return [...base, ...cons]
  }
  return generateSEGames(teamCount, consolationCount)
}

// Persist one bracket (Bracket row + BracketGame rows + schedulable Game rows).
// numberOffset shifts the schedulable "B#" so flights never collide (Flight A
// uses B1..Ba, Flight B continues B(a+1)..).
async function createBracketRecords(opts: {
  tournamentId: string; division: string; flight: string; numberOffset: number;
  format: string; teamCount: number; seeds: Record<string, string>; template: Gen[]
}) {
  const { tournamentId, division, flight, numberOffset, format, teamCount, seeds, template } = opts
  const bracketId = genId()
  await prisma.bracket.create({
    data: {
      id: bracketId, tournamentId, division, format, teamCount,
      flight, numberOffset, seeds: JSON.stringify(seeds || {}),
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
          tournamentId, division,
          gameNumber: 'B' + (numberOffset + g.gameNumber),
          isChampionship: g.section === 'championship',
          team1: fmtSrc(g.t1), team2: fmtSrc(g.t2),
          date: '', startTime: '', location: '', refCount: 2,
        },
      })
    )
  )
  return { bracketId, games }
}

// Wipe every bracket + schedulable B-game for a division (full reset).
async function clearDivision(tournamentId: string, division: string) {
  const brackets = await prisma.bracket.findMany({ where: { tournamentId, division } })
  for (const b of brackets) {
    await prisma.bracketGame.deleteMany({ where: { bracketId: b.id } })
    await prisma.bracket.delete({ where: { id: b.id } })
  }
  await prisma.game.deleteMany({
    where: { tournamentId, division, gameNumber: { startsWith: 'B' } },
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string; division: string } }
) {
  const division = decodeURIComponent(params.division)
  try {
    const brackets = await prisma.bracket.findMany({
      where: { tournamentId: params.id, division },
      include: { games: { orderBy: { gameNumber: 'asc' } } },
      orderBy: { flight: 'asc' },
    })
    // Always return an array of flights (empty when none).
    return NextResponse.json(
      brackets.map((b) => ({ ...b, seeds: JSON.parse(b.seeds || '{}') }))
    )
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
  const body = await req.json()

  try {
    // ── Split a division into flights (cutoff on the seed list) ──────────
    if (body.split) {
      const { cutoff, total, flightA, flightB, seeds = {} } = body.split
      const cut = Math.max(1, Math.min(Number(cutoff) || 1, Number(total) - 1))
      const tot = Math.max(cut + 1, Number(total) || cut + 1)
      const aCount = cut
      const bCount = tot - cut

      const aSeeds: Record<string, string> = {}
      for (let i = 1; i <= aCount; i++) if (seeds[String(i)]) aSeeds[String(i)] = seeds[String(i)]
      const bSeeds: Record<string, string> = {}
      for (let i = 1; i <= bCount; i++) if (seeds[String(cut + i)]) bSeeds[String(i)] = seeds[String(cut + i)]

      const aTemplate = buildTemplate(flightA?.format || 'single', aCount, Math.max(0, Number(flightA?.consolationCount) || 0), !!flightA?.loserConsolation)
      const bTemplate = buildTemplate(flightB?.format || 'single', bCount, Math.max(0, Number(flightB?.consolationCount) || 0), !!flightB?.loserConsolation)

      await clearDivision(params.id, division)
      await createBracketRecords({ tournamentId: params.id, division, flight: 'A', numberOffset: 0, format: flightA?.format || 'single', teamCount: aCount, seeds: aSeeds, template: aTemplate })
      await createBracketRecords({ tournamentId: params.id, division, flight: 'B', numberOffset: aTemplate.length, format: flightB?.format || 'single', teamCount: bCount, seeds: bSeeds, template: bTemplate })

      const brackets = await prisma.bracket.findMany({
        where: { tournamentId: params.id, division },
        include: { games: { orderBy: { gameNumber: 'asc' } } },
        orderBy: { flight: 'asc' },
      })
      return NextResponse.json(brackets.map((b) => ({ ...b, seeds: JSON.parse(b.seeds || '{}') })))
    }

    // ── Single bracket (Flight A) — replaces any existing brackets ───────
    const { format, teamCount, consolationCount = 0, seeds, loserConsolation = false } = body
    const tc = Math.max(2, Number(teamCount) || 2)
    const template = buildTemplate(format, tc, Math.max(0, Number(consolationCount) || 0), !!loserConsolation)

    await clearDivision(params.id, division)
    const { bracketId, games } = await createBracketRecords({
      tournamentId: params.id, division, flight: 'A', numberOffset: 0,
      format, teamCount: tc, seeds: seeds || {}, template,
    })

    return NextResponse.json({
      id: bracketId, tournamentId: params.id, division, format, teamCount: tc,
      flight: 'A', numberOffset: 0, seeds: seeds || {}, games,
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
  const flight = new URL(req.url).searchParams.get('flight') || 'A'
  const body = await req.json()

  try {
    const bracket = await prisma.bracket.findFirst({
      where: { tournamentId: params.id, division, flight },
      include: { games: { orderBy: { gameNumber: 'asc' } } },
    })
    if (!bracket) return NextResponse.json({ error: 'No bracket found' }, { status: 404 })
    const offset = bracket.numberOffset || 0

    if (body.updateLabel !== undefined) {
      const { gameNumber, label } = body.updateLabel
      await prisma.bracketGame.updateMany({ where: { bracketId: bracket.id, gameNumber }, data: { label } })
      return NextResponse.json({ ok: true })
    }

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
      await prisma.game.create({
        data: {
          tournamentId: params.id, division,
          gameNumber: 'B' + (offset + gameNumber),
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

    if (body.removeGame !== undefined) {
      const gameNum = Number(body.removeGame)
      await prisma.bracketGame.deleteMany({ where: { bracketId: bracket.id, gameNumber: gameNum } })
      await prisma.game.deleteMany({
        where: { tournamentId: params.id, division, gameNumber: 'B' + (offset + gameNum) },
      })
      const updated = await prisma.bracket.findFirst({
        where: { id: bracket.id },
        include: { games: { orderBy: { gameNumber: 'asc' } } },
      })
      return NextResponse.json({ ...updated, seeds: JSON.parse(updated!.seeds || '{}') })
    }

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
    await clearDivision(params.id, division)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete bracket' }, { status: 500 })
  }
}
