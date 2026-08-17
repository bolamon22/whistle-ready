import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const fromId = searchParams.get('from')
  if (!fromId) return NextResponse.json({ error: 'from param required' }, { status: 400 })

  const [srcRegs, curRegs] = await Promise.all([
    prisma.teamRegistration.findMany({
      where: { tournamentId: fromId, deletedAt: null },
      include: { teams: { select: { teamName: true, division: true } } },
    }),
    prisma.teamRegistration.findMany({
      where: { tournamentId: params.id, deletedAt: null },
      select: { clubName: true },
    }),
  ])

  const currentClubs = new Set(curRegs.map(r => r.clubName.trim().toLowerCase()))

  const rows = srcRegs.map(r => ({
    id: r.id,
    clubName: r.clubName,
    contactName: r.clubContact,
    contactEmail: r.contactEmail,
    numTeams: r.numTeams,
    divisions: [...new Set(r.teams.map(t => t.division))],
    registered: currentClubs.has(r.clubName.trim().toLowerCase()),
  }))

  rows.sort((a, b) => Number(a.registered) - Number(b.registered) || a.clubName.localeCompare(b.clubName))

  return NextResponse.json(rows)
}
