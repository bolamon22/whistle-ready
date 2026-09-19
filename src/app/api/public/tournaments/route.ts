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
      // Was 60. Importing the 2015-2024 archive took Sunshine Events Group alone to 51
      // rows, and the cap drops the oldest silently -- one more season would have
      // started deleting tournaments from the look-up with nothing to show for it.
      take: 500,
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
