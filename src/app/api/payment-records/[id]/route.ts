import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGate, requireStaffPay } from '@/lib/apiAuth'
import { payAccess, payKey, payScopeFor } from '@/lib/payScope'
// Staff pay records: these had no sign-in check at all (anyone could read, add or
// delete what each official was paid). An assigner can undo only a record for
// someone whose pay at that event is all in their pay groups (Oct 13 2026).
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  // Only events of the organization this login works in (lib/orgScope).
  const owner = await prisma.paymentRecord.findUnique({ where: { id: params.id }, select: { tournamentId: true } })
  if (owner) { const away = await orgGate(gate, owner.tournamentId); if (away) return away }
  const scope = await payScopeFor(gate.role, gate.userId)
  if (!scope.all) {
    const rec = await prisma.paymentRecord.findUnique({ where: { id: params.id }, select: { workerId: true, tournamentId: true } })
    if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const a = (await payAccess(scope, [rec])).get(payKey(rec.workerId, rec.tournamentId))
    if (a?.access !== 'full') return NextResponse.json({ error: 'Only the director can undo this payment.' }, { status: 403 })
  }
  await prisma.paymentRecord.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
