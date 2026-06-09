import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const [
    tournamentCount,
    workerCount,
    registrationCount,
    teamCount,
    paymentAgg,
    invoiceAgg,
    recentTournaments,
    recentRegs,
  ] = await Promise.all([
    prisma.tournament.count(),
    prisma.worker.count(),
    prisma.teamRegistration.count({ where: { deletedAt: null } }),
    prisma.registeredTeam.count(),
    prisma.registrationPayment.aggregate({ _sum: { amount: true } }),
    prisma.teamRegistration.aggregate({
      where: { deletedAt: null },
      _sum: { invoiceAmount: true, discountAmount: true },
    }),
    prisma.tournament.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, sport: true, startDate: true, endDate: true, createdAt: true },
    }),
    prisma.teamRegistration.findMany({
      where: { deletedAt: null, OR: [{ numTeams: { gt: 0 } }, { invoiceAmount: { gt: 0 } }] },
      take: 8,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        clubName: true,
        clubContact: true,
        numTeams: true,
        invoiceAmount: true,
        discountAmount: true,
        createdAt: true,
        tournament: { select: { name: true } },
        payments: { select: { amount: true } },
      },
    }),
  ])

  return NextResponse.json({
    tournamentCount,
    workerCount,
    registrationCount,
    teamCount,
    totalInvoiced: (invoiceAgg._sum.invoiceAmount ?? 0) - (invoiceAgg._sum.discountAmount ?? 0),
    totalReceived: paymentAgg._sum.amount ?? 0,
    recentTournaments,
    recentRegs: recentRegs.map(r => ({
      ...r,
      paid: r.payments.reduce((s, p) => s + p.amount, 0),
    })),
  })
}
