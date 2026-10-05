import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isStaffRequest } from '@/lib/apiAuth'
import { getPublicVisibility } from '@/lib/publicView'
import { keepRegistered, registeredKeys, waitlistedKeys, dropWaitlisted } from '@/lib/poolMembership'
import { cleanName, nameKey } from '@/lib/names'

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
    const [pools, byDiv, wl] = await Promise.all([
      prisma.pool.findMany({
        where: { tournamentId: params.id },
        orderBy: [{ division: 'asc' }, { name: 'asc' }],
      }),
      // A pool can name a team whose registration is gone -- see
      // lib/poolMembership. Filtering here is what heals the rows that went
      // stale before the write paths started pruning, since no screen in the
      // app can show an orphaned name, let alone remove it.
      registeredKeys(params.id),
      // Staff may place a waitlisted team in a pool to plan around it; outsiders
      // don't see it until Registrations clears the flag.
      staff ? Promise.resolve(null) : waitlistedKeys(params.id).catch(() => null),
    ])
    // `unassigned` rows are registered teams in no pool yet -- see below.
    type Row = { id: string; division: string; name: string; teams: string[]; unassigned?: boolean }
    const out: Row[] = pools.map((p: { id: string; division: string; name: string; teamNames: string }) => {
      let teams: string[] = []
      try {
        const parsed = JSON.parse(p.teamNames || '[]')
        // Names are string keys everywhere else (games, brackets, waiver tags),
        // so trim on the way out -- see lib/names.
        if (Array.isArray(parsed)) teams = parsed.filter((t: unknown) => typeof t === 'string' && t.trim()).map((t: string) => t.trim())
      } catch { /* a malformed row is an empty pool, not a 500 */ }
      return { id: p.id, division: p.division, name: p.name, teams: dropWaitlisted(keepRegistered(teams, p.division, byDiv), p.division, wl) }
    })
    // Registered teams that are in no pool yet. Before the schedule is
    // published the public page shows teams, and "if I don't have a pool
    // assigned, just show all the teams" (Bo) needs them: a division with no
    // pools had nothing in this feed and no games, so it did not appear on the
    // page at all.
    //
    // Waitlisted teams are left out -- they are not playing until Bo places
    // them, and one he has placed in a pool is already listed above. The page
    // only shows these rows while the schedule is unpublished.
    //
    // Its own try: a failure here should cost the unpooled list, not the pools.
    try {
      const reg = await prisma.registeredTeam.findMany({
        where: { registration: { tournamentId: params.id, deletedAt: null }, waitlisted: false },
        select: { division: true, teamName: true },
      })
      const pooled = new Map<string, Set<string>>()
      const divName = new Map<string, string>()   // keep the pools' spelling of a division
      for (const r of out) {
        const d = nameKey(r.division)
        if (!pooled.has(d)) pooled.set(d, new Set())
        r.teams.forEach(t => pooled.get(d)!.add(nameKey(t)))
        if (!divName.has(d)) divName.set(d, r.division)
      }
      const loose = new Map<string, { division: string; teams: string[]; seen: Set<string> }>()
      for (const t of reg as { division: string; teamName: string }[]) {
        const name = cleanName(t.teamName)
        if (!name) continue
        const d = nameKey(t.division), k = nameKey(name)
        if (pooled.get(d)?.has(k)) continue
        if (!loose.has(d)) loose.set(d, { division: divName.get(d) ?? cleanName(t.division), teams: [], seen: new Set() })
        const grp = loose.get(d)!
        if (grp.seen.has(k)) continue
        grp.seen.add(k); grp.teams.push(name)
      }
      for (const grp of loose.values()) {
        out.push({ id: `unassigned:${grp.division}`, division: grp.division, name: '', teams: grp.teams, unassigned: true })
      }
    } catch { /* best-effort: the pools above are still returned */ }

    return NextResponse.json(out, {
      headers: { 'Cache-Control': staff ? 'private, no-store' : 'public, s-maxage=5, stale-while-revalidate=30' },
    })
  } catch {
    // Pool table not migrated on this tournament's DB: no pools, not an error.
    return NextResponse.json([])
  }
}
