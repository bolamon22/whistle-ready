import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getPayRate, parsePayRates } from '@/lib/utils'
export async function POST(req: Request) {
  const{gameId,workerId,role}=await req.json()
  const game=await prisma.game.findUnique({where:{id:gameId},include:{tournament:true}})
  if(!game)return NextResponse.json({error:'Game not found'},{status:404})
  const worker=await prisma.worker.findUnique({where:{id:workerId}})
  if(!worker)return NextResponse.json({error:'Worker not found'},{status:404})
  const payRates=parsePayRates(game.tournament.payRates)
  const payRate=worker.payRateOverride??getPayRate(worker.certLevel,role,payRates)
  return NextResponse.json(await prisma.assignment.upsert({where:{gameId_role:{gameId,role}},create:{gameId,workerId,role,payRate},update:{workerId,payRate},include:{worker:true}}),{status:201})
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json([], { status: 200 })
  const assignments = await prisma.assignment.findMany({
    where: { game: { tournamentId } },
    include: { worker: true },
  })
  return NextResponse.json(assignments.map(a => ({ ...a, gameId: a.gameId })))
}
