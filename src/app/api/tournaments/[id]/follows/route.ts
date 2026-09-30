import { NextRequest, NextResponse } from 'next/server'
import { setFollow, listFollowing, followerCounts, isDeviceId } from '@/lib/follows'

// Public. Following is one tap with no account, so there is nothing to gate on;
// what keeps it honest is in lib/follows -- only teams that exist, one row per
// device per team, a cap per device.

/** ?device=<id> -> what this device follows here, plus every team's count. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const device = new URL(req.url).searchParams.get('device') || ''
  try {
    const [following, counts] = await Promise.all([
      isDeviceId(device) ? listFollowing(params.id, device) : Promise.resolve([] as string[]),
      followerCounts(params.id),
    ])
    return NextResponse.json({ following, counts }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) {
    console.error('[follows] GET failed:', e)
    // The page works without this -- it just shows nothing followed.
    return NextResponse.json({ following: [], counts: {} }, { headers: { 'Cache-Control': 'private, no-store' } })
  }
}

/** { deviceId, teamName, follow: boolean } */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: any = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: 'bad_request' }, { status: 400 }) }
  const deviceId = String(body?.deviceId || '')
  const teamName = String(body?.teamName || '').slice(0, 200)
  const follow = body?.follow !== false
  if (!isDeviceId(deviceId) || !teamName.trim()) return NextResponse.json({ error: 'bad_request' }, { status: 400 })
  try {
    const r = await setFollow(params.id, deviceId, teamName, follow)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === 'unknown_team' ? 404 : r.error === 'too_many' ? 429 : 400 })
    return NextResponse.json(r)
  } catch (e) {
    console.error('[follows] POST failed:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
