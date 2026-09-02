import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions, deleteSubmission } from '@/lib/formSubmissions'

// Staff: vendor requests for THIS tournament (rows in "OrgFormSubmission" tagged with
// the tournamentId — see src/lib/formSubmissions.ts).
async function gateForTournament(id: string) {
  const gate = await requireStaff()
  if (!gate.ok) return { res: gate.res }
  const orgId = await tournamentOrgId(id)
  if (!orgId) return { res: NextResponse.json({ error: 'Tournament not found', submissions: [] }, { status: 404 }) }
  if (gate.role !== 'admin' && gate.orgId && gate.orgId !== orgId) {
    return { res: NextResponse.json({ error: 'Not your organization', submissions: [] }, { status: 403 }) }
  }
  return { gate, orgId }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  try {
    const submissions = await listSubmissions({ orgId: g.orgId, formType: 'vendor', tournamentId: params.id, sort: 'oldest', limit: 5000 })
    return NextResponse.json({ submissions })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}

// Staff: delete ONE vendor request (e.g. spam or a test entry). Scoped to this
// tournament's vendor rows only — never anything else the org has collected.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const subId = String(new URL(req.url).searchParams.get('subId') || '')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  try {
    const removed = await deleteSubmission(g.orgId, subId, 'vendor', params.id)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, removed: 1 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}
