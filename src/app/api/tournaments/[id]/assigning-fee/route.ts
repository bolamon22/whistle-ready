import { NextResponse } from 'next/server'
import { orgGate, requireDirector, requireStaffPay } from '@/lib/apiAuth'
import { assigningFeeOf, feeTotal, normalizeFee, saveAssigningFee } from '@/lib/assigningFee'
import { staffedGames } from '@/lib/clientPay'
import { clientsOfEvent } from '@/lib/clientEvents'
import prisma from '@/lib/db'

// The head assigner's assigning fee on an event (lib/assigningFee), shown with Staff pay
// and in the tournament director's area. GET -> { fee, games, total, clients }: the fee,
// the games it counts and what it comes to, and the event's tournament directors.
// PUT { amount, per } (the director) -> the same.

async function answer(id: string) {
  const [fee, games, ids] = await Promise.all([assigningFeeOf(id), staffedGames(id), clientsOfEvent(id)])
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : []
  return { fee, games, total: feeTotal(fee, games), clients: users.map(u => ({ id: u.id, name: u.name, email: u.email })) }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  const away = await orgGate(gate, params.id); if (away) return away
  return NextResponse.json(await answer(params.id))
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const away = await orgGate(gate, params.id); if (away) return away
  const b = await req.json().catch(() => ({}))
  const by = String(gate.session?.user?.name || gate.session?.user?.email || '')
  await saveAssigningFee(params.id, normalizeFee(b), by)
  return NextResponse.json(await answer(params.id))
}
