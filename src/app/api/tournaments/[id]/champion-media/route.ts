import { NextRequest, NextResponse } from 'next/server'
import { isStaffRequest } from '@/lib/apiAuth'
import { getPublicVisibility } from '@/lib/publicView'
import { readAwards } from '@/lib/awards'

// The champions' photos and videos for the event's public bracket (components/
// ChampionHero; Bo, Oct 17 2026). Public answer: only what a director, admin or field
// director turned on with Show on the public bracket in Awards, and only while the
// schedule and brackets are public (lib/publicView) -- a champion is a bracket result.
//
// `?preview=1` from signed-in staff also returns what is still private, each marked
// `preview`, and says `staff: true`, so the Awards page's Preview link can show the
// hero before it goes up (with a sample picture where there is nothing yet). Anyone
// else asking for a preview gets the public answer.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const wantsPreview = new URL(req.url).searchParams.get('preview') === '1'
  const staff = wantsPreview ? await isStaffRequest() : false
  if (!staff) {
    const vis = await getPublicVisibility(params.id).catch(() => null)
    if (!vis || vis.schedule !== 'live') return NextResponse.json({ media: [], staff: false })
  }
  const marks = await readAwards(params.id)
  const media = Object.entries(marks).flatMap(([gameId, m]) => {
    if (!m || gameId.startsWith('div:')) return []
    const photo = typeof m.photoUrl === 'string' && m.photoUrl.startsWith('/api/img/') ? m.photoUrl : ''
    const poster = typeof m.posterUrl === 'string' && m.posterUrl.startsWith('/api/img/') ? m.posterUrl : ''
    const videoUrl = typeof m.videoUrl === 'string' && m.videoUrl.startsWith('https://') ? m.videoUrl : ''
    const url = photo || poster
    if (!url && !videoUrl) return []
    if (m.public !== true && !staff) return []
    return [{ gameId, url, ...(videoUrl ? { videoUrl } : {}), ...(m.public === true ? {} : { preview: true }) }]
  })
  return NextResponse.json({ media, staff })
}
