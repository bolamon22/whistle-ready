import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
export async function GET(_: Request, { params }: { params:{id:string} }) {
  const t = await prisma.tournament.findUnique({ where:{id:params.id}, include:{_count:{select:{games:true}}} })
  if (!t) return NextResponse.json({ error:'Not found' }, { status:404 })
  return NextResponse.json(t)
}
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const b = await req.json()
  return NextResponse.json(await prisma.tournament.update({ where:{id:params.id}, data:{
    ...(b.name!==undefined&&{name:b.name}),
    ...(b.sport!==undefined&&{sport:b.sport}),
    ...(b.startDate!==undefined&&{startDate:b.startDate}),
    ...(b.endDate!==undefined&&{endDate:b.endDate}),
    ...(b.location!==undefined&&{location:b.location}),
    ...(b.logoUrl!==undefined&&{logoUrl:b.logoUrl}),
    ...(b.dates!==undefined&&{dates:JSON.stringify(b.dates)}),
    ...(b.payRates!==undefined&&{payRates:JSON.stringify(b.payRates)}),
    ...(b.divisionRules!==undefined&&{divisionRules:JSON.stringify(b.divisionRules)}),
    ...(b.registrationPricing!==undefined&&{registrationPricing:b.registrationPricing}),
    ...(b.registrationDivisions!==undefined&&{registrationDivisions:b.registrationDivisions}),
    ...(b.venues!==undefined&&{venues:b.venues}),
  }}))
}
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  await prisma.tournament.delete({ where:{id:params.id} }); return NextResponse.json({ ok:true })
}
