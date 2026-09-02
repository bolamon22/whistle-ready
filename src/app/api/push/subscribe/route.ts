import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { addSub } from '@/lib/push'

// Staff only: a logged-in staff member registers THIS device to receive the
// org's registration/payment alerts. Subscriptions attach to the staffer's org
// (admins may target a specific org via body.orgId, matching the forms editor).
export async function POST(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const sub = body?.subscription
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }
    const orgId = (gate.role === 'admin' && typeof body?.orgId === 'string' && body.orgId) ? body.orgId : gate.orgId
    if (!orgId) return NextResponse.json({ error: 'No organization for this account' }, { status: 400 })
    await addSub(orgId, {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
      label: typeof body?.label === 'string' ? body.label.slice(0, 60) : '',
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to subscribe' }, { status: 500 })
  }
}
