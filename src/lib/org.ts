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
  zelleHandle: string
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
      'SELECT id, name, slug, contactEmail, contactPhone, logoUrl, website, zelleHandle FROM "Organization" WHERE id = ?', orgId)
    return (rows?.[0] as Org) || null
  } catch {
    return null
  }
}

/** One org by slug, or null. Never throws. Used on custom domains, where the
 *  host is all we have to go on (login branding, public org pages). */
export async function orgBySlug(slug: string | null | undefined): Promise<Org | null> {
  if (!slug) return null
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT id, name, slug, contactEmail, contactPhone, logoUrl, website, zelleHandle FROM "Organization" WHERE slug = ?', slug)
    return (rows?.[0] as Org) || null
  } catch {
    return null
  }
}

/** Convenience: tournament id -> its org (or null). */
export async function orgForTournament(tournamentId: string): Promise<Org | null> {
  return orgById(await tournamentOrgId(tournamentId))
}

/**
 * The org's logo as a URL a mail client can actually fetch.
 *
 * `Organization.logoUrl` can still hold an inlined `data:` URI — /api/upload
 * falls back to one when its DB write fails, and the image migration was only
 * ever run against the orgSite settings record. The public site already works
 * around this by preferring the settings logo (see src/app/o/[slug]/page.tsx,
 * which does `if (content.logo) org.logoUrl = content.logo`), which points at
 * /api/img/<id>. Email has to do the same: a data: URI doesn't render in any
 * mail client, and pasting 271 KB of base64 into an <img src> pushed the whole
 * message past Gmail's ~102 KB clip limit so it arrived blank.
 *
 * Returns '' when neither source has a fetchable URL — the email shell drops
 * the logo cleanly rather than shipping a broken one.
 */
export async function orgLogoUrl(orgId: string | null | undefined, dbLogoUrl?: string | null): Promise<string> {
  const usable = (u: unknown): string => {
    const s = String(u || '').trim()
    return s && !/^data:/i.test(s) ? s : ''
  }
  let settingsLogo = ''
  if (orgId) {
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(
        'SELECT value FROM "AppSetting" WHERE key = ?', `orgSite:${orgId}`)
      settingsLogo = usable(JSON.parse(rows?.[0]?.value || '{}').logo)
    } catch { /* fall through to the column */ }
  }
  return settingsLogo || usable(dbLogoUrl)
}
