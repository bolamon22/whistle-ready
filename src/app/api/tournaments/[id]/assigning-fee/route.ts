import { NextResponse } from 'next/server'
import { orgGate, requireDirector, requireStaffPay } from '@/lib/apiAuth'
import { addFeePayment, assigningFeeOf, feePaymentsOf, feeStatus, feeTotal, normalizeFee, normalizeFeePayment, removeFeePayment, saveAssigningFee } from '@/lib/assigningFee'
import { staffedGames } from '@/lib/clientPay'
import { clientsOfEvent } from '@/lib/clientEvents'
import { eventClientOf } from '@/lib/eventClient'
import prisma from '@/lib/db'

// The head assigner's assigning fee on an event (lib/assigningFee), shown with Staff pay
// and in the tournament director's area. GET -> { fee, games, total, clients }: the fee,
// the games it counts and what it comes to, the event's tournament director (their
// name, lib/eventClient) and who of them can log in to see it. The head assigner (and
// admins) also get what the tournament director has paid toward it: { payments,
// status: { paid, due, state } } (Bo, Oct 21 2026). Assigners, who see Staff pay for
// their groups, don't: the fee is the head assigner's own money.
// PUT { amount, per } (the director) -> the same.
// POST { amount, on, method, note } (the director) records a payment -> the same.
// DELETE ?paymentId= (the director) removes one -> the same.

async function answer(id: string, boss: boolean) {
  const [fee, games, ids, contact, payments] = await Promise.all([assigningFeeOf(id), staffedGames(id), clientsOfEvent(id), eventClientOf(id), boss ? feePaymentsOf(id) : Promise.resolve([])])
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : []
  const total = feeTotal(fee, games)
  return {
    fee, games, total, contact, clients: users.map(u => ({ id: u.id, name: u.name, email: u.email })),
    ...(boss ? { payments, status: feeStatus(total, payments) } : {}),
  }
}

const isBoss = (role: string) => role === 'admin' || role === 'director'
const byOf = (gate: { session?: any }) => String(gate.session?.user?.name || gate.session?.user?.email || '')
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  const away = await orgGate(gate, params.id); if (away) return away
  return NextResponse.json(await answer(params.id, isBoss(gate.role)))
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const away = await orgGate(gate, params.id); if (away) return away
  const b = await req.json().catch(() => ({}))
  await saveAssigningFee(params.id, normalizeFee(b), byOf(gate))
  return NextResponse.json(await answer(params.id, true))
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const away = await orgGate(gate, params.id); if (away) return away
  const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const p = normalizeFeePayment(await req.json().catch(() => ({})), today())
  if (!p) return NextResponse.json({ error: 'Enter the amount they paid.' }, { status: 400 })
  await addFeePayment(params.id, p, byOf(gate))
  return NextResponse.json(await answer(params.id, true), { status: 201 })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const away = await orgGate(gate, params.id); if (away) return away
  const paymentId = new URL(req.url).searchParams.get('paymentId') || ''
  if (!paymentId || !(await removeFeePayment(params.id, paymentId))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(await answer(params.id, true))
}
