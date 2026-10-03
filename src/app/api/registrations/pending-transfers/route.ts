import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMoney } from '@/lib/apiAuth'
import { clearingTransfers } from '@/lib/pendingTransfers'

// Bank transfers still clearing, per registration, for the staff registrations
// page. Separate from the registrations list so a slow or unreachable Stripe
// never holds up the page; it fills in a moment later. See lib/pendingTransfers.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireMoney()
  if (!gate.ok) return gate.res
  const tournamentId = req.nextUrl.searchParams.get('tournamentId') || ''
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })
  const regs = await prisma.teamRegistration.findMany({ where: { tournamentId, deletedAt: null }, select: { id: true } })
  const clearing = await clearingTransfers(regs.map(r => r.id))
  return NextResponse.json({ clearing })
}
