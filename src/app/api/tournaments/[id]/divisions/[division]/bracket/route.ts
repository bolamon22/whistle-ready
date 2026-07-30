import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTemplate } from '@/lib/bracketTemplates'
import { requireStaff } from '@/lib/apiAuth'

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
  const winnerFeeders = (g: Gen) => [g.t1, g.t2].filter(s => s.startsWith('winner:')).map(s => parseInt(s.split(':')[1]))
  // Two consolation entrants could replay their last game if one game's winner
  // feeds the other (e.g. L-B3 vs L-B4 where B3's winner plays in B4). Avoid those.
  const conflict = (a: Gen, b: Gen) => winnerFeeders(a).includes(b.gameNumber) || winnerFeeders(b).includes(a.gameNumber)
  const strength = (g: Gen) => { const s = [g.t1, g.t2].filter(isSeed).map(seedNum); return s.length ? Math.min(...s) : 999 }
  const both = (g: Gen) => isSeed(g.t1) && isSeed(g.t2)
  // Candidate games are those whose loser is owed a 2nd game (round-1 games and
  // the first game a bye seed plays). Pair them strongest-first, skipping rematches.
  const candidates = games.filter(g => isSeed(g.t1) || isSeed(g.t2)).sort((a, b) => strength(a) - strength(b))
  const extra: Gen[] = []
  const used = new Set<number>()
  let cn = 1
  const consTotal = Math.floor(candidates.length / 2)
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i]
    if (used.has(a.gameNumber)) continue
    let partner: Gen | null = null
    for (let j = i + 1; j < candidates.length; j++) { const b = candidates[j]; if (used.has(b.gameNumber)) continue; if (!conflict(a, b)) { partner = b; break } }
    if (!partner) { for (let j = i + 1; j < candidates.length; j++) { const b = candidates[j]; if (!used.has(b.gameNumber)) { partner = b; break } } }
    if (partner) {
      used.add(a.gameNumber); used.add(partner.gameNumber)
      const guaranteed = both(a) && both(partner)
      extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${a.gameNumber}`, t2: `loser:${partner.gameNumber}`, label: guaranteed ? (consTotal > 1 ? `Consolation ${cn++}` : 'Consolation') : 'If needed' })
    }
  }
  // Odd leftover: a contingency game against a non-conflicting opponent.
  const leftover = candidates.find(g => !used.has(g.gameNumber))
  if (leftover) {
    const opp = candidates.find(g => g.gameNumber !== leftover.gameNumber && !conflict(leftover, g)) || candidates.find(g => g.gameNumber !== leftover.gameNumber)
    if (opp) extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${leftover.gameNumber}`, t2: `loser:${opp.gameNumber}`, label: 'If needed' })
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
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
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
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
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

    if (body.editGame) {
      const { gameNumber, t1Source, t2Source } = body.editGame
      const bdata: any = {}
      if (t1Source !== undefined) bdata.team1Source = t1Source
      if (t2Source !== undefined) bdata.team2Source = t2Source
      if (Object.keys(bdata).length) await prisma.bracketGame.updateMany({ where: { bracketId: bracket.id, gameNumber }, data: bdata })
      const gdata: any = {}
      if (t1Source !== undefined) gdata.team1 = fmtSrc(t1Source)
      if (t2Source !== undefined) gdata.team2 = fmtSrc(t2Source)
      if (Object.keys(gdata).length) await prisma.game.updateMany({ where: { tournamentId: params.id, division, gameNumber: 'B' + (offset + gameNumber) }, data: gdata })
      const updated = await prisma.bracket.findFirst({ where: { id: bracket.id }, include: { games: { orderBy: { gameNumber: 'asc' } } } })
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
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const division = decodeURIComponent(params.division)
  try {
    await clearDivision(params.id, division)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete bracket' }, { status: 500 })
  }
}
