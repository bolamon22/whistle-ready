import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// Org-wide money totals and the latest registrations with club contacts: admin
// only. Until Oct 3 2026 this route had no auth and nothing dynamic in it, so the
// build prerendered it and anyone could read the totals, club names and contact
// names at /api/admin/stats. Nothing in the app calls it today.
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    prisma.teamRegistration.count({ where: { deletedAt: null, OR: [{ numTeams: { gt: 0 } }, { invoiceAmount: { gt: 0 } }] } }),
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
