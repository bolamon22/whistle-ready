import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Public tournament directory for the whistleready.app landing "find your
// tournament" look-up. No auth — attendees (coaches, parents, players,
// spectators) use this to reach the public schedule / standings / bracket
// pages. Returns lightweight fields only.
//
// NOTE: single-org today (Sunshine Events Group), so this lists every
// tournament. When multiple orgs go live, scope this by org (or a published
// flag) before it fans out.

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await prisma.tournament.findMany({
      orderBy: { startDate: 'desc' },
      take: 60,
      select: {
        id: true, name: true, sport: true,
        startDate: true, endDate: true, location: true, logoUrl: true,
      },
    })
    return NextResponse.json(rows)
  } catch (e) {
    console.error('[public/tournaments]', e)
    return NextResponse.json([], { status: 200 })
  }
}
