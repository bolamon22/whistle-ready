import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff, eventGate } from '@/lib/apiAuth'
import { redactWorker, fieldDirectorSees } from '@/lib/roleScope'
import { payScopeFor } from '@/lib/payScope'

// A field director (lib/fieldDirector) sees, adds and removes only the scorekeepers,
// athletic trainers and field ops on their own events, never refs.

export async function GET(_: Request, { params }: { params:{id:string} }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const refused = eventGate(gate, params.id); if (refused) return refused
  const [r, scope] = await Promise.all([
    prisma.rosterEntry.findMany({ where:{tournamentId:params.id}, include:{worker:true} }),
    payScopeFor(gate.role, gate.userId),   // an assigner: rates only for their pay groups
  ])
  const shown = gate.role === 'field_director' ? r.filter((e: any) => fieldDirectorSees(e.worker)) : r
  return NextResponse.json(shown.map((e: any) => ({ ...e, worker: redactWorker(e.worker, gate.role, scope) })))
}

export async function POST(req: Request, { params }: { params:{id:string} }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const refused = eventGate(gate, params.id); if (refused) return refused
  const { workerId, gameTarget, notes } = await req.json()
  if (gate.role === 'field_director' && !fieldDirectorSees(await prisma.worker.findUnique({ where: { id: String(workerId || '') } }))) {
    return NextResponse.json({ error: 'Field directors add scorekeepers, athletic trainers and field ops.' }, { status: 403 })
  }
  const entry = await prisma.rosterEntry.upsert({
    where:{ workerId_tournamentId:{ workerId, tournamentId:params.id } },
    create:{ workerId, tournamentId:params.id, gameTarget:gameTarget??0, notes },
    update:{ gameTarget:gameTarget??0, notes },
    include:{ worker:true },
  })
  // The same redaction as the list: this answer used to carry the person's pay and payout details.
  return NextResponse.json({ ...entry, worker: redactWorker(entry.worker, gate.role, await payScopeFor(gate.role, gate.userId)) })
}

export async function DELETE(req: Request, { params }: { params:{id:string} }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const refused = eventGate(gate, params.id); if (refused) return refused
  const { searchParams } = new URL(req.url)
  const workerId = searchParams.get('workerId')!
  if (gate.role === 'field_director' && !fieldDirectorSees(await prisma.worker.findUnique({ where: { id: String(workerId || '') } }))) {
    return NextResponse.json({ error: 'Field directors remove scorekeepers, athletic trainers and field ops.' }, { status: 403 })
  }
  await prisma.rosterEntry.deleteMany({ where:{ workerId, tournamentId:params.id } })
  return NextResponse.json({ ok:true })
}
