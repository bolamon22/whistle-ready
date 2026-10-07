import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { hotelSwitches, setSoldOut } from '@/lib/hotelStatus'

// Sold out, per listed hotel, from Builder › Hotels (lib/hotelStatus). Same gate as
// saving the event page: the Builder's permission and the event's own org. Saves at
// once, apart from the page's Save Changes, so the housing company's marks and
// staff's never overwrite each other.

async function gate(id: string) {
  const g = await requireFeature('tournament_setup')
  if (!g.ok) return { res: g.res }
  const orgId = await tournamentOrgId(id)
  if (!orgId) return { res: NextResponse.json({ error: 'Tournament not found' }, { status: 404 }) }
  if (g.role !== 'admin' && g.orgId !== orgId) return { res: NextResponse.json({ error: 'Not your organization' }, { status: 403 }) }
  return { g }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await gate(params.id)
  if ('res' in r) return r.res
  return NextResponse.json({ hotels: await hotelSwitches(params.id) })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await gate(params.id)
  if ('res' in r) return r.res
  let body: { key?: unknown; soldOut?: unknown } = {}
  try { body = await req.json() } catch { /* checked below */ }
  const user = (r.g as any).session?.user || {}
  const hotels = await setSoldOut(params.id, String(body.key ?? ''), body.soldOut === true, String(user.name || user.email || 'staff'))
  if (!hotels) return NextResponse.json({ error: 'Save Changes first, then mark this hotel sold out.' }, { status: 404 })
  return NextResponse.json({ ok: true, hotels })
}
