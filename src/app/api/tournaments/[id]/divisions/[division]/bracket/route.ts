import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { buildTemplate, type Gen } from '@/lib/bracketGen'
import { bracketSrcLabel } from '@/lib/bracketPlaceholders'
import { requireStaff, isStaffRequest } from '@/lib/apiAuth'
import { isNoBracket } from '@/lib/divisionPlan'
import { getPublicVisibility } from '@/lib/publicView'
import { refsLookup } from '@/lib/refRules'

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

// Placeholder teams on the schedulable rows, in the schedule's B numbers (Flight B's
// "winner:3" is W-B<3 + offset>, not Flight A's W-B3). See lib/bracketPlaceholders.
const fmtSrc = (src: string, offset = 0) => bracketSrcLabel(src, offset)

// Persist one bracket (Bracket row + BracketGame rows + schedulable Game rows).
// numberOffset shifts the schedulable "B#" so flights never collide (Flight A
// uses B1..Ba, Flight B continues B(a+1)..).
async function createBracketRecords(opts: {
  tournamentId: string; division: string; flight: string; numberOffset: number;
  format: string; teamCount: number; seeds: Record<string, string>; template: Gen[]
}) {
  const { tournamentId, division, flight, numberOffset, format, teamCount, seeds, template } = opts
  const bracketId = genId()
  const refsFor = await refsLookup(tournamentId)   // Officials rule (lib/refRules)
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
          team1: fmtSrc(g.t1, numberOffset), team2: fmtSrc(g.t2, numberOffset),
          date: '', startTime: '', location: '', refCount: refsFor(division, g.section === 'championship'),
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
    // The public gets brackets with the schedule. Before that, once Teams & pools is
    // public, it gets the format only (Bo, Oct 11 2026: "show the bracket preview, even
    // though they're not populated with the teams ... even when the schedule is not
    // released. This would help people understand the format"): each game and where
    // its teams come from (Seed 3, W-B1). Never the seeds' team names, which would be
    // matchups, or the games' teams, results, times and fields.
    let formatOnly = false
    if (!(await isStaffRequest())) {
      const vis = await getPublicVisibility(params.id)
      if (vis.schedule !== 'live') {
        if (vis.pools !== 'live') return NextResponse.json([])
        formatOnly = true
      }
    }
    const brackets = await prisma.bracket.findMany({
      where: { tournamentId: params.id, division },
      include: { games: { orderBy: { gameNumber: 'asc' } } },
      orderBy: { flight: 'asc' },
    })
    // Always return an array of flights (empty when none).
    if (formatOnly) {
      return NextResponse.json(brackets.map((b) => ({
        id: b.id, division: b.division, format: b.format, teamCount: b.teamCount, flight: b.flight,
        numberOffset: b.numberOffset, seeds: {}, preview: true,
        games: b.games.map((g) => ({
          id: g.id, gameNumber: g.gameNumber, round: g.round, section: g.section,
          team1Source: g.team1Source, team2Source: g.team2Source, label: g.label,
        })),
      })))
    }
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

  // Pool play only (the Bracket tab's checkbox, lib/divisionPlan): no bracket for this
  // division from any page -- Generate all, the Bracket tab, the old bracket page.
  if (await isNoBracket(params.id, division)) {
    return NextResponse.json({ error: `${division} is set to pool play only (no bracket). To build one, open its Bracket tab and click "This division has a bracket after all".`, noBracket: true }, { status: 409 })
  }

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
          team1: fmtSrc(t1Source, offset), team2: fmtSrc(t2Source, offset),
          date: '', startTime: '', location: '', refCount: (await refsLookup(params.id))(division, section === 'championship'),
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
      if (t1Source !== undefined) gdata.team1 = fmtSrc(t1Source, offset)
      if (t2Source !== undefined) gdata.team2 = fmtSrc(t2Source, offset)
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
