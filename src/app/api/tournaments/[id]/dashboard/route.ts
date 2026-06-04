import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const id = params.id

  const [tournament, games, registrations, rosterEntries, allAssignments, timeEntries, staffPayments, transactions, playerCount] = await Promise.all([
    prisma.tournament.findUnique({ where: { id } }),
    prisma.game.findMany({ where: { tournamentId: id }, select: { id: true, division: true, isCanceled: true, assignments: { select: { id: true } } } }),
    prisma.teamRegistration.findMany({
      where: { tournamentId: id },
      include: { teams: { select: { id: true, division: true } }, payments: { select: { amount: true } } },
    }),
    prisma.rosterEntry.findMany({ where: { tournamentId: id }, select: { workerId: true } }),
    prisma.assignment.findMany({ where: { game: { tournamentId: id } }, select: { id: true, payRate: true, role: true } }),
    prisma.timeEntry.findMany({ where: { tournamentId: id }, include: { worker: { select: { hourlyRate: true } } } }),
    prisma.paymentRecord.findMany({ where: { tournamentId: id }, select: { amount: true } }),
    prisma.tournamentTransaction.findMany({ where: { tournamentId: id }, select: { type: true, category: true, amount: true } }),
    prisma.playerRegistration.count({ where: { tournamentId: id } }),
  ])

  if (!tournament) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Staff pay expenses
  function calcHours(e: { clockIn: string | null; clockOut: string | null; hoursManual: number | null }) {
    if (e.hoursManual != null) return e.hoursManual
    if (e.clockIn && e.clockOut) {
      const [ih, im] = e.clockIn.split(':').map(Number)
      const [oh, om] = e.clockOut.split(':').map(Number)
      return Math.max(0, (oh * 60 + om - (ih * 60 + im)) / 60)
    }
    return 0
  }
  const refPayTotal = allAssignments.reduce((s, a) => s + a.payRate, 0)
  const hourlyPayTotal = timeEntries.reduce((te, e) => te + calcHours(e) * (e.worker.hourlyRate ?? 0), 0)
  const totalStaffExpense = refPayTotal + hourlyPayTotal
  const totalStaffPaid = staffPayments.reduce((s, p) => s + p.amount, 0)
  const refCount = allAssignments.filter(a => a.role.startsWith('ref')).length
  const skCount = allAssignments.filter(a => a.role === 'scorekeeper').length

  // Other income & expenses (transactions)
  const otherIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const otherExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
  const txByCategory  = transactions.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount
    return acc
  }, {} as Record<string, number>)

  // Games summary
  const activeGames = games.filter(g => !g.isCanceled)
  const totalAssignmentSlots = activeGames.reduce((s, g) => s + g.assignments.length, 0)
  const divisions = [...new Set(activeGames.map(g => g.division).filter(Boolean))]

  // Registration summary
  const totalClubs = registrations.length
  const totalTeams = registrations.reduce((s, r) => s + r.teams.length, 0)
  const totalInvoiced = registrations.reduce((s, r) => s + r.invoiceAmount - r.discountAmount, 0)
  const totalReceived = registrations.reduce((s, r) => s + r.payments.reduce((p, x) => p + x.amount, 0), 0)
  const totalBalance = totalInvoiced - totalReceived

  // Payment method breakdown
  const byMethod: Record<string, number> = {}
  for (const reg of registrations) {
    byMethod[reg.paymentMethod] = (byMethod[reg.paymentMethod] || 0) + 1
  }

  // Division breakdown from registrations
  const divisionCounts: Record<string, number> = {}
  for (const reg of registrations) {
    for (const team of reg.teams) {
      divisionCounts[team.division] = (divisionCounts[team.division] || 0) + 1
    }
  }

  // Hotel needs
  const hotelYes = registrations.filter(r => r.needsHotel === 'Yes').length
  const hotelMaybe = registrations.filter(r => r.needsHotel === 'Maybe').length

  // Paid in full vs outstanding
  const paidInFull = registrations.filter(r => {
    const paid = r.payments.reduce((s, p) => s + p.amount, 0)
    return r.invoiceAmount > 0 && paid >= (r.invoiceAmount - r.discountAmount)
  }).length

  return NextResponse.json({
    tournament,
    games: {
      total: games.length,
      active: activeGames.length,
      canceled: games.length - activeGames.length,
      assigned: totalAssignmentSlots,
      divisions: divisions.length,
    },
    staff: {
      onRoster: rosterEntries.length,
      refPayTotal,
      hourlyPayTotal,
      totalStaffExpense,
      totalStaffPaid,
      refCount,
      skCount,
    },
    financials: {
      otherIncome,
      otherExpenses,
      txByCategory,
    },
    registrations: {
      clubs: totalClubs,
      teams: totalTeams,
      invoiced: totalInvoiced,
      received: totalReceived,
      balance: totalBalance,
      paidInFull,
      outstanding: totalClubs - paidInFull,
      byMethod,
      byDivision: divisionCounts,
      hotelYes,
      hotelMaybe,
    },
    playerCount,
  })
}
