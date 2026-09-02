import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions } from '@/lib/formSubmissions'

// Staff: "work at our event" applications for THIS tournament (rows in
// "OrgFormSubmission" tagged with the tournamentId — see src/lib/formSubmissions.ts).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const orgId = await tournamentOrgId(params.id)
  if (!orgId) return NextResponse.json({ submissions: [] }, { status: 404 })
  if (gate.role !== 'admin' && gate.orgId && gate.orgId !== orgId) return NextResponse.json({ error: 'Not your organization', submissions: [] }, { status: 403 })
  try {
    const submissions = await listSubmissions({ orgId, formType: 'staff', tournamentId: params.id, sort: 'oldest', limit: 5000 })
    return NextResponse.json({ submissions })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}
