import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Public by design: the registration id in the URL is the capability (same model
// as /claim links). Returns ONLY what the public pay page needs — no contact info.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const reg = await prisma.teamRegistration.findUnique({
      where: { id: params.id },
      include: { teams: true, payments: true },
    })
    if (!reg || reg.deletedAt) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })

    const tournament = await prisma.tournament.findUnique({
      where: { id: reg.tournamentId },
      select: { id: true, name: true, startDate: true, endDate: true, location: true, logoUrl: true },
    })

    const paid = reg.payments.reduce((s, p) => s + p.amount, 0)
    const due = (reg.invoiceAmount || 0) - (reg.discountAmount || 0)
    const balance = Math.round(Math.max(0, due - paid) * 100) / 100

    return NextResponse.json({
      clubName: reg.clubName,
      teamCount: reg.teams.length,
      // Itemized roster so clubs can see exactly what the invoice covers.
      // Team name + division only — never coach contact info on a public route.
      teams: reg.teams.map(t => ({ team: t.teamName, division: t.division })),
      tournamentId: reg.tournamentId,
      tournamentName: tournament?.name || '',
      tournamentDates: tournament?.startDate
        ? `${tournament.startDate}${tournament.endDate && tournament.endDate !== tournament.startDate ? ' to ' + tournament.endDate : ''}`
        : '',
      location: tournament?.location || '',
      logoUrl: tournament?.logoUrl || '',
      due, paid, balance,
      paidInFull: due > 0 && balance <= 0,
      noInvoice: due <= 0,
    })
  } catch (e) {
    console.error('pay-info failed:', e)
    return NextResponse.json({ error: 'Failed to load' }, { status: 500 })
  }
}
