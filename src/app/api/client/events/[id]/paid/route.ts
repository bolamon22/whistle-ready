import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireClientEvent } from '@/lib/apiAuth'
import { clientPay } from '@/lib/clientPay'
import { PAY_METHODS } from '@/lib/utils'

// Mark paid and Unpay in the tournament director's area (lib/clientEvents). Bo, Oct 17
// 2026: "The tournament directors actually are the one that pays the staff. Normally."
// The record is the same one Staff pay writes (one per person per event, the amount
// being what Staff pay shows, worked out here, never sent by the browser), so the
// head assigner sees who the tournament director paid, and the other way round.
//
// POST { workerId, method, notes } -> the record    DELETE ?recordId= -> { ok }

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireClientEvent(params.id); if (!gate.ok) return gate.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const workerId = String(b.workerId || '')
  const method = PAY_METHODS.some(m => m.value === b.method) ? String(b.method) : 'other'
  const notes = b.notes ? String(b.notes).slice(0, 500) : null
  const person = (await clientPay(params.id)).people.find(p => p.workerId === workerId)
  if (!person) return NextResponse.json({ error: 'They have no games or hours at this event.' }, { status: 404 })
  if (person.isPaid) return NextResponse.json({ error: 'They are already marked paid.' }, { status: 409 })
  const by = String(gate.session?.user?.name || gate.session?.user?.email || '')
  const record = await prisma.paymentRecord.create({ data: { workerId, tournamentId: params.id, amount: person.total, method, notes, paidBy: by || null } })
  return NextResponse.json(record, { status: 201 })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireClientEvent(params.id); if (!gate.ok) return gate.res
  const recordId = new URL(req.url).searchParams.get('recordId') || ''
  const rec = recordId ? await prisma.paymentRecord.findUnique({ where: { id: recordId }, select: { tournamentId: true } }) : null
  if (!rec || rec.tournamentId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.paymentRecord.delete({ where: { id: recordId } })
  return NextResponse.json({ ok: true })
}
