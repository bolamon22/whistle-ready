import { NextRequest, NextResponse } from 'next/server'
import { requireDirector } from '@/lib/apiAuth'
import { howToVideo } from '@/lib/howToVideos'
import { getHowToVisibility, setHowToVisibility } from '@/lib/videoVisibility'

// Who may see each how-to video (lib/howToVideos). GET is open: the public pages' "Watch
// how" links ask it whether a video may show. PUT is the Video library's Visibility pick,
// for the director.

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ visibility: await getHowToVisibility() }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
}

export async function PUT(req: NextRequest) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const b = await req.json().catch(() => ({}))
  const id = String(b?.id || ''); const vis = b?.visibility
  if (!howToVideo(id)) return NextResponse.json({ error: 'Unknown video' }, { status: 404 })
  if (vis !== 'public' && vis !== 'members') return NextResponse.json({ error: 'Pick Public or Club directors' }, { status: 400 })
  return NextResponse.json({ visibility: await setHowToVisibility(id, vis) })
}
