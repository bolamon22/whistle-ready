import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { setIfNeeded } from '@/lib/ifNeeded'

// Mark or unmark a game as "If needed" (lib/ifNeeded). Staff only.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  let body: any = {}
  try { body = await req.json() } catch { /* empty body */ }
  const gameId = typeof body?.gameId === 'string' ? body.gameId : ''
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const game = await prisma.game.findFirst({ where: { id: gameId, tournamentId: params.id }, select: { id: true } })
  if (!game) return NextResponse.json({ error: 'Game not found in this tournament' }, { status: 404 })
  const ids = await setIfNeeded(params.id, gameId, body?.on !== false)
  return NextResponse.json({ ok: true, ifNeeded: ids })
}
