import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const [teams, tournament, games] = await Promise.all([
      prisma.registeredTeam.findMany({
        where: { registration: { tournamentId: params.id } },
        select: { division: true },
      }),
      prisma.tournament.findUnique({ where: { id: params.id }, select: { registrationDivisions: true } }),
      prisma.game.findMany({
        where: { tournamentId: params.id, pool: { not: null } },
        select: { division: true },
      }),
    ])

    let pools: { division: string; teamNames: string }[] = []
    try {
      pools = await prisma.pool.findMany({
        where: { tournamentId: params.id },
        select: { division: true, teamNames: true },
      })
    } catch { /* Pool table not migrated yet */ }

    const divMap = new Map<string, { teams: number; pools: number; assignedTeams: number; gameCount: number }>()

    // Seed from registrationDivisions so empty divisions show up
    const regDivs: string[] = JSON.parse(tournament?.registrationDivisions ?? '[]')
    for (const name of regDivs) {
      if (!divMap.has(name)) divMap.set(name, { teams: 0, pools: 0, assignedTeams: 0, gameCount: 0 })
    }

    for (const t of teams) {
      const cur = divMap.get(t.division) ?? { teams: 0, pools: 0, assignedTeams: 0, gameCount: 0 }
      divMap.set(t.division, { ...cur, teams: cur.teams + 1 })
    }
    for (const p of pools) {
      const cur = divMap.get(p.division) ?? { teams: 0, pools: 0, assignedTeams: 0, gameCount: 0 }
      const names: string[] = JSON.parse(p.teamNames || '[]')
      divMap.set(p.division, { ...cur, pools: cur.pools + 1, assignedTeams: cur.assignedTeams + names.length })
    }
    for (const g of games) {
      const cur = divMap.get(g.division) ?? { teams: 0, pools: 0, assignedTeams: 0, gameCount: 0 }
      divMap.set(g.division, { ...cur, gameCount: cur.gameCount + 1 })
    }

    const divisions = [...divMap.entries()]
      .map(([name, data]) => ({
        name,
        teamCount: data.teams,
        poolCount: data.pools,
        unassignedTeams: Math.max(0, data.teams - data.assignedTeams),
        gameCount: data.gameCount,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json(divisions)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load divisions' }, { status: 500 })
  }
}

// POST: create a new division
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
    const updated = [...existing, name.trim()].sort((a, b) => a.localeCompare(b))
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
  try {
    const { oldName, newName } = await req.json()
    if (!oldName || !newName?.trim()) return NextResponse.json({ error: 'oldName and newName required' }, { status: 400 })

    // Find all teams in this division via registrations
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
  try {
    const { name, force } = await req.json()
    if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })

    const teamCount = await prisma.registeredTeam.count({
      where: { registration: { tournamentId: params.id }, division: name },
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

    // Delete pools for this division
    await prisma.pool.deleteMany({ where: { tournamentId: params.id, division: name } }).catch(() => {})

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete division' }, { status: 500 })
  }
}
