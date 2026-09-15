import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions, deleteSubmission } from '@/lib/formSubmissions'

// Staff: who booked which photographer for THIS tournament.
//
// The org is not a party to these bookings -- the money and the photos are between
// the family and the photographer -- so this is a record, not a workflow. There is
// no approve step and nothing to charge; it exists so the organizer can answer
// "who did we send to your field on Saturday" without asking anyone.
async function gate(id: string) {
  const g = await requireStaff()
  if (!g.ok) return { res: g.res }
  const orgId = await tournamentOrgId(id)
  if (!orgId) return { res: NextResponse.json({ error: 'Tournament not found', submissions: [] }, { status: 404 }) }
  if (g.role !== 'admin' && g.orgId && g.orgId !== orgId) {
    return { res: NextResponse.json({ error: 'Not your organization', submissions: [] }, { status: 403 }) }
  }
  return { g, orgId }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await gate(params.id)
  if ('res' in r) return r.res
  try {
    const submissions = await listSubmissions({ orgId: r.orgId, formType: 'photo-request', tournamentId: params.id, sort: 'oldest', limit: 5000 })
    return NextResponse.json({ submissions })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await gate(params.id)
  if ('res' in r) return r.res
  const subId = String(new URL(req.url).searchParams.get('subId') || '')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  try {
    const removed = await deleteSubmission(r.orgId, subId, 'photo-request', params.id)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, removed: 1 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}
