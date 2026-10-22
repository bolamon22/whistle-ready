import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGateFor, requireStaff } from '@/lib/apiAuth'
import { redactWorker, stripWorkerUpdate, fieldDirectorSees } from '@/lib/roleScope'
import { payScopeFor } from '@/lib/payScope'
import { setRefLevel, refLevelsFor } from '@/lib/refLevelDb'
import { repriceWorker } from '@/lib/repricePay'
// Staff-only since Aug 2026 — these were fully public (anyone with an id could read pay
// handles or edit/delete workers). An assigner reads and edits pay only for staff in
// their pay groups (lib/payGroups, Oct 13 2026). A director, scheduler, assigner or
// field director reaches only the Staff Pool of the organization they're working in
// (lib/orgScope).
async function otherOrg(gate: Parameters<typeof orgGateFor>[0], id: string) {
  const w = await prisma.worker.findUnique({ where: { id }, select: { orgId: true } })
  return !w ? NextResponse.json({ error: 'Not found' }, { status: 404 }) : orgGateFor(gate, w.orgId)
}
export async function GET(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const [w, scope] = await Promise.all([prisma.worker.findUnique({ where:{id:params.id} }), payScopeFor(gate.role, gate.userId)])
  // A field director sees only scorekeepers, athletic trainers and field ops.
  if (!w || orgGateFor(gate, w.orgId) || (gate.role === 'field_director' && !fieldDirectorSees(w))) return NextResponse.json({ error:'Not found' }, { status:404 })
  // Ref level (lib/refLevel) is a raw column Prisma doesn't read; redactWorker blanks
  // it for anyone who doesn't see this person's pay.
  const refLevel = (await refLevelsFor([w.id]).catch(() => new Map<string, number>())).get(w.id) ?? null
  return NextResponse.json(redactWorker({ ...w, refLevel }, gate.role, scope))
}
export async function PATCH(req: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  // Field directors invite and roster staff; the Staff Pool records are the director's.
  if (gate.role === 'field_director') return NextResponse.json({ error: 'Ask your director to change Staff Pool details.' }, { status: 403 })
  const away = await otherOrg(gate, params.id); if (away) return away
  const scope = await payScopeFor(gate.role, gate.userId)
  // Pay groups go by the record as stored, so an assigner can't move someone into
  // their groups and set the pay in the same save.
  const stored = scope.all ? null : await prisma.worker.findUnique({ where: { id: params.id }, select: { roles: true, defaultRole: true, gender: true } })
  const b = stripWorkerUpdate(await req.json(), gate.role, scope, stored) as any
  // Background-check date (Aug 2026): raw column, not in the Prisma schema.
  // Used by the county Exhibit A affidavit -- re-screen required every 12 months.
  // Mailing address + Venmo/Zelle handles (raw columns) — staff keep all three payment
  // routes on file so payroll can fall back when the preferred one bounces; payMethod
  // marks the preference and payHandle mirrors the preferred handle for old callers.
  const RAW_TEXT_COLS: Array<[string, number]> = [['mailingAddress', 400], ['venmoHandle', 120], ['zelleHandle', 120], ['referredBy', 120]]
  for (const [col, max] of RAW_TEXT_COLS) {
    if (b[col] === undefined) continue
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "${col}" TEXT`) } catch { /* exists */ }
    try { await prisma.$executeRawUnsafe(`UPDATE "Worker" SET "${col}" = ? WHERE id = ?`, b[col] ? String(b[col]).slice(0, max) : null, params.id) } catch {}
    delete b[col]
  }
  // Ref level (lib/refLevel, Oct 15 2026): a raw INTEGER column. stripWorkerUpdate has
  // already dropped it for anyone who doesn't see this person's pay.
  if (b.refLevel !== undefined) {
    await setRefLevel(params.id, b.refLevel)
    delete b.refLevel
  }
  // Association: a raw column too. It left the Prisma schema on Jun 9 (ee0e621), so
  // passing it to prisma.worker.update threw "Unknown argument" and every Staff Pool
  // save failed. NOT NULL DEFAULT '' (the schema it was made from), so '' not null.
  if (b.association !== undefined) {
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "association" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
    try { await prisma.$executeRawUnsafe(`UPDATE "Worker" SET "association" = ? WHERE id = ?`, String(b.association ?? '').trim().slice(0, 120), params.id) } catch (e) { console.error('worker association', e) }
    delete b.association
  }
  if (Object.keys(b).length === 0) {
    const w = await prisma.worker.findUnique({ where: { id: params.id } })
    return NextResponse.json(w ? redactWorker(w, gate.role, scope) : { ok: true })
  }
  if (b.bgCheckDate !== undefined) {
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "bgCheckDate" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
    try { await prisma.$executeRawUnsafe(`UPDATE "Worker" SET "bgCheckDate" = ? WHERE id = ?`, String(b.bgCheckDate || '').slice(0, 10), params.id) } catch {}
    const rest = { ...b }; delete rest.bgCheckDate
    if (Object.keys(rest).length === 0) {
      const w = await prisma.worker.findUnique({ where: { id: params.id } })
      return NextResponse.json(w ? redactWorker(w, gate.role, scope) : { ok: true })
    }
  }
  // The staff lists read Worker with raw SQL, where isAssigner is 0/1, and the edit forms
  // send that back. Prisma takes only a boolean: "Expected Boolean ..., provided Int" was
  // the "Failed" on every Staff roster and Staff Pool save that didn't touch the box.
  const toBool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true'
  try {
  const updated = await prisma.worker.update({where:{id:params.id},data:{
    ...(b.name!==undefined&&{name:b.name}),
    ...(b.email!==undefined&&{email:b.email||null}),
    ...(b.phone!==undefined&&{phone:b.phone||null}),
    ...(b.certLevel!==undefined&&{certLevel:b.certLevel}),
    ...(b.defaultRole!==undefined&&{defaultRole:b.defaultRole}),
    ...(b.isAssigner!==undefined&&{isAssigner:toBool(b.isAssigner)}),
    ...(b.gender!==undefined&&{gender:b.gender}),
    ...(b.payRateOverride!==undefined&&{payRateOverride:b.payRateOverride??null}),
    ...(b.hourlyRate!==undefined&&{hourlyRate:b.hourlyRate??null}),
    ...(b.payMethod!==undefined&&{payMethod:b.payMethod}),
    ...(b.payHandle!==undefined&&{payHandle:b.payHandle||null}),
    ...(b.notes!==undefined&&{notes:b.notes||null}),
    ...(b.photoUrl!==undefined&&{photoUrl:b.photoUrl||null}),
    ...(b.roles!==undefined&&{roles:JSON.stringify(b.roles)}),
  }})
  // A new Pay Rate Override or certification reaches games already assigned and not yet
  // paid (lib/repricePay; James Vacco, Oct 22 2026). Never blocks the save.
  if (b.payRateOverride!==undefined||b.certLevel!==undefined) await repriceWorker(params.id).catch(e=>console.error('reprice worker',e))
  return NextResponse.json(redactWorker(updated, gate.role, scope))
  } catch (e) {
    console.error('worker update', e)
    return NextResponse.json({ error: 'That didn’t save. Please try again.' }, { status: 500 })
  }
}
// Deleting a Worker cascades away their assignments, roster spots, availability, time
// entries and pay records. The Staff Pool button for this used to say "Unassign ... from
// this roster?", so a click meant to drop someone from one event erased their whole
// history. Refuse when anything is attached; duplicates go through Merge, which moves it.
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (gate.role === 'field_director') return NextResponse.json({ error: 'Ask your director to remove Staff Pool records.' }, { status: 403 })
  const away = await otherOrg(gate, params.id); if (away) return away
  const [games, roster, pay, time] = await Promise.all([
    prisma.assignment.count({ where: { workerId: params.id } }),
    prisma.rosterEntry.count({ where: { workerId: params.id } }),
    prisma.paymentRecord.count({ where: { workerId: params.id } }),
    prisma.timeEntry.count({ where: { workerId: params.id } }),
  ])
  if (games + roster + pay + time > 0) {
    const parts = [games && `${games} game${games === 1 ? '' : 's'}`, roster && `${roster} event roster${roster === 1 ? '' : 's'}`, pay && `${pay} pay record${pay === 1 ? '' : 's'}`, time && `${time} time entr${time === 1 ? 'y' : 'ies'}`].filter(Boolean).join(', ')
    return NextResponse.json({ error: `Not deleted: this person has ${parts}. Deleting would erase that history. If they're a duplicate, merge them instead; if that history is only on sample events, use the "without email" cleanup in the Staff Pool.` }, { status: 409 })
  }
  await prisma.worker.delete({where:{id:params.id}}); return NextResponse.json({ok:true})
}
