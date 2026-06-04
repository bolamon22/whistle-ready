import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
export async function GET(_: Request, { params }: { params:{id:string} }) {
  const w = await prisma.worker.findUnique({ where:{id:params.id} })
  if (!w) return NextResponse.json({ error:'Not found' }, { status:404 })
  return NextResponse.json(w)
}
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const b=await req.json()
  return NextResponse.json(await prisma.worker.update({where:{id:params.id},data:{
    ...(b.name!==undefined&&{name:b.name}),
    ...(b.email!==undefined&&{email:b.email||null}),
    ...(b.phone!==undefined&&{phone:b.phone||null}),
    ...(b.certLevel!==undefined&&{certLevel:b.certLevel}),
    ...(b.defaultRole!==undefined&&{defaultRole:b.defaultRole}),
    ...(b.isAssigner!==undefined&&{isAssigner:b.isAssigner}),
    ...(b.gender!==undefined&&{gender:b.gender}),
    ...(b.payRateOverride!==undefined&&{payRateOverride:b.payRateOverride??null}),
    ...(b.hourlyRate!==undefined&&{hourlyRate:b.hourlyRate??null}),
    ...(b.payMethod!==undefined&&{payMethod:b.payMethod}),
    ...(b.payHandle!==undefined&&{payHandle:b.payHandle||null}),
    ...(b.notes!==undefined&&{notes:b.notes||null}),
    ...(b.photoUrl!==undefined&&{photoUrl:b.photoUrl||null}),
    ...(b.roles!==undefined&&{roles:JSON.stringify(b.roles)}),
  }}))
}
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  await prisma.worker.delete({where:{id:params.id}}); return NextResponse.json({ok:true})
}
