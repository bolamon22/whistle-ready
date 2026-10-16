import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGate, orgGateFor, requireStaffPay } from '@/lib/apiAuth'
import { payAccess, payKey, payScopeFor } from '@/lib/payScope'
// Staff pay records: these had no sign-in check at all (anyone could read, add or
// delete what each official was paid).
//
// An assigner sees and marks paid only the people whose pay at that event is in
// their pay groups (lib/payGroups, Oct 13 2026). A record is one per person per
// event, so someone with pay in a group the assigner doesn't run shows paid or
// not, without the amount, and only the director marks them paid.
//
// A director or assigner works one organization at a time (lib/orgScope): an event or a
// Staff Pool record of another organization is not found, and they always ask by one.
async function otherOrg(gate: Parameters<typeof orgGate>[0], workerId: string | null, tournamentId: string | null): Promise<NextResponse | null> {
  if (tournamentId) { const away = await orgGate(gate, tournamentId); if (away) return away }
  if (workerId) {
    const w = await prisma.worker.findUnique({ where: { id: workerId }, select: { orgId: true } })
    if (w) { const away = orgGateFor(gate, w.orgId); if (away) return away }
  }
  return null
}

export async function GET(req: Request) {
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const workerId = searchParams.get('workerId')
  const tournamentId = searchParams.get('tournamentId')
  if (gate.session?.user?.role !== 'admin' && !workerId && !tournamentId) return NextResponse.json({ error: 'workerId or tournamentId is required' }, { status: 400 })
  const away = await otherOrg(gate, workerId, tournamentId); if (away) return away
  const where: Record<string, string> = {}
  if (workerId) where.workerId = workerId
  if (tournamentId) where.tournamentId = tournamentId
  const records = await prisma.paymentRecord.findMany({
    where,
    include: { tournament: { select: { id: true, name: true, startDate: true } }, worker: { select: { id: true, name: true } } },
    orderBy: { paidAt: 'desc' },
  })
  const scope = await payScopeFor(gate.role, gate.userId)
  if (scope.all) return NextResponse.json(records)
  const access = await payAccess(scope, records.map(r => ({ workerId: r.workerId, tournamentId: r.tournamentId })))
  return NextResponse.json(records
    .map(r => ({ r, a: access.get(payKey(r.workerId, r.tournamentId))?.access ?? 'none' }))
    .filter(x => x.a !== 'none')
    .map(x => (x.a === 'full' ? x.r : { ...x.r, amount: null })))
}

export async function POST(req: Request) {
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  const body = await req.json()
  const { workerId, tournamentId, method, notes, paidBy } = body
  const away = await otherOrg(gate, workerId ? String(workerId) : null, tournamentId ? String(tournamentId) : null); if (away) return away
  let amount = body.amount
  const scope = await payScopeFor(gate.role, gate.userId)
  if (!scope.all) {
    if (!workerId || !tournamentId) return NextResponse.json({ error: 'workerId and tournamentId are required' }, { status: 400 })
    const a = (await payAccess(scope, [{ workerId, tournamentId }])).get(payKey(workerId, tournamentId))
    if (a?.access !== 'full') {
      return NextResponse.json({ error: a?.access === 'partial'
        ? 'Part of this person’s pay is in a group you don’t run, so the director marks them paid.'
        : 'This person’s pay isn’t in your groups.' }, { status: 403 })
    }
    amount = a.total   // what their Pay Summary shows, not a number from the browser
  }
  const record = await prisma.paymentRecord.create({
    data: { workerId, tournamentId, amount, method: method ?? 'check', notes, paidBy },
    include: { tournament: { select: { id: true, name: true, startDate: true } } },
  })
  return NextResponse.json(record, { status: 201 })
}
