import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
export async function GET(_: Request, { params }: { params:{id:string} }) {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN "tiebreakers" TEXT NOT NULL DEFAULT '{}'`) } catch {}
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN "tagline" TEXT DEFAULT ''`) } catch {}
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN "regConfirmationOverride" TEXT DEFAULT ''`) } catch {}
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
  let tagline = ''
  try { const tr = await prisma.$queryRawUnsafe<any[]>('SELECT tagline FROM "Tournament" WHERE id = ?', params.id); tagline = (tr?.[0]?.tagline) || '' } catch {}
  let regConfirmationOverride = ''
  try { const rr = await prisma.$queryRawUnsafe<any[]>('SELECT regConfirmationOverride FROM "Tournament" WHERE id = ?', params.id); regConfirmationOverride = (rr?.[0]?.regConfirmationOverride) || '' } catch {}
  return NextResponse.json({ ...t, tiebreakers, tagline, regConfirmationOverride })
}
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const b = await req.json()
  // Fields that live in the Prisma schema.
  const data: any = {
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
  }
  // Registration-toggle columns live only in the DB (not the Prisma schema), so
  // Prisma can't write them - set them via raw SQL, self-healing the column if missing.
  const raw: Array<[string, string, any]> = []
  if (b.teamRegEnabled!==undefined) raw.push(['teamRegEnabled', 'INTEGER DEFAULT 1', Boolean(b.teamRegEnabled) ? 1 : 0])
  if (b.individualRegEnabled!==undefined) raw.push(['individualRegEnabled', 'INTEGER DEFAULT 0', Boolean(b.individualRegEnabled) ? 1 : 0])
  if (b.individualRegDescription!==undefined) raw.push(['individualRegDescription', "TEXT DEFAULT ''", String(b.individualRegDescription ?? '')])
  if (b.individualRegTiers!==undefined) raw.push(['individualRegTiers', "TEXT DEFAULT '[]'", String(b.individualRegTiers ?? '[]')])
  if (b.individualRegPositions!==undefined) raw.push(['individualRegPositions', "TEXT DEFAULT '[]'", String(b.individualRegPositions ?? '[]')])
  if (b.individualRegSizes!==undefined) raw.push(['individualRegSizes', "TEXT DEFAULT '[]'", String(b.individualRegSizes ?? '[]')])
  if (b.tagline!==undefined) raw.push(['tagline', "TEXT DEFAULT ''", String(b.tagline ?? '')])
  if (b.regConfirmationOverride!==undefined) raw.push(['regConfirmationOverride', "TEXT DEFAULT ''", String(b.regConfirmationOverride ?? '')])
  for (const [col, type] of raw) { try { await prisma.$executeRawUnsafe(`ALTER TABLE "Tournament" ADD COLUMN "${col}" ${type}`) } catch {} }
  for (const [col, , val] of raw) { try { await prisma.$executeRawUnsafe(`UPDATE "Tournament" SET "${col}" = ? WHERE id = ?`, val, params.id) } catch {} }
  const out = Object.keys(data).length
    ? await prisma.tournament.update({ where:{id:params.id}, data })
    : await prisma.tournament.findUnique({ where:{id:params.id} })
  return NextResponse.json(out)
}
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  await prisma.tournament.delete({ where:{id:params.id} }); return NextResponse.json({ ok:true })
}
