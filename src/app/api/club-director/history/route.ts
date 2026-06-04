import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get all club links for this user across all tournaments
  const links = await prisma.clubDirectorLink.findMany({
    where: { userId: session.user.id },
  })
  if (links.length === 0) return NextResponse.json([])

  // Group by tournament
  const tournamentIds = Array.from(new Set(links.map(l => l.tournamentId)))
  const clubsByTournament: Record<string, string[]> = {}
  for (const l of links) {
    if (!clubsByTournament[l.tournamentId]) clubsByTournament[l.tournamentId] = []
    clubsByTournament[l.tournamentId].push(l.clubName)
  }

  const tournaments = await prisma.tournament.findMany({
    where: { id: { in: tournamentIds } },
    orderBy: { startDate: 'desc' },
  })

  const history = await Promise.all(tournaments.map(async (t) => {
    const clubNames = clubsByTournament[t.id] ?? []

    // Registrations & payments
    const registrations = await prisma.teamRegistration.findMany({
      where: { tournamentId: t.id, clubName: { in: clubNames } },
      include: {
        teams: true,
        payments: { orderBy: { receivedAt: 'asc' } },
      },
    })

    const teamNames = registrations.flatMap(r => r.teams.map(tm => tm.teamName)).filter(Boolean)

    // Games involving these teams
    const games = teamNames.length > 0 ? await prisma.game.findMany({
      where: {
        tournamentId: t.id,
        OR: [{ team1: { in: teamNames } }, { team2: { in: teamNames } }],
      },
    }) : []

    // Calculate W/L/T record per team
    const record = { wins: 0, losses: 0, ties: 0, gamesPlayed: 0 }
    const championshipWins: string[] = []
    for (const g of games) {
      if (g.score1 === null || g.score2 === null) continue
      const myTeam = teamNames.includes(g.team1) ? 'team1' : 'team2'
      const myScore = myTeam === 'team1' ? g.score1 : g.score2
      const oppScore = myTeam === 'team1' ? g.score2 : g.score1
      record.gamesPlayed++
      if (myScore > oppScore) {
        record.wins++
        if (g.isChampionship) {
          const teamName = myTeam === 'team1' ? g.team1 : g.team2
          championshipWins.push(`${teamName} (${g.division})`)
        }
      } else if (myScore < oppScore) {
        record.losses++
      } else {
        record.ties++
      }
    }

    // Financial summary
    const invoiceTotal = registrations.reduce((s, r) => s + r.invoiceAmount - r.discountAmount, 0)
    const paidTotal = registrations.reduce((s, r) => s + r.payments.reduce((ps, p) => ps + p.amount, 0), 0)
    const allPayments = registrations.flatMap(r =>
      r.payments.map(p => ({ ...p, clubName: r.clubName }))
    ).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))

    return {
      tournament: {
        id: t.id, name: t.name, sport: t.sport,
        startDate: t.startDate, endDate: t.endDate,
        location: t.location, logoUrl: t.logoUrl,
      },
      clubs: clubNames,
      teams: registrations.flatMap(r => r.teams),
      registrations: registrations.map(r => ({
        id: r.id, clubName: r.clubName, clubContact: r.clubContact,
        contactEmail: r.contactEmail, contactPhone: r.contactPhone,
        clubBasedIn: r.clubBasedIn, clubWebsite: r.clubWebsite,
        paymentMethod: r.paymentMethod, notes: r.notes,
        numTeams: r.numTeams, needsHotel: r.needsHotel,
        teams: r.teams,
      })),
      record,
      championshipWins,
      finance: { invoiceTotal, paidTotal, balance: invoiceTotal - paidTotal, payments: allPayments },
    }
  }))

  return NextResponse.json(history)
}
