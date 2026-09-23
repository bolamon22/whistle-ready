import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Slug -> tournament id, for the middleware rewrite that makes
// /tournaments/monstermash26/event render the real event page.
//
// A separate tiny route rather than a DB call inside middleware: middleware runs
// on the edge, and this keeps Prisma on the node runtime where it works. Public
// on purpose -- it maps a public URL to a public id and returns nothing else.
//
// Cached hard at the edge: slugs change when an organizer renames an event, which
// is rare, and a stale minute costs nothing because the cuid path still works.
export async function GET(req: NextRequest) {
  const s = String(req.nextUrl.searchParams.get('s') || '').trim().toLowerCase()
  if (!s) return NextResponse.json({ id: null }, { status: 400 })
  let id: string | null = null
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT id FROM "Tournament" WHERE lower(slug) = ? LIMIT 1', s)
    id = (rows?.[0]?.id as string) || null
  } catch { /* column not migrated yet -- fall through as a miss */ }
  return NextResponse.json({ id }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  })
}
