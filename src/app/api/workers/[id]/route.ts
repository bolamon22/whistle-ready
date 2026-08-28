import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
// Staff-only since Aug 2026 — these were fully public (anyone with an id could read pay
// handles or edit/delete workers).
export async function GET(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const w = await prisma.worker.findUnique({ where:{id:params.id} })
  if (!w) return NextResponse.json({ error:'Not found' }, { status:404 })
  return NextResponse.json(w)
}
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const b=await req.json()
  // Background-check date (Aug 2026): raw column, not in the Prisma schema.
  // Used by the county Exhibit A affidavit -- re-screen required every 12 months.
  if (b.bgCheckDate !== undefined) {
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "bgCheckDate" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
    try { await prisma.$executeRawUnsafe(`UPDATE "Worker" SET "bgCheckDate" = ? WHERE id = ?`, String(b.bgCheckDate || '').slice(0, 10), params.id) } catch {}
    const rest = { ...b }; delete rest.bgCheckDate
    if (Object.keys(rest).length === 0) {
      const w = await prisma.worker.findUnique({ where: { id: params.id } })
      return NextResponse.json(w ?? { ok: true })
    }
  }
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
    ...(b.notes!==undefined&&{notes:b.notes||null}),...(b.association!==undefined&&{association:b.association}),
    ...(b.photoUrl!==undefined&&{photoUrl:b.photoUrl||null}),
    ...(b.roles!==undefined&&{roles:JSON.stringify(b.roles)}),
  }}))
}
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  await prisma.worker.delete({where:{id:params.id}}); return NextResponse.json({ok:true})
}
