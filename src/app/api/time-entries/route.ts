import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGate, orgGateFor, requireStaff } from '@/lib/apiAuth'
import { canSeeStaffPay } from '@/lib/roleScope'
import { type PayScope, seesPay, timeEntryPayGroups } from '@/lib/payGroups'
import { payScopeFor } from '@/lib/payScope'
// Staff only (had no sign-in check); the hourly rate rides along only for roles
// that see staff pay, and for an assigner only in their pay groups (Oct 13 2026).
// Only events (and Staff Pool records) of the organization this login works in (lib/orgScope).
const rate = (e: any, role: string, scope: PayScope) => (!e?.worker || (canSeeStaffPay(role) && seesPay(scope, timeEntryPayGroups(e.worker))) ? e : { ...e, worker: { ...e.worker, hourlyRate: null } })
export async function GET(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const{searchParams}=new URL(req.url);const tid=searchParams.get('tournamentId')
  if(!tid)return NextResponse.json({error:'required'},{status:400})
  const away = await orgGate(gate, tid); if (away) return away
  const scope=await payScopeFor(gate.role,gate.userId)
  return NextResponse.json((await prisma.timeEntry.findMany({where:{tournamentId:tid},include:{worker:{select:{id:true,name:true,hourlyRate:true,defaultRole:true,gender:true}}},orderBy:[{date:'asc'},{clockIn:'asc'}]})).map((e: any) => rate(e, gate.role, scope)))
}
export async function POST(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const{workerId,tournamentId,date,clockIn,clockOut,hoursManual,notes,isManualEdit}=await req.json()
  const away = await orgGate(gate, tournamentId); if (away) return away
  const w = workerId ? await prisma.worker.findUnique({ where: { id: String(workerId) } }) : null
  if (w && orgGateFor(gate, w.orgId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const scope=await payScopeFor(gate.role,gate.userId)
  return NextResponse.json(rate(await prisma.timeEntry.create({data:{workerId,tournamentId,date,clockIn,clockOut,hoursManual,notes,isManualEdit:isManualEdit??false},include:{worker:{select:{id:true,name:true,hourlyRate:true,defaultRole:true,gender:true}}}}), gate.role, scope),{status:201})
}
