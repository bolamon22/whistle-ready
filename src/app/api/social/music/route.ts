import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { requireStaff } from '@/lib/apiAuth'
import { getOrgMusic, setOrgMusic, newTrack, MAX_TRACKS } from '@/lib/reelMusicServer'
import { MUSIC_CATEGORIES } from '@/lib/reelMusic'

// The org's own Reel music list (lib/reelMusic). GET lists it; POST adds a track whose
// MP3 was just uploaded (via ./upload); PATCH renames or re-files one; DELETE removes
// one and its file.
export const runtime = 'nodejs'

export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ tracks: [] })
  return NextResponse.json({ tracks: await getOrgMusic(gate.orgId) })
}

export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const body = await req.json().catch(() => ({} as any))
  const t = newTrack(body)
  if (!t) return NextResponse.json({ error: 'Upload the MP3 first' }, { status: 400 })
  const list = await getOrgMusic(gate.orgId)
  if (list.length >= MAX_TRACKS) return NextResponse.json({ error: `The music list holds ${MAX_TRACKS} tracks; remove one first` }, { status: 400 })
  if (list.some(x => x.url === t.url)) return NextResponse.json({ tracks: list, track: list.find(x => x.url === t.url) })
  const tracks = [...list, t]
  await setOrgMusic(gate.orgId, tracks)
  return NextResponse.json({ tracks, track: t })
}

export async function PATCH(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const body = await req.json().catch(() => ({} as any))
  const list = await getOrgMusic(gate.orgId)
  const t = list.find(x => x.id === String(body.id || ''))
  if (!t) return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  if (typeof body.title === 'string' && body.title.trim()) t.title = body.title.trim().slice(0, 80)
  if (MUSIC_CATEGORIES.some(c => c.id === body.category)) t.category = body.category
  await setOrgMusic(gate.orgId, list)
  return NextResponse.json({ tracks: list })
}

export async function DELETE(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const list = await getOrgMusic(gate.orgId)
  const t = list.find(x => x.id === id)
  if (!t) return NextResponse.json({ error: 'Track not found' }, { status: 404 })
  const tracks = list.filter(x => x.id !== id)
  await setOrgMusic(gate.orgId, tracks)
  // Reels already made keep their music (it's mixed into the video), so the file can go.
  if (process.env.BLOB_READ_WRITE_TOKEN) await del(t.url).catch(() => {})
  return NextResponse.json({ tracks })
}
