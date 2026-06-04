import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [tournaments, teams, playerLinks] = await Promise.all([
    prisma.userTournamentFollow.findMany({ where: { userId: session.user.id } }),
    prisma.userTeamFollow.findMany({ where: { userId: session.user.id } }),
    prisma.parentPlayerLink.findMany({
      where: { userId: session.user.id },
      include: { playerReg: { select: { id: true, playerName: true, teamClubName: true, tournamentId: true } } },
    }).catch(() => []),
  ])

  return NextResponse.json({
    tournaments: tournaments.map(f => f.tournamentId),
    teams: teams.map(f => ({ tournamentId: f.tournamentId, teamName: f.teamName })),
    players: (playerLinks as any[]).map(l => l.playerReg).filter(Boolean),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { type, tournamentId, teamName } = await req.json()

  if (type === 'tournament') {
    await prisma.userTournamentFollow.upsert({
      where: { userId_tournamentId: { userId: session.user.id, tournamentId } },
      update: {},
      create: { userId: session.user.id, tournamentId },
    })
  } else if (type === 'team') {
    await prisma.userTeamFollow.upsert({
      where: { userId_tournamentId_teamName: { userId: session.user.id, tournamentId, teamName } },
      update: {},
      create: { userId: session.user.id, tournamentId, teamName },
    })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { type, tournamentId, teamName } = await req.json()

  if (type === 'tournament') {
    await prisma.userTournamentFollow.deleteMany({ where: { userId: session.user.id, tournamentId } })
  } else if (type === 'team') {
    await prisma.userTeamFollow.deleteMany({ where: { userId: session.user.id, tournamentId, teamName } })
  }
  return NextResponse.json({ ok: true })
}
