import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { removeSub } from '@/lib/push'

export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const endpoint = body?.endpoint
    if (!endpoint || typeof endpoint !== 'string') return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })
    const orgId = (gate.role === 'admin' && typeof body?.orgId === 'string' && body.orgId) ? body.orgId : gate.orgId
    if (!orgId) return NextResponse.json({ error: 'No organization for this account' }, { status: 400 })
    await removeSub(orgId, endpoint)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to unsubscribe' }, { status: 500 })
  }
}
