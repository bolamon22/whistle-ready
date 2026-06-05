import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET — list all divisions with team counts and pool counts
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const [teams, pools] = await Promise.all([
    prisma.registeredTeam.findMany({
      where: { registration: { tournamentId: params.id } },
      select: { division: true, teamName: true, clubName: true, coachName: true, coachPhone: true, coachEmail: true, id: true },
    }),
    prisma.pool.findMany({ where: { tournamentId: params.id } }),
  ])

  const divMap = new Map<string, { teams: typeof teams; pools: typeof pools }>()
  for (const t of teams) {
    if (!divMap.has(t.division)) divMap.set(t.division, { teams: [], pools: [] })
    divMap.get(t.division)!.teams.push(t)
  }
  for (const p of pools) {
    if (!divMap.has(p.division)) divMap.set(p.division, { teams: [], pools: [] })
    divMap.get(p.division)!.pools.push(p)
  }

  const divisions = [...divMap.entries()].map(([name, data]) => ({
    name,
    teamCount: data.teams.length,
    poolCount: data.pools.length,
  })).sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json(divisions)
}
