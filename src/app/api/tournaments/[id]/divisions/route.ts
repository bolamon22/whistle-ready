import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff, isStaffRequest } from '@/lib/apiAuth'
import { getPublicVisibility } from '@/lib/publicView'
import { dropWaitlisted, involvesWaitlisted } from '@/lib/poolMembership'
import { nameKey } from '@/lib/names'

// Every division with its team, waiting-list, pool and game counts.
//
// Staff get it all. Everyone else gets it once Teams & pools is public, and no
// game counts before Schedule & brackets: this had no sign-in check, so a
// signed-out visitor could read how many teams each upcoming division had (a
// club asked about Fall Classic's thin middle-school field with neither switch
// on, Oct 4 2026).
//
//   ?view=public -> the public shape, shared-cacheable (the public schedule page)
//   (no param)   -> staff the full list, anyone else the public shape, never
//                   shared-cached: the CDN keys on URL only and would hand one
//                   audience's copy to the other.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const publicView = new URL(req.url).searchParams.get('view') === 'public'
  const staff = publicView ? false : await isStaffRequest()
  const cache = publicView ? 'public, s-maxage=5, stale-while-revalidate=30' : 'private, no-store'
  let scheduleLive = staff
  // Outsiders don't count a waitlisted team that staff placed in a pool to plan
  // around, or its games (lib/poolMembership).
  let wl: Map<string, Set<string>> | undefined
  if (!staff) {
    const vis = await getPublicVisibility(params.id).catch(() => null)
    if (vis?.pools !== 'live') return NextResponse.json([], { headers: { 'Cache-Control': cache } })
    scheduleLive = vis.schedule === 'live'
    wl = vis.waitlisted
  }
  try {
    const [teams, tournament, games] = await Promise.all([
      // deletedAt: null, or the counts here disagree with the dashboard, which has
      // always filtered. A club that was removed kept its RegisteredTeam rows (they
      // only cascade on a hard purge 30 days later), so the division list carried
      // deleted test entries and duplicates for weeks and the organizer had no way
      // to clear them.
      prisma.registeredTeam.findMany({
        where: { registration: { tournamentId: params.id, deletedAt: null } },
        select: { division: true, waitlisted: true, teamName: true },
      }),
      prisma.tournament.findUnique({ where: { id: params.id }, select: { registrationDivisions: true } }),
      prisma.game.findMany({
        where: { tournamentId: params.id },
        select: { division: true, gameNumber: true, pool: true, team1: true, team2: true },
      }),
    ])

    let pools: { division: string; teamNames: string }[] = []
    try {
      pools = await prisma.pool.findMany({
        where: { tournamentId: params.id },
        select: { division: true, teamNames: true },
      })
    } catch { /* Pool table not migrated yet */ }

    const waitlistAll = new Map<string, Set<string>>()
    for (const t of teams) {
      if (!t.waitlisted) continue
      const d = nameKey(t.division)
      if (!waitlistAll.has(d)) waitlistAll.set(d, new Set())
      waitlistAll.get(d)!.add(nameKey(t.teamName))
    }

    // teams = teams in the draw; waitlisted teams are counted apart so they never
    // read as "unassigned" (they have no pool on purpose).
    const divMap = new Map<string, { teams: number; waitlisted: number; pools: number; assignedTeams: number; gameCount: number }>()

    // Seed from registrationDivisions so empty divisions show up
    const regDivs: string[] = JSON.parse(tournament?.registrationDivisions ?? '[]')
    for (const name of regDivs) {
      if (!divMap.has(name)) divMap.set(name, { teams: 0, waitlisted: 0, pools: 0, assignedTeams: 0, gameCount: 0 })
    }

    for (const t of teams) {
      const cur = divMap.get(t.division) ?? { teams: 0, waitlisted: 0, pools: 0, assignedTeams: 0, gameCount: 0 }
      divMap.set(t.division, t.waitlisted ? { ...cur, waitlisted: cur.waitlisted + 1 } : { ...cur, teams: cur.teams + 1 })
    }
    for (const p of pools) {
      const cur = divMap.get(p.division) ?? { teams: 0, waitlisted: 0, pools: 0, assignedTeams: 0, gameCount: 0 }
      // Waitlisted names never count as assigned: they aren't in teamCount either,
      // so counting them would hide a real unassigned team.
      const names = dropWaitlisted(JSON.parse(p.teamNames || '[]') as string[], p.division, waitlistAll)
      divMap.set(p.division, { ...cur, pools: cur.pools + 1, assignedTeams: cur.assignedTeams + names.length })
    }
    const bracketCount = new Map<string, number>()
    for (const g of games) {
      if (involvesWaitlisted(g, wl)) continue
      const cur = divMap.get(g.division) ?? { teams: 0, waitlisted: 0, pools: 0, assignedTeams: 0, gameCount: 0 }
      const isBracket = (g.gameNumber || '').startsWith('B')
      if (isBracket) {
        divMap.set(g.division, cur)
        bracketCount.set(g.division, (bracketCount.get(g.division) ?? 0) + 1)
      } else if (g.pool != null) {
        divMap.set(g.division, { ...cur, gameCount: cur.gameCount + 1 })
      }
    }

    const divisions = [...divMap.entries()]
      .map(([name, data]) => ({
        name,
        teamCount: data.teams,
        waitlistCount: data.waitlisted,
        poolCount: data.pools,
        unassignedTeams: Math.max(0, data.teams - data.assignedTeams),
        gameCount: scheduleLive ? data.gameCount : 0,
        poolGameCount: scheduleLive ? data.gameCount : 0,
        bracketGameCount: scheduleLive ? (bracketCount.get(name) ?? 0) : 0,
      }))
      .sort((a, b) => {
        // Curated order from registrationDivisions; names not in it (legacy) go last, A\u2192Z.
        const ai = regDivs.indexOf(a.name); const bi = regDivs.indexOf(b.name)
        return ((ai === -1 ? 1e9 : ai) - (bi === -1 ? 1e9 : bi)) || a.name.localeCompare(b.name)
      })

    // Short shared cache on the public URL only -- multi-query aggregation hit
    // on every public schedule page load; event-weekend load-readiness pass, Sep 2026.
    return NextResponse.json(divisions, { headers: { 'Cache-Control': cache } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load divisions' }, { status: 500 })
  }
}

// POST: create a new division
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const { name } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id }, select: { registrationDivisions: true },
    })
    const existing: string[] = JSON.parse(tournament?.registrationDivisions ?? '[]')
    if (existing.map(d => d.toLowerCase()).includes(name.trim().toLowerCase())) {
      return NextResponse.json({ error: 'Division already exists' }, { status: 409 })
    }
    // Append, no re-sort: registrationDivisions order is the curated display order (set in the builder).
    const updated = [...existing, name.trim()]
    await prisma.tournament.update({
      where: { id: params.id },
      data: { registrationDivisions: JSON.stringify(updated) },
    })
    return NextResponse.json({ name: name.trim() })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create division' }, { status: 500 })
  }
}

