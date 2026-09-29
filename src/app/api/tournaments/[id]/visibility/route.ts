import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getPublicVisibility, setPublicVisibility, type Vis } from '@/lib/publicView'

// The two Publish switches (see lib/publicView). GET is public so the public page
// can say "schedule coming soon" instead of looking empty.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const v = await getPublicVisibility(params.id)
  return NextResponse.json(
    { pools: v.pools, schedule: v.schedule, poolsAuto: v.poolsAuto, scheduleAuto: v.scheduleAuto, publishedAt: v.publishedAt },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const b = await req.json().catch(() => ({}))
  const ok = (x: unknown): x is Vis => x === 'live' || x === 'hidden'
  const patch: { pools?: Vis; schedule?: Vis } = {}
  if (ok(b.pools)) patch.pools = b.pools
  if (ok(b.schedule)) patch.schedule = b.schedule
  // A live schedule shows teams and pools too; hiding pools hides the schedule.
  if (patch.schedule === 'live') patch.pools = 'live'
  if (patch.pools === 'hidden') patch.schedule = 'hidden'
  if (!patch.pools && !patch.schedule) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  await setPublicVisibility(params.id, patch)
  const v = await getPublicVisibility(params.id)
  return NextResponse.json({ pools: v.pools, schedule: v.schedule, poolsAuto: v.poolsAuto, scheduleAuto: v.scheduleAuto, publishedAt: v.publishedAt })
}
