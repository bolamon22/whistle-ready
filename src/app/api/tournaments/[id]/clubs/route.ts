import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { tournamentOrgId } from '@/lib/org'
import { cleanName } from '@/lib/names'

// Club names already on file for this organizer (every event, most recently
// used first). Public on purpose: the registration form uses it to warn
// "already on file as …" before a club gets spelled two ways. Names only —
// no contacts, no counts.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const orgId = await tournamentOrgId(params.id)
    const rows = orgId
      ? await prisma.$queryRawUnsafe<any[]>(
          `SELECT r."clubName" AS name, MAX(r."createdAt") AS last
             FROM "TeamRegistration" r JOIN "Tournament" t ON t.id = r."tournamentId"
            WHERE t."orgId" = ? AND r."deletedAt" IS NULL AND r."clubName" <> ''
            GROUP BY r."clubName" ORDER BY last DESC LIMIT 3000`, orgId)
      : await prisma.$queryRawUnsafe<any[]>(
          `SELECT r."clubName" AS name, MAX(r."createdAt") AS last
             FROM "TeamRegistration" r
            WHERE r."tournamentId" = ? AND r."deletedAt" IS NULL AND r."clubName" <> ''
            GROUP BY r."clubName" ORDER BY last DESC LIMIT 3000`, params.id)
    const seen = new Set<string>()
    const clubs: string[] = []
    for (const r of rows || []) {
      const name = cleanName(r?.name)
      if (!name || seen.has(name)) continue
      seen.add(name); clubs.push(name)
    }
    return NextResponse.json({ clubs })
  } catch (e) {
    console.error('clubs list failed:', e)
    return NextResponse.json({ clubs: [] })
  }
}
