import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getPayRate, parsePayRates } from '@/lib/utils'
import { requireStaff } from '@/lib/apiAuth'
import { canSeeStaffPay, redactWorker } from '@/lib/roleScope'
import { type PayScope, assignmentPayGroups, seesPay } from '@/lib/payGroups'
import { payScopeFor } from '@/lib/payScope'
import { checkInsFor } from '@/lib/staffCheckIn'
import { releaseFilter } from '@/lib/staffReleaseStore'

// Staff only. These had no sign-in check: anyone with a tournament id could
// read every official's contact and pay, or assign and unassign games. Pay
// rates and worker pay/contact fields are blanked for roles without them, and
// for an assigner outside their pay groups (Oct 13 2026: the boys' and girls'
// assigners each see their own refs' pay, not each other's or the scorekeepers').
const shape = (a: any, role: string, scope: PayScope, division: string) => ({
  ...a,
  payRate: canSeeStaffPay(role) && seesPay(scope, assignmentPayGroups(a.role, division, a.worker?.gender)) ? a.payRate : null,
  worker: a.worker ? redactWorker(a.worker, role, scope) : a.worker,
})
export async function POST(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const{gameId,workerId,role}=await req.json()
  const game=await prisma.game.findUnique({where:{id:gameId},include:{tournament:true}})
  if(!game)return NextResponse.json({error:'Game not found'},{status:404})
  const worker=await prisma.worker.findUnique({where:{id:workerId}})
  if(!worker)return NextResponse.json({error:'Worker not found'},{status:404})
  const payRates=parsePayRates(game.tournament.payRates)
  const payRate=worker.payRateOverride??getPayRate(worker.certLevel,role,payRates)
  const scope=await payScopeFor(gate.role,gate.userId)
  return NextResponse.json(shape(await prisma.assignment.upsert({where:{gameId_role:{gameId,role}},create:{gameId,workerId,role,payRate},update:{workerId,payRate},include:{worker:true}}), gate.role, scope, game.division),{status:201})
}

export async function GET(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json([], { status: 200 })
  const [assignments, games, scope] = await Promise.all([
    prisma.assignment.findMany({ where: { game: { tournamentId } }, include: { worker: true } }),
    prisma.game.findMany({ where: { tournamentId }, select: { id: true, division: true } }),
    payScopeFor(gate.role, gate.userId),
  ])
  const division = new Map(games.map(g => [g.id, g.division]))
  // Refs and scorekeepers: only crews the assigner has shown (lib/staffRelease).
  const visible = await releaseFilter(gate.role, [tournamentId])
  const shown = assignments.filter(a => visible(tournamentId, a.role, division.get(a.gameId) ?? ''))
  const checks = await checkInsFor(shown.map(a => a.id))
  return NextResponse.json(shown.map(a => shape({ ...a, gameId: a.gameId, checkedInAt: checks.get(a.id) || null }, gate.role, scope, division.get(a.gameId) ?? '')))
}
