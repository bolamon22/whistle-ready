import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; gameId: string } }
) {
  try {
    const body = await req.json()
    const { date, startTime, location, gameNumber } = body

    const updated = await prisma.game.update({
      where: { id: params.gameId, tournamentId: params.id },
      data: {
        ...(date !== undefined && { date }),
        ...(startTime !== undefined && { startTime }),
        ...(location !== undefined && { location }),
        ...(gameNumber !== undefined && { gameNumber }),
      },
    })

    return NextResponse.json(updated)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(
  _: Request,
  { params }: { params: { id: string; gameId: string } }
) {
  try {
    await prisma.game.delete({
      where: { id: params.gameId, tournamentId: params.id },
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
