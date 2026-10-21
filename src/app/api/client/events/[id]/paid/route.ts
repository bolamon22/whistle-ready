import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireClientEvent } from '@/lib/apiAuth'
import { clientPay } from '@/lib/clientPay'
import { PAY_METHODS } from '@/lib/utils'
import { effectivePayers, setRecordPayer } from '@/lib/officialsPayer'

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
  // They paid it themselves (lib/officialsPayer), whatever the event's usual payer is.
  await setRecordPayer(record.id, 'td')
  return NextResponse.json(record, { status: 201 })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireClientEvent(params.id); if (!gate.ok) return gate.res
  const recordId = new URL(req.url).searchParams.get('recordId') || ''
  const rec = recordId ? await prisma.paymentRecord.findUnique({ where: { id: recordId }, select: { tournamentId: true } }) : null
  if (!rec || rec.tournamentId !== params.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  // A payment the head assigner's organization made is theirs to undo (Oct 21 2026).
  if ((await effectivePayers([{ id: recordId, tournamentId: params.id }])).get(recordId) === 'org' && gate.as === 'client') {
    return NextResponse.json({ error: 'Your assigner paid this person, so they undo it.' }, { status: 403 })
  }
  await prisma.paymentRecord.delete({ where: { id: recordId } })
  return NextResponse.json({ ok: true })
}
