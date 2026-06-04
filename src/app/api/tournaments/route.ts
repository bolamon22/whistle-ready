import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      _count: { select: { games: true, teamRegistrations: true, playerRegistrations: true } },
      teamRegistrations: { select: { numTeams: true } },
    }
  })
  return NextResponse.json(tournaments.map(t => ({
    ...t,
    _count: {
      ...t._count,
      registeredTeams: t.teamRegistrations.reduce((s, r) => s + r.numTeams, 0),
    },
    teamRegistrations: undefined,
  })))
}
export async function POST(req: Request) {
  const { name, sport, startDate, endDate, location, scheduleIncrement } = await req.json()
  return NextResponse.json(await prisma.tournament.create({ data:{ name, sport:sport??'', startDate:startDate??'', endDate:endDate??'', location:location??'', scheduleIncrement:scheduleIncrement??50 } }), { status:201 })
}
