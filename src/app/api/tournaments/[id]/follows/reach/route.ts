import { NextResponse } from 'next/server'
import { isStaffRequest } from '@/lib/apiAuth'
import { followerReach } from '@/lib/follows'

// Staff only: who a broadcast would reach, before it is sent.
//
// The Broadcast page shows "N phones with alerts on (M followers)" for whatever
// audience is picked -- the whole event, one division, one team -- and lists the
// teams to pick from, grouped by division. All of it comes back in one call so
// switching audiences costs nothing; the public follower counts on /public come
// from the sibling route, not this one.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  if (!(await isStaffRequest())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const reach = await followerReach(params.id)
    return NextResponse.json(reach, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[follows] reach failed:', e)
    return NextResponse.json({ event: { follows: 0, phones: 0 }, divisions: {}, teams: {} }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
}
