import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const teams = await prisma.registeredTeam.findMany({
      where: { registration: { tournamentId: params.id } },
      select: { division: true },
    })

    // Pool table may not exist yet — handle gracefully
    let pools: { division: string }[] = []
    try {
      pools = await prisma.pool.findMany({
        where: { tournamentId: params.id },
        select: { division: true },
      })
    } catch { /* Pool table not migrated yet */ }

    const divMap = new Map<string, { teams: number; pools: number }>()
    for (const t of teams) {
      const cur = divMap.get(t.division) ?? { teams: 0, pools: 0 }
      divMap.set(t.division, { ...cur, teams: cur.teams + 1 })
    }
    for (const p of pools) {
      const cur = divMap.get(p.division) ?? { teams: 0, pools: 0 }
      divMap.set(p.division, { ...cur, pools: cur.pools + 1 })
    }

    const divisions = [...divMap.entries()]
      .map(([name, data]) => ({ name, teamCount: data.teams, poolCount: data.pools }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json(divisions)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load divisions' }, { status: 500 })
  }
}
