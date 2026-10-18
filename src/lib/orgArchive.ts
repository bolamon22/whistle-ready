// Archiving an organization (Bo, Oct 18 2026: "I need to be able to delete orgs or
// archive ones that actually have a history"). Archived keeps everything, but closes
// it: its people can't open it (lib/orgMembers leaves it out of every login's
// organizations), its public site and event pages go offline (middleware, from
// /api/archived-orgs), the public event list leaves its events out, and its
// scheduled club emails, weekly digest, housing report and social posts stop.
// Restore puts it all back. Raw columns Organization.archivedAt / archivedBy.
// Server only.

import { prisma } from '@/lib/db'

/** The one organization that can never be archived or deleted. */
export const MAIN_ORG_SLUG = 'sunshine-events-group'

let ensured = false
export async function ensureArchiveCols(): Promise<void> {
  if (ensured) return
  let ok = true
  for (const col of ['archivedAt', 'archivedBy']) {
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "Organization" ADD COLUMN "${col}" TEXT`) }
    catch (e) { if (!/duplicate column|already exists/i.test(String((e as Error)?.message ?? e))) ok = false }   // else it's there
  }
  ensured = ok   // a failed connection tries again next time
}

const TTL_MS = 30_000
let cache: { at: number; ids: Set<string> } | null = null
/** After archiving or restoring: this instance reads again (others within 30 s). */
export function forgetArchived(): void { cache = null }

/** The archived organizations' ids. Never throws: a failed read counts as none
 *  archived, so a database hiccup can't shut anyone out of their organization. */
export async function archivedOrgIds(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.ids
  let ids = new Set<string>()
  try {
    await ensureArchiveCols()
    const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "Organization" WHERE "archivedAt" IS NOT NULL AND "archivedAt" <> ''`)
    ids = new Set(rows.map(r => String(r.id)))
  } catch { /* none archived */ }
  cache = { at: Date.now(), ids }
  return ids
}

export async function isOrgArchived(orgId: string | null | undefined): Promise<boolean> {
  return !!orgId && (await archivedOrgIds()).has(String(orgId))
}

/** What the middleware needs to take archived organizations offline: their slugs
 *  (the public site, /o/<slug>) and their events' ids (the public event pages). */
export async function archivedPublicLists(): Promise<{ slugs: string[]; tournamentIds: string[] }> {
  const ids = Array.from(await archivedOrgIds())
  if (!ids.length) return { slugs: [], tournamentIds: [] }
  try {
    const marks = ids.map(() => '?').join(', ')
    const [orgs, events] = await Promise.all([
      prisma.$queryRawUnsafe<{ slug: string }[]>(`SELECT slug FROM "Organization" WHERE id IN (${marks})`, ...ids),
      prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id FROM "Tournament" WHERE orgId IN (${marks})`, ...ids),
    ])
    return { slugs: orgs.map(o => String(o.slug || '').toLowerCase()).filter(Boolean), tournamentIds: events.map(e => String(e.id)) }
  } catch { return { slugs: [], tournamentIds: [] } }
}

/** The archived organizations' events, for lists that leave them out. */
export async function archivedTournamentIds(): Promise<Set<string>> {
  return new Set((await archivedPublicLists()).tournamentIds)
}

export type ArchiveResult = { ok: true; archivedAt: string | null } | { ok: false; status: number; error: string }

export async function setArchived(orgId: string, archived: boolean, by: string): Promise<ArchiveResult> {
  await ensureArchiveCols()
  const rows = await prisma.$queryRawUnsafe<{ id: string; slug: string }[]>(`SELECT id, slug FROM "Organization" WHERE id = ?`, orgId)
  if (!rows[0]) return { ok: false, status: 404, error: 'Not found' }
  if (archived && String(rows[0].slug) === MAIN_ORG_SLUG) return { ok: false, status: 400, error: 'Sunshine Events Group can’t be archived.' }
  const at = archived ? new Date().toISOString() : null
  await prisma.$executeRawUnsafe(`UPDATE "Organization" SET "archivedAt" = ?, "archivedBy" = ? WHERE id = ?`, at, archived ? String(by || '').slice(0, 120) : null, orgId)
  forgetArchived()
  return { ok: true, archivedAt: at }
}
