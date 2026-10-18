import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { searchInstagramAudio, getInstagramAudio } from '@/lib/social'
import { loadOrgUserToken } from '@/lib/socialAudio'

// Instagram music for scheduled Reels: GET /api/social/audio?q=&type=music|original_sound
// Searches Instagram's own catalog through the org's connected Instagram account
// (Meta Audio API). No query = trending. Only music Meta has cleared for
// third-party apps comes back — a subset of what the Instagram app shows — and
// because Instagram licenses it, a Reel that carries it won't be muted for rights.
export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100)
  const type = url.searchParams.get('type') === 'original_sound' ? 'original_sound' : 'music'

  const account = await prisma.socialAccount.findFirst({ where: { orgId: gate.orgId, platform: 'instagram', status: 'active' } })
  if (!account) return NextResponse.json({ error: 'Connect an Instagram account first' }, { status: 400 })
  const userToken = await loadOrgUserToken(gate.orgId).catch(() => null)
  // ?id=<audioId>: one song, fresh, for "Play with song" on a scheduled Reel (the
  // track's link from Meta expires, so it isn't stored with the post).
  const id = (url.searchParams.get('id') || '').trim()
  if (id) {
    if (!/^\d{5,30}$/.test(id)) return NextResponse.json({ error: 'Not a song id' }, { status: 400 })
    const one = await getInstagramAudio(account, id, userToken)
    if (!one.ok) return NextResponse.json({ error: one.error }, { status: 502 })
    return NextResponse.json({ audio: [one.data] })
  }
  const r = await searchInstagramAudio(account, { query: q, type, userToken })
  if (!r.ok) {
    // Most likely: a token that predates music support. Reconnecting stores the
    // user token Meta's audio endpoints ask for.
    const hint = userToken ? '' : ' Reconnecting Instagram once (Accounts → Connect) usually fixes this.'
    return NextResponse.json({ error: `Instagram music search didn't work: ${r.error}.${hint}` }, { status: 502 })
  }
  return NextResponse.json({ audio: r.data.slice(0, 40), trending: !q })
}
