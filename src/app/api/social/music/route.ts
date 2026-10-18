import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'
import { requireStaff } from '@/lib/apiAuth'
import { getOrgMusic, setOrgMusic, newTrack, MAX_TRACKS, getOrgCategories, setOrgCategories, newCategory, CATEGORY_ID } from '@/lib/reelMusicServer'
import { MUSIC_CATEGORIES } from '@/lib/reelMusic'

// The org's own Reel music list (lib/reelMusic). GET lists it (and the org's own
// categories); POST adds a track whose MP3 was just uploaded (via ./upload), or with
// { op: 'addCategory', label } / { op: 'removeCategory', id } manages categories;
// PATCH renames or re-files a track; DELETE removes one and its file.
export const runtime = 'nodejs'

export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ tracks: [] })
  const [tracks, categories] = await Promise.all([getOrgMusic(gate.orgId), getOrgCategories(gate.orgId)])
  return NextResponse.json({ tracks, categories })
}

export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const body = await req.json().catch(() => ({} as any))
  if (body.op === 'addCategory') {
    const c = newCategory(body.label)
    if (!c) return NextResponse.json({ error: 'Give the category a name' }, { status: 400 })
    const cats = await getOrgCategories(gate.orgId)
    if (MUSIC_CATEGORIES.some(b => b.label.toLowerCase() === c.label.toLowerCase())) return NextResponse.json({ categories: cats, category: MUSIC_CATEGORIES.find(b => b.label.toLowerCase() === c.label.toLowerCase()) })
    const have = cats.find(x => x.id === c.id)
    if (have) return NextResponse.json({ categories: cats, category: have })
    if (cats.length >= 30) return NextResponse.json({ error: 'Up to 30 categories of your own' }, { status: 400 })
    const next = [...cats, c]
    await setOrgCategories(gate.orgId, next)
    return NextResponse.json({ categories: next, category: c })
  }
  if (body.op === 'removeCategory') {
    const id = String(body.id || '')
    const cats = (await getOrgCategories(gate.orgId)).filter(c => c.id !== id)
    await setOrgCategories(gate.orgId, cats)
    // Its tracks stay, filed under Other.
    const tracks = (await getOrgMusic(gate.orgId)).map(t => t.category === id ? { ...t, category: 'other' } : t)
    await setOrgMusic(gate.orgId, tracks)
    return NextResponse.json({ categories: cats, tracks })
  }
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
  if (CATEGORY_ID.test(String(body.category || ''))) t.category = String(body.category)
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
