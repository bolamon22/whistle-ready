import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

// Middleware lets every /api/* request through, so the gate has to live here.
// Without it this route rewrote or deleted any game by id with no login at all —
// scores, times, fields and team names on a live public schedule. requireStaff
// (not requireDirector) because the table workers running the scorekeeper page
// carry staff/ref/scorekeeper roles and must keep working; it only shuts out
// anonymous callers and the coach/parent/club-director roles.
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const b = await req.json()
  return NextResponse.json(await prisma.game.update({ where:{id:params.id}, data:{
    ...(b.score1      !== undefined && { score1:      b.score1===''?null:Number(b.score1) }),
    ...(b.score2      !== undefined && { score2:      b.score2===''?null:Number(b.score2) }),
    ...(b.refCount    !== undefined && { refCount:    Number(b.refCount) }),
    ...(b.isChampionship !== undefined && { isChampionship: Boolean(b.isChampionship) }),
    ...(b.isCanceled  !== undefined && { isCanceled:  Boolean(b.isCanceled) }),
    ...(b.startTime   !== undefined && { startTime:   String(b.startTime) }),
    ...(b.location    !== undefined && { location:    String(b.location) }),
    ...(b.division    !== undefined && { division:    String(b.division) }),
    ...(b.pool        !== undefined && { pool:        b.pool||null }),
    ...(b.team1       !== undefined && { team1:       String(b.team1) }),
    ...(b.team2       !== undefined && { team2:       String(b.team2) }),
    ...(b.gameNumber  !== undefined && { gameNumber:  String(b.gameNumber) }),
    ...(b.date        !== undefined && { date:        String(b.date) }),
  }}))
}

export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  await prisma.game.delete({ where:{id:params.id} })
  return NextResponse.json({ ok:true })
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const game = await prisma.game.findUnique({ where: { id: params.id } })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(game)
}
