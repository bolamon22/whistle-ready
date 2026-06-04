import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(_: Request, { params }: { params:{id:string} }) {
  return NextResponse.json(await prisma.game.findMany({
    where: { tournamentId: params.id },
    orderBy: [{ date:'asc' },{ startTime:'asc' },{ location:'asc' }],
    include: { assignments:{ include:{ worker:true } } },
  }))
}

export async function POST(req: Request, { params }: { params:{id:string} }) {
  const b = await req.json()
  const game = await prisma.game.create({ data:{
    tournamentId: params.id,
    gameNumber:   String(b.gameNumber ?? ''),
    date:         String(b.date),
    startTime:    String(b.startTime),
    division:     String(b.division ?? ''),
    pool:         b.pool || null,
    location:     String(b.location ?? ''),
    team1:        String(b.team1 ?? 'TBD'),
    team2:        String(b.team2 ?? 'TBD'),
    refCount:     Number(b.refCount ?? 2),
    isChampionship: Boolean(b.isChampionship),
  }})
  return NextResponse.json(game, { status:201 })
}
