import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getPayRate, parsePayRates } from '@/lib/utils'
import { requireStaff } from '@/lib/apiAuth'
import { canSeeStaffPay, redactWorker } from '@/lib/roleScope'

// Staff only. These had no sign-in check: anyone with a tournament id could
// read every official's contact and pay, or assign and unassign games. Pay
// rates and worker pay/contact fields are blanked for roles without them.
const shape = (a: any, role: string) => ({ ...a, payRate: canSeeStaffPay(role) ? a.payRate : null, worker: a.worker ? redactWorker(a.worker, role) : a.worker })
export async function POST(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const{gameId,workerId,role}=await req.json()
  const game=await prisma.game.findUnique({where:{id:gameId},include:{tournament:true}})
  if(!game)return NextResponse.json({error:'Game not found'},{status:404})
  const worker=await prisma.worker.findUnique({where:{id:workerId}})
  if(!worker)return NextResponse.json({error:'Worker not found'},{status:404})
  const payRates=parsePayRates(game.tournament.payRates)
  const payRate=worker.payRateOverride??getPayRate(worker.certLevel,role,payRates)
  return NextResponse.json(shape(await prisma.assignment.upsert({where:{gameId_role:{gameId,role}},create:{gameId,workerId,role,payRate},update:{workerId,payRate},include:{worker:true}}), gate.role),{status:201})
}

export async function GET(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json([], { status: 200 })
  const assignments = await prisma.assignment.findMany({
    where: { game: { tournamentId } },
    include: { worker: true },
  })
  return NextResponse.json(assignments.map(a => shape({ ...a, gameId: a.gameId }, gate.role)))
}
