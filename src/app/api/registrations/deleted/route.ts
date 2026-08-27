import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

export async function GET(req: NextRequest) {
  // Auth (Aug 2026): staff only — was previously callable with no auth and
  // returned full contact info for a whole tournament.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json([])

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)

  // Hard-purge anything older than 30 days (Bo's safety window, Aug 2026)
  await prisma.teamRegistration.deleteMany({
    where: {
      tournamentId,
      deletedAt: { not: null, lt: cutoff },
    },
  })

  const deleted = await prisma.teamRegistration.findMany({
    where: { tournamentId, deletedAt: { not: null } },
    include: { teams: true },
    orderBy: { deletedAt: 'desc' },
  })
  return NextResponse.json(deleted)
}
