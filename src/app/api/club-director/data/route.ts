import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tournamentId = req.nextUrl.searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })

  // Get clubs this user is linked to for this tournament
  const links = await prisma.clubDirectorLink.findMany({
    where: { userId: session.user.id, tournamentId },
  })
  if (links.length === 0) return NextResponse.json({ clubs: [] })

  const clubNames = links.map(l => l.clubName)

  // Get registrations for their clubs only
  const registrations = await prisma.teamRegistration.findMany({
    where: { tournamentId, clubName: { in: clubNames } },
    include: {
      teams: true,
      payments: { select: { amount: true, method: true, receivedAt: true } },
    },
  })

  // Get player registrations for their clubs
  const playerRegs = await prisma.playerRegistration.findMany({
    where: { tournamentId, teamClubName: { in: clubNames } },
    orderBy: { playerName: 'asc' },
  })

  // Get games involving their teams
  const teamNames = registrations.flatMap(r => r.teams.map(t => t.teamName)).filter(Boolean)
  const games = await prisma.game.findMany({
    where: {
      tournamentId,
      OR: [
        { team1: { in: teamNames } },
        { team2: { in: teamNames } },
      ],
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  return NextResponse.json({ clubs: clubNames, registrations, playerRegs, games, teamNames })
}
