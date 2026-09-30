import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isStaffRequest } from '@/lib/apiAuth'
import { getPublicVisibility } from '@/lib/publicView'

// Who is in which pool, for the whole tournament, read from the Pool rows staff
// edit on the Divisions page.
//
// The public page used to work this out from the schedule instead -- divisions,
// pool names and team lists were all derived from the games. That made the
// schedule the only record of who was playing, with two consequences the
// organizer felt: a team removed from a pool kept appearing in the standings,
// because its games were still there naming it; and clearing the schedule to
// start over erased every club's division and pool along with it. This is the
// source of truth those views should have been reading.
//
//   ?view=public  -> skips the session lookup (shared-cacheable). The pools
//                    switch in lib/publicView still governs, same as the games
//                    feed, so a tournament with pools hidden returns [].
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const publicView = new URL(req.url).searchParams.get('view') === 'public'
  const staff = publicView ? false : await isStaffRequest()

  if (!staff) {
    try {
      const vis = await getPublicVisibility(params.id)
      if (vis.pools !== 'live') {
        return NextResponse.json([], { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30' } })
      }
    } catch { /* can't read the switch: fall through and show nothing rather than leak */ }
  }

  try {
    const pools = await prisma.pool.findMany({
      where: { tournamentId: params.id },
      orderBy: [{ division: 'asc' }, { name: 'asc' }],
    })
    const out = pools.map((p: { id: string; division: string; name: string; teamNames: string }) => {
      let teams: string[] = []
      try {
        const parsed = JSON.parse(p.teamNames || '[]')
        // Names are string keys everywhere else (games, brackets, waiver tags),
        // so trim on the way out -- see lib/names.
        if (Array.isArray(parsed)) teams = parsed.filter((t: unknown) => typeof t === 'string' && t.trim()).map((t: string) => t.trim())
      } catch { /* a malformed row is an empty pool, not a 500 */ }
      return { id: p.id, division: p.division, name: p.name, teams }
    })
    return NextResponse.json(out, {
      headers: { 'Cache-Control': staff ? 'private, no-store' : 'public, s-maxage=5, stale-while-revalidate=30' },
    })
  } catch {
    // Pool table not migrated on this tournament's DB: no pools, not an error.
    return NextResponse.json([])
  }
}
