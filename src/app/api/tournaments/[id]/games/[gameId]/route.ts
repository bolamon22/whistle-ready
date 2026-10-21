import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { actorOf, gameMoveChanges, sendOfficialChanges, spotOf, type OfficialChange } from '@/lib/officialChangeAlerts'
import { keepScorekeeperOnField } from '@/lib/fieldScorekeeper'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; gameId: string } }
) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const { date, startTime, location, gameNumber } = body
    // Officials on this game hear about a move once their crew is published (lib/officialChangeAlerts).
    const before = await prisma.game.findFirst({ where: { id: params.gameId, tournamentId: params.id }, include: { assignments: { select: { workerId: true, role: true } } } })

    const updated = await prisma.game.update({
      where: { id: params.gameId, tournamentId: params.id },
      data: {
        ...(date !== undefined && { date }),
        ...(startTime !== undefined && { startTime }),
        ...(location !== undefined && { location }),
        ...(gameNumber !== undefined && { gameNumber }),
      },
    })
    if (before) {
      // The scorekeeper stays with the field, not the game (lib/fieldScorekeeper).
      const sk = await keepScorekeeperOnField(before, updated)
      const moves = gameMoveChanges(before, updated).filter(c => !(sk.handled && c.role === 'scorekeeper'))
      await sendOfficialChanges(params.id, [...moves, ...sk.changes], actorOf(gate))
    }

    return NextResponse.json(updated)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: { id: string; gameId: string } }
) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const before = await prisma.game.findFirst({ where: { id: params.gameId, tournamentId: params.id }, include: { assignments: { select: { workerId: true, role: true } } } })
    await prisma.game.delete({
      where: { id: params.gameId, tournamentId: params.id },
    })
    if (before?.assignments.length) {
      const spot = spotOf(before)
      await sendOfficialChanges(params.id, before.assignments.map((a): OfficialChange => ({ kind: 'removed', workerId: a.workerId, role: a.role, spot })), actorOf(gate))
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
