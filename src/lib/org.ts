// Reading an org off a tournament.
//
// WHY THIS EXISTS: `Tournament.orgId` and the whole `Organization` table are RAW
// SQL - created by /api/admin/org-migrate, never added to prisma/schema.prisma.
// So `prisma.tournament.findUnique()` does not return `orgId` (it isn't a schema
// column) and `prisma.organization` is undefined on the typed client. Code that
// reads them the Prisma way gets undefined / throws and silently falls back to
// "no org" - which is exactly how registration confirmations ended up with a
// blank org name, whistleready.app links, and zero notification recipients.
//
// Go through here instead of hand-rolling the raw SQL again.
import { prisma } from '@/lib/db'

export type Org = {
  id: string
  name: string
  slug: string
  contactEmail: string
  contactPhone: string
  logoUrl: string
  website: string
}

/** The id of the org that owns a tournament, or null. Never throws. */
export async function tournamentOrgId(tournamentId: string): Promise<string | null> {
  if (!tournamentId) return null
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT orgId FROM "Tournament" WHERE id = ?', tournamentId)
    return (rows?.[0]?.orgId as string) || null
  } catch {
    return null
  }
}

/** One org by id, or null. Never throws. */
export async function orgById(orgId: string | null | undefined): Promise<Org | null> {
  if (!orgId) return null
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT id, name, slug, contactEmail, contactPhone, logoUrl, website FROM "Organization" WHERE id = ?', orgId)
    return (rows?.[0] as Org) || null
  } catch {
    return null
  }
}

/** Convenience: tournament id -> its org (or null). */
export async function orgForTournament(tournamentId: string): Promise<Org | null> {
  return orgById(await tournamentOrgId(tournamentId))
}
