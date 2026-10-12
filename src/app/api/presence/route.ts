import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireStaff } from '@/lib/apiAuth'
import { markSeen, recentlySeen, canSeePresence } from '@/lib/presence'

export const dynamic = 'force-dynamic'

// POST: heartbeat from any signed-in tab (components/PresencePing).
export async function POST() {
  const session = await getServerSession(authOptions)
  const id = (session?.user as { id?: string } | undefined)?.id
  if (!id) return new NextResponse(null, { status: 204 })
  await markSeen(id)
  return NextResponse.json({ ok: true })
}

// GET: who's on right now. Event-running roles only, scoped to their org;
// the platform admin sees every org.
export async function GET() {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!canSeePresence(gate.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const realRole = String((gate.session?.user as { role?: string })?.role || '')
  const orgId = realRole === 'admin' ? null : gate.orgId
  if (realRole !== 'admin' && !orgId) return NextResponse.json({ users: [] })
  try {
    const rows = await recentlySeen(orgId, 5)
    return NextResponse.json({ users: rows.map(r => ({ ...r, me: r.id === gate.userId })) })
  } catch {
    return NextResponse.json({ users: [] })
  }
}
