import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGate, requireStaffPay } from '@/lib/apiAuth'
import { payAccess, payKey, payScopeFor } from '@/lib/payScope'
import { payEditsFor, setPayEdit } from '@/lib/payEdit'
import { payFor } from '@/lib/repricePay'
import { parsePayRates } from '@/lib/utils'
import { staffTypeOfWorker } from '@/lib/staffTypeDb'

// Set one game's pay by hand on Staff pay (lib/payEdit; Bo, Oct 22 2026).
// PATCH { pay: number, note? }  -> sets it and keeps it through rate changes
// PATCH { pay: null }           -> back to what the rates give
// -> { pay, edited: { note, by, at, was } | null }
// The director (Head Assigner) and admins, or an assigner for people whose pay at that
// event is all in their pay groups. Not once the person is marked paid at the event:
// their payment was for the old total, so Unpay first. This organization's events only.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  const a = await prisma.assignment.findUnique({
    where: { id: params.id },
    select: { id: true, role: true, payRate: true, workerId: true, worker: { select: { payRateOverride: true, certLevel: true } }, game: { select: { tournamentId: true, tournament: { select: { payRates: true } } } } },
  })
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const tid = a.game.tournamentId
  const away = await orgGate(gate, tid); if (away) return away
  const scope = await payScopeFor(gate.role, gate.userId)
  if (!scope.all) {
    const acc = (await payAccess(scope, [{ workerId: a.workerId, tournamentId: tid }])).get(payKey(a.workerId, tid))
    if (acc?.access !== 'full') return NextResponse.json({ error: 'Only the director can change this person’s pay.' }, { status: 403 })
  }
  // Volunteers and refs in training (lib/staffType) are never paid, so no hand edit either.
  if (await staffTypeOfWorker(a.workerId)) {
    return NextResponse.json({ error: 'Volunteers and refs in training aren’t paid. Change them to Paid in the Staff Pool first.' }, { status: 409 })
  }
  if (await prisma.paymentRecord.findFirst({ where: { workerId: a.workerId, tournamentId: tid }, select: { id: true } })) {
    return NextResponse.json({ error: 'They’re already marked paid at this event. Unpay them first, then change the pay.' }, { status: 409 })
  }
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  if (b.pay === null) {
    const pay = payFor(a.worker, a.role, parsePayRates(a.game.tournament.payRates))
    await prisma.assignment.update({ where: { id: a.id }, data: { payRate: pay } })
    await setPayEdit(a.id, null)
    return NextResponse.json({ pay, edited: null })
  }
  const pay = Math.round(Number(b.pay) * 100) / 100
  if (!Number.isFinite(pay) || pay < 0 || pay > 10000) return NextResponse.json({ error: 'Enter the pay for this game, from $0 to $10,000.' }, { status: 400 })
  const prior = (await payEditsFor([a])).get(a.id)
  const edit = {
    workerId: a.workerId, by: String(gate.session?.user?.name || gate.session?.user?.email || '').slice(0, 120), at: new Date().toISOString(),
    note: String(b.note ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200), was: prior ? prior.was : a.payRate,
  }
  await prisma.assignment.update({ where: { id: a.id }, data: { payRate: pay } })
  await setPayEdit(a.id, edit)
  return NextResponse.json({ pay, edited: { note: edit.note, by: edit.by, at: edit.at, was: edit.was } })
}