// PATCH: rename a division (cascade to teams, pools, games)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const { oldName, newName } = await req.json()
    if (!oldName || !newName?.trim()) return NextResponse.json({ error: 'oldName and newName required' }, { status: 400 })

    // Find all teams in this division via registrations.
    // Deliberately NOT filtered by deletedAt: a removed registration can be restored,
    // and if its teams kept the old division name they would come back into a division
    // that no longer exists -- which is how the stray legacy divisions got there.
    const teams = await prisma.registeredTeam.findMany({
      where: { registration: { tournamentId: params.id }, division: oldName },
      select: { id: true },
    })

    await Promise.all([
      // Update all RegisteredTeam records
      ...teams.map(t => prisma.registeredTeam.update({ where: { id: t.id }, data: { division: newName.trim() } })),
      // Update pools
      prisma.pool.updateMany({
        where: { tournamentId: params.id, division: oldName },
        data: { division: newName.trim() },
      }).catch(() => {}),
      // Update games
      prisma.game.updateMany({
        where: { tournamentId: params.id, division: oldName },
        data: { division: newName.trim() },
      }).catch(() => {}),
      // Update brackets
      prisma.bracket.updateMany({
        where: { tournamentId: params.id, division: oldName },
        data: { division: newName.trim() },
      }).catch(() => {}),
    ])

    // Update registrationDivisions list + DivisionColor key
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id }, select: { registrationDivisions: true },
    })
    const regDivs: string[] = JSON.parse(tournament?.registrationDivisions ?? '[]')
    const updatedDivs = regDivs.map(d => d === oldName ? newName.trim() : d)
    await prisma.tournament.update({
      where: { id: params.id },
      data: { registrationDivisions: JSON.stringify(updatedDivs) },
    })

    return NextResponse.json({ ok: true, count: teams.length })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to rename division' }, { status: 500 })
  }
}

// DELETE: remove a division (fails if teams exist)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const { name, force } = await req.json()
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    // Live teams only: a division holding nothing but removed registrations reads as
    // empty on screen, so blocking its deletion over them is an error the organizer
    // cannot act on or even see.
    const teamCount = await prisma.registeredTeam.count({
      where: { registration: { tournamentId: params.id, deletedAt: null }, division: name },
    })

    if (teamCount > 0 && !force) {
      return NextResponse.json({ error: `${teamCount} team(s) still in this division. Move or delete them first.`, teamCount }, { status: 409 })
    }

    // Remove from registrationDivisions
    const tournament = await prisma.tournament.findUnique({
      where: { id: params.id }, select: { registrationDivisions: true },
    })
    const regDivs: string[] = JSON.parse(tournament?.registrationDivisions ?? '[]')
    await prisma.tournament.update({
      where: { id: params.id },
      data: { registrationDivisions: JSON.stringify(regDivs.filter(d => d !== name)) },
    })

    // Delete pools and games for this division
    await prisma.pool.deleteMany({ where: { tournamentId: params.id, division: name } }).catch(() => {})
    await prisma.game.deleteMany({ where: { tournamentId: params.id, division: name } }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete division' }, { status: 500 })
  }
}
