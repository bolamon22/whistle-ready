import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { redactWorker, stripWorkerUpdate } from '@/lib/roleScope'
// Staff-only since Aug 2026 — these were fully public (anyone with an id could read pay
// handles or edit/delete workers).
export async function GET(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const w = await prisma.worker.findUnique({ where:{id:params.id} })
  if (!w) return NextResponse.json({ error:'Not found' }, { status:404 })
  return NextResponse.json(redactWorker(w, gate.role))
}
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const b = stripWorkerUpdate(await req.json(), gate.role) as any
  // Background-check date (Aug 2026): raw column, not in the Prisma schema.
  // Used by the county Exhibit A affidavit -- re-screen required every 12 months.
  // Mailing address + Venmo/Zelle handles (raw columns) — staff keep all three payment
  // routes on file so payroll can fall back when the preferred one bounces; payMethod
  // marks the preference and payHandle mirrors the preferred handle for old callers.
  const RAW_TEXT_COLS: Array<[string, number]> = [['mailingAddress', 400], ['venmoHandle', 120], ['zelleHandle', 120]]
  for (const [col, max] of RAW_TEXT_COLS) {
    if (b[col] === undefined) continue
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "${col}" TEXT`) } catch { /* exists */ }
    try { await prisma.$executeRawUnsafe(`UPDATE "Worker" SET "${col}" = ? WHERE id = ?`, b[col] ? String(b[col]).slice(0, max) : null, params.id) } catch {}
    delete b[col]
  }
  if (Object.keys(b).length === 0) {
    const w = await prisma.worker.findUnique({ where: { id: params.id } })
    return NextResponse.json(w ? redactWorker(w, gate.role) : { ok: true })
  }
  if (b.bgCheckDate !== undefined) {
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "bgCheckDate" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
    try { await prisma.$executeRawUnsafe(`UPDATE "Worker" SET "bgCheckDate" = ? WHERE id = ?`, String(b.bgCheckDate || '').slice(0, 10), params.id) } catch {}
    const rest = { ...b }; delete rest.bgCheckDate
    if (Object.keys(rest).length === 0) {
      const w = await prisma.worker.findUnique({ where: { id: params.id } })
      return NextResponse.json(w ? redactWorker(w, gate.role) : { ok: true })
    }
  }
  return NextResponse.json(redactWorker(await prisma.worker.update({where:{id:params.id},data:{
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
  }}), gate.role))
}
// Deleting a Worker cascades away their assignments, roster spots, availability, time
// entries and pay records. The Staff Pool button for this used to say "Unassign ... from
// this roster?", so a click meant to drop someone from one event erased their whole
// history. Refuse when anything is attached; duplicates go through Merge, which moves it.
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const [games, roster, pay, time] = await Promise.all([
    prisma.assignment.count({ where: { workerId: params.id } }),
    prisma.rosterEntry.count({ where: { workerId: params.id } }),
    prisma.paymentRecord.count({ where: { workerId: params.id } }),
    prisma.timeEntry.count({ where: { workerId: params.id } }),
  ])
  if (games + roster + pay + time > 0) {
    const parts = [games && `${games} game${games === 1 ? '' : 's'}`, roster && `${roster} event roster${roster === 1 ? '' : 's'}`, pay && `${pay} pay record${pay === 1 ? '' : 's'}`, time && `${time} time entr${time === 1 ? 'y' : 'ies'}`].filter(Boolean).join(', ')
    return NextResponse.json({ error: `Not deleted: this person has ${parts}. Deleting would erase that history. If they're a duplicate, merge them instead; if that history is only on sample events, use the "without email or phone" cleanup in the Staff Pool.` }, { status: 409 })
  }
  await prisma.worker.delete({where:{id:params.id}}); return NextResponse.json({ok:true})
}
