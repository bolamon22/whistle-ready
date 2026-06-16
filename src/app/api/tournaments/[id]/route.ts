import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
export async function GET(_: Request, { params }: { params:{id:string} }) {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN "tiebreakers" TEXT NOT NULL DEFAULT '{}'`) } catch {}
  const t = await prisma.tournament.findUnique({ where:{id:params.id}, include:{_count:{select:{games:true}}} })
  if (!t) return NextResponse.json({ error:'Not found' }, { status:404 })
  // Effective tiebreakers: the tournament's own, otherwise the saved global default.
  let tiebreakers = (t as any).tiebreakers || '{}'
  try {
    const o = JSON.parse(tiebreakers)
    const hasOwn = Array.isArray(o) ? o.length : (((o.pool||[]).length) || ((o.division||[]).length))
    if (!hasOwn) {
      const def = await prisma.appSetting.findUnique({ where:{ key:'defaultTiebreakers' } }).catch(()=>null)
      if (def && def.value) tiebreakers = def.value
    }
  } catch {}
  return NextResponse.json({ ...t, tiebreakers })
}
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const b = await req.json()
  return NextResponse.json(await prisma.tournament.update({ where:{id:params.id}, data:{
    ...(b.name!==undefined&&{name:b.name}),
    ...(b.sport!==undefined&&{sport:b.sport}),
    ...(b.startDate!==undefined&&{startDate:b.startDate}),
    ...(b.endDate!==undefined&&{endDate:b.endDate}),
    ...(b.location!==undefined&&{location:b.location}),
    ...(b.scheduleIncrement!==undefined&&{scheduleIncrement:Number(b.scheduleIncrement)}),
    ...(b.logoUrl!==undefined&&{logoUrl:b.logoUrl}),
    ...(b.dates!==undefined&&{dates:JSON.stringify(b.dates)}),
    ...(b.payRates!==undefined&&{payRates:JSON.stringify(b.payRates)}),
    ...(b.divisionRules!==undefined&&{divisionRules:JSON.stringify(b.divisionRules)}),
    ...(b.tiebreakers!==undefined&&{tiebreakers:JSON.stringify(b.tiebreakers)}),
    ...(b.registrationPricing!==undefined&&{registrationPricing:b.registrationPricing}),
    ...(b.registrationDivisions!==undefined&&{registrationDivisions:b.registrationDivisions}),
    ...(b.teamRegEnabled!==undefined&&{teamRegEnabled:Boolean(b.teamRegEnabled)}),
    ...(b.individualRegEnabled!==undefined&&{individualRegEnabled:Boolean(b.individualRegEnabled)}),
    ...(b.individualRegDescription!==undefined&&{individualRegDescription:b.individualRegDescription}),
    ...(b.individualRegTiers!==undefined&&{individualRegTiers:b.individualRegTiers}),
    ...(b.individualRegPositions!==undefined&&{individualRegPositions:b.individualRegPositions}),
    ...(b.individualRegSizes!==undefined&&{individualRegSizes:b.individualRegSizes}),
  }}))
}
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  await prisma.tournament.delete({ where:{id:params.id} }); return NextResponse.json({ ok:true })
}
