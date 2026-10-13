import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions } from '@/lib/formSubmissions'

// Staff: "work at our event" applications for THIS tournament (rows in
// "OrgFormSubmission" tagged with the tournamentId — see src/lib/formSubmissions.ts).
// A field director (lib/fieldDirector) sees the people who applied for something
// other than refereeing: the ref positions are the assigner's.
const REF_POSITION = /referee|official|umpire/i
const notOnlyRef = (positions: unknown) => {
  const list = String(positions || '').split(',').map(p => p.trim()).filter(Boolean)
  return !list.length || list.some(p => !REF_POSITION.test(p))
}
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireFeature('staff_applications')
  if (!gate.ok) return gate.res
  const orgId = await tournamentOrgId(params.id)
  if (!orgId) return NextResponse.json({ submissions: [] }, { status: 404 })
  if (gate.role !== 'admin' && gate.orgId && gate.orgId !== orgId) return NextResponse.json({ error: 'Not your organization', submissions: [] }, { status: 403 })
  try {
    const all = await listSubmissions({ orgId, formType: 'staff', tournamentId: params.id, sort: 'oldest', limit: 5000 })
    const submissions = gate.role === 'field_director' ? all.filter(s => notOnlyRef((s.data as any)?.positions)) : all
    return NextResponse.json({ submissions })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}
