import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGate, requireStaff } from '@/lib/apiAuth'
import { canSeeStaffPay } from '@/lib/roleScope'
import { type PayScope, seesPay, timeEntryPayGroups } from '@/lib/payGroups'
import { payScopeFor } from '@/lib/payScope'
// Staff only (had no sign-in check); the hourly rate rides along only for roles
// that see staff pay, and for an assigner only in their pay groups (Oct 13 2026).
// Only events of the organization this login works in (lib/orgScope).
async function otherOrg(gate: Parameters<typeof orgGate>[0], id: string) {
  const e = await prisma.timeEntry.findUnique({ where: { id }, select: { tournamentId: true } })
  return e ? orgGate(gate, e.tournamentId) : null
}
const rate = (e: any, role: string, scope: PayScope) => (!e?.worker || (canSeeStaffPay(role) && seesPay(scope, timeEntryPayGroups(e.worker))) ? e : { ...e, worker: { ...e.worker, hourlyRate: null } })
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const away = await otherOrg(gate, params.id); if (away) return away
  const b=await req.json()
  const scope=await payScopeFor(gate.role,gate.userId)
  return NextResponse.json(rate(await prisma.timeEntry.update({where:{id:params.id},data:{...(b.clockIn!==undefined&&{clockIn:b.clockIn}),...(b.clockOut!==undefined&&{clockOut:b.clockOut}),...(b.hoursManual!==undefined&&{hoursManual:b.hoursManual}),...(b.notes!==undefined&&{notes:b.notes}),...(b.isManualEdit!==undefined&&{isManualEdit:b.isManualEdit})},include:{worker:{select:{id:true,name:true,hourlyRate:true,defaultRole:true,gender:true}}}}), gate.role, scope))
}
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const away = await otherOrg(gate, params.id); if (away) return away
  await prisma.timeEntry.delete({where:{id:params.id}}); return NextResponse.json({ok:true})
}
