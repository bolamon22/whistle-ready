import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const b=await req.json()
  return NextResponse.json(await prisma.timeEntry.update({where:{id:params.id},data:{...(b.clockIn!==undefined&&{clockIn:b.clockIn}),...(b.clockOut!==undefined&&{clockOut:b.clockOut}),...(b.hoursManual!==undefined&&{hoursManual:b.hoursManual}),...(b.notes!==undefined&&{notes:b.notes}),...(b.isManualEdit!==undefined&&{isManualEdit:b.isManualEdit})},include:{worker:{select:{id:true,name:true,hourlyRate:true}}}}))
}
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  await prisma.timeEntry.delete({where:{id:params.id}}); return NextResponse.json({ok:true})
}
