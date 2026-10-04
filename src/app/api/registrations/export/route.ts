import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { ensurePaymentGuard } from '@/lib/paymentGuard'
import { requireMoney } from '@/lib/apiAuth'

// Every club's contact, email, phone, invoice, payments and staff notes, as CSV.
// It had no sign-in check: anyone with a tournament id (it is in every public
// link) could download it signed out. Found Oct 4 2026 while checking how a club
// knew Fall Classic's division counts. Director/admin only now, the same people
// who see money on the registrations page. Nothing in the app links here.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireMoney()
  if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })

  await ensurePaymentGuard()
  const registrations = await prisma.teamRegistration.findMany({
    where: { tournamentId, deletedAt: null },
    include: {
      teams: true,
      payments: { orderBy: { receivedAt: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Build CSV rows
  const rows: string[][] = []

  // Header
  rows.push([
    'Club Name',
    'Contact',
    'Email',
    'Phone',
    'Based In',
    'Teams',
    'Divisions',
    'Needs Hotel',
    'Payment Method',
    'Invoice Amount',
    'Amount Paid',
    'Balance Due',
    'Notes',
    'Registered',
  ])

  for (const reg of registrations) {
    const paid = reg.payments.reduce((sum, p) => sum + p.amount, 0)
    const balance = (reg.invoiceAmount - reg.discountAmount) - paid
    const divisions = [...new Set(reg.teams.map(t => t.division))].join('; ')

    rows.push([
      reg.clubName,
      reg.clubContact,
      reg.contactEmail,
      reg.contactPhone,
      reg.clubBasedIn || '',
      String(reg.teams.length || reg.numTeams),
      divisions,
      reg.needsHotel || 'No',
      reg.paymentMethod,
      String((reg.invoiceAmount - reg.discountAmount).toFixed(2)),
      String(paid.toFixed(2)),
      String(balance.toFixed(2)),
      reg.notes || '',
      new Date(reg.createdAt).toLocaleDateString('en-US'),
    ])
  }

  const csv = rows
    .map(row => row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(','))
    .join('\r\n')

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="registrations.csv"',
    },
  })
}
