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
  // Merged duplicates are soft-deleted too; say where they went so nobody "restores" an empty shell.
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT d.id, d."mergedIntoId" AS mergedIntoId, t."clubName" AS mergedIntoName
         FROM "TeamRegistration" d LEFT JOIN "TeamRegistration" t ON t.id = d."mergedIntoId"
        WHERE d."tournamentId" = ? AND d."deletedAt" IS NOT NULL AND d."mergedIntoId" <> ''`, tournamentId)
    const byId = new Map((rows || []).map(r => [r.id, r]))
    return NextResponse.json(deleted.map(d => ({ ...d, mergedIntoId: byId.get(d.id)?.mergedIntoId || '', mergedIntoName: byId.get(d.id)?.mergedIntoName || '' })))
  } catch {
    return NextResponse.json(deleted)
  }
}
