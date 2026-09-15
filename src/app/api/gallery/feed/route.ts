import { NextRequest, NextResponse } from 'next/server'
import { orgBySlug } from '@/lib/org'
import { listGalleryMedia, countGalleryMedia } from '@/lib/galleryStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Published contributed media, one page at a time.
//
// Deliberately public and deliberately not part of the page render. The gallery
// page used to ship every photo record inside its own HTML -- measured Sep 15 2026
// at 84,521 bytes for 193 photos -- which is fine for a set somebody curates by
// hand and impossible for a set three photographers fill in a weekend. So the page
// ships what it can render immediately and asks for the rest as an album is opened.
//
// Only rows an organizer has published are ever returned; 'pending' and 'hidden'
// are not reachable from here at any offset.
const MAX = 120

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams
  const slug = String(q.get('org') || '').trim()
  if (!slug) return NextResponse.json({ items: [], total: 0 })

  const org = await orgBySlug(slug)
  if (!org?.id) return NextResponse.json({ items: [], total: 0 })

  const tournamentId = String(q.get('t') || '').trim()
  const offset = Math.max(0, Number(q.get('offset')) || 0)
  const limit = Math.min(Math.max(Number(q.get('limit')) || 60, 1), MAX)

  const [rows, total] = await Promise.all([
    listGalleryMedia({ orgId: org.id, status: 'published', tournamentId: tournamentId || undefined, limit, offset }),
    countGalleryMedia({ orgId: org.id, status: 'published', tournamentId: tournamentId || undefined }),
  ])

  return NextResponse.json({
    total,
    nextOffset: offset + rows.length < total ? offset + rows.length : null,
    items: rows.map(r => ({
      id: r.id, url: r.url, caption: r.caption, credit: r.credit,
      tournamentId: r.tournamentId || undefined, kind: r.kind,
    })),
  }, { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' } })
}
