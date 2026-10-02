import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { canSeeStaffPay } from '@/lib/roleScope'
// Staff only (had no sign-in check); the hourly rate rides along only for roles
// that see staff pay.
const rate = (e: any, role: string) => (canSeeStaffPay(role) || !e?.worker ? e : { ...e, worker: { ...e.worker, hourlyRate: null } })
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const b=await req.json()
  return NextResponse.json(rate(await prisma.timeEntry.update({where:{id:params.id},data:{...(b.clockIn!==undefined&&{clockIn:b.clockIn}),...(b.clockOut!==undefined&&{clockOut:b.clockOut}),...(b.hoursManual!==undefined&&{hoursManual:b.hoursManual}),...(b.notes!==undefined&&{notes:b.notes}),...(b.isManualEdit!==undefined&&{isManualEdit:b.isManualEdit})},include:{worker:{select:{id:true,name:true,hourlyRate:true}}}}), gate.role))
}
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  await prisma.timeEntry.delete({where:{id:params.id}}); return NextResponse.json({ok:true})
}
