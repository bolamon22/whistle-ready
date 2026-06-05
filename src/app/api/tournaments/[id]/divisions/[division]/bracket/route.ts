import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getTemplate } from '@/lib/bracketTemplates'

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
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
  const { format, teamCount, seeds } = await req.json()

  const template = getTemplate(format, teamCount)
  if (!template)
    return NextResponse.json({ error: `No template for ${format}-${teamCount}` }, { status: 400 })

  try {
    const existing = await prisma.bracket.findFirst({
      where: { tournamentId: params.id, division },
    })
    if (existing) {
      await prisma.bracketGame.deleteMany({ where: { bracketId: existing.id } })
      await prisma.bracket.delete({ where: { id: existing.id } })
    }

    const bracketId = genId()
    await prisma.bracket.create({
      data: { id: bracketId, tournamentId: params.id, division, format, teamCount, seeds: JSON.stringify(seeds || {}) },
    })

    const games = await Promise.all(
      template.map((g) =>
        prisma.bracketGame.create({
          data: {
            id: genId(), bracketId,
            gameNumber: g.gameNumber, round: g.round, section: g.section,
            team1Source: g.t1, team2Source: g.t2, label: g.label || '',
            team1: '', team2: '', winner: '', loser: '', field: '', startTime: '', gameDate: '',
          },
        })
      )
    )

    return NextResponse.json({ id: bracketId, tournamentId: params.id, division, format, teamCount, seeds: seeds || {}, games })
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
  const { seeds } = await req.json()
  try {
    const bracket = await prisma.bracket.findFirst({ where: { tournamentId: params.id, division } })
    if (!bracket) return NextResponse.json({ error: 'No bracket found' }, { status: 404 })
    await prisma.bracket.update({ where: { id: bracket.id }, data: { seeds: JSON.stringify(seeds) } })
    return NextResponse.json({ ok: true, seeds })
  } catch {
    return NextResponse.json({ error: 'Failed to update seeds' }, { status: 500 })
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
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete bracket' }, { status: 500 })
  }
}
