import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getPayRate, parsePayRates } from '@/lib/utils'
import { orgGate, orgGateFor, requireStaff } from '@/lib/apiAuth'
import { canSeeStaffPay, redactWorker } from '@/lib/roleScope'
import { type PayScope, assignmentPayGroups, seesPay } from '@/lib/payGroups'
import { payScopeFor } from '@/lib/payScope'
import { checkInsFor } from '@/lib/staffCheckIn'
import { releaseFilter } from '@/lib/staffReleaseStore'
import { eventSideOf } from '@/lib/eventTeamsStore'
import type { GameGender } from '@/lib/gameGender'
import { actorOf, sendOfficialChanges, spotOf, type OfficialChange } from '@/lib/officialChangeAlerts'
import { staffTypeOfWorker } from '@/lib/staffTypeDb'
import { isTraineeRole } from '@/lib/staffType'

// Staff only. These had no sign-in check: anyone with a tournament id could
// read every official's contact and pay, or assign and unassign games. Pay
// rates and worker pay/contact fields are blanked for roles without them, and
// for an assigner outside their pay groups (Oct 13 2026: the boys' and girls'
// assigners each see their own refs' pay, not each other's or the scorekeepers').
const shape = (a: any, role: string, scope: PayScope, division: string, side: GameGender) => ({
  ...a,
  payRate: canSeeStaffPay(role) && seesPay(scope, assignmentPayGroups(a.role, division, a.worker?.gender, side)) ? a.payRate : null,
  worker: a.worker ? redactWorker(a.worker, role, scope) : a.worker,
})
export async function POST(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  // quiet: the Scheduler handing a moved game to its new field's scorekeeper, which
  // Bo okays on screen. Nobody is messaged about that (scorekeepers work a field).
  const{gameId,workerId,role,quiet}=await req.json()
  const game=await prisma.game.findUnique({where:{id:gameId},include:{tournament:true}})
  if(!game)return NextResponse.json({error:'Game not found'},{status:404})
  // Only games of the organization this login works in, and only its own Staff Pool (lib/orgScope).
  const away = await orgGate(gate, game.tournamentId); if (away) return NextResponse.json({error:'Game not found'},{status:404})
  const worker=await prisma.worker.findUnique({where:{id:workerId}})
  if(!worker || orgGateFor(gate, worker.orgId))return NextResponse.json({error:'Worker not found'},{status:404})
  // Unpaid staff (lib/staffType) work for $0. The TR slot is for a ref in training only.
  const type=await staffTypeOfWorker(worker.id)
  if(isTraineeRole(role)&&type!=='trainee')return NextResponse.json({error:'The TR slot is for a ref in training. Set them to “Ref in training” in the Staff Pool first.'},{status:400})
  const payRates=parsePayRates(game.tournament.payRates)
  const payRate=type?0:worker.payRateOverride??getPayRate(worker.certLevel,role,payRates)
  const scope=await payScopeFor(gate.role,gate.userId)
  // Who held the slot before, so a published official taken off it is told too (lib/officialChangeAlerts).
  const prev=await prisma.assignment.findUnique({where:{gameId_role:{gameId,role}},select:{workerId:true}})
  const saved=await prisma.assignment.upsert({where:{gameId_role:{gameId,role}},create:{gameId,workerId,role,payRate},update:{workerId,payRate},include:{worker:true}})
  if(prev?.workerId!==workerId&&quiet!==true){
    const spot=spotOf(game)
    const changes:OfficialChange[]=[{kind:'added',workerId,role,spot}]
    if(prev?.workerId)changes.push({kind:'removed',workerId:prev.workerId,role,spot})
    await sendOfficialChanges(game.tournamentId,changes,actorOf(gate))
  }
  return NextResponse.json(shape(saved, gate.role, scope, game.division, await eventSideOf(game.tournamentId)),{status:201})
}

export async function GET(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json([], { status: 200 })
  const away = await orgGate(gate, tournamentId); if (away) return away
  const [assignments, games, scope, side] = await Promise.all([
    prisma.assignment.findMany({ where: { game: { tournamentId } }, include: { worker: true } }),
    prisma.game.findMany({ where: { tournamentId }, select: { id: true, division: true } }),
    payScopeFor(gate.role, gate.userId),
    eventSideOf(tournamentId),
  ])
  const division = new Map(games.map(g => [g.id, g.division]))
  // Refs and scorekeepers: only crews the assigner has shown (lib/staffRelease).
  const visible = await releaseFilter(gate.role, [tournamentId])
  const shown = assignments.filter(a => visible(tournamentId, a.role, division.get(a.gameId) ?? ''))
  const checks = await checkInsFor(shown.map(a => a.id))
  return NextResponse.json(shown.map(a => shape({ ...a, gameId: a.gameId, checkedInAt: checks.get(a.id) || null }, gate.role, scope, division.get(a.gameId) ?? '', side)))
}
