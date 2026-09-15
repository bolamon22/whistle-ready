import { prisma } from '@/lib/db'

// Contributed gallery media -- the photos and clips credentialed photographers
// upload after an event.
//
// WHY A TABLE, when the curated gallery lives happily in orgSite:{orgId}.gallery:
// that JSON field ships inside the HTML of every gallery page load. Measured on
// sunshineeventsgroup.com/gallery on Sep 15 2026: 193 photos, 84,521 bytes of
// HTML, about 437 bytes per photo. Three photographers at one weekend put four
// figures of photos in there, which is most of a megabyte of HTML before a single
// image loads -- and the site admin already carries a 100-per-tournament cap that
// exists for exactly this reason. Contributions go in a table and are paged; Bo's
// hand-picked set stays where it is, because it is small and he edits it by hand.
//
// Uploads land as 'pending'. A credential is permission to be on the field, not
// permission to publish to the front of the website -- somebody looks at a frame
// of somebody's kid before the public does.
//
// Raw SQL like Tournament and Organization: this table is created on demand rather
// than living in schema.prisma, matching how UploadedImage and AppSetting are
// handled here.

export type GalleryKind = 'photo' | 'video'
export type GalleryStatus = 'pending' | 'published' | 'hidden'

export type GalleryMedia = {
  id: string
  orgId: string
  tournamentId: string
  url: string
  kind: GalleryKind
  caption: string
  credit: string
  photographerSlug: string
  submissionId: string
  status: GalleryStatus
  bytes: number
  width: number
  height: number
  durationMs: number
  createdAt: string
}

let ensured = false

export async function ensureGalleryTable(): Promise<void> {
  if (ensured) return
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "GalleryMedia" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "orgId" TEXT NOT NULL,
      "tournamentId" TEXT NOT NULL DEFAULT '',
      "url" TEXT NOT NULL,
      "kind" TEXT NOT NULL DEFAULT 'photo',
      "caption" TEXT NOT NULL DEFAULT '',
      "credit" TEXT NOT NULL DEFAULT '',
      "photographerSlug" TEXT NOT NULL DEFAULT '',
      "submissionId" TEXT NOT NULL DEFAULT '',
      "status" TEXT NOT NULL DEFAULT 'pending',
      "bytes" INTEGER NOT NULL DEFAULT 0,
      "width" INTEGER NOT NULL DEFAULT 0,
      "height" INTEGER NOT NULL DEFAULT 0,
      "durationMs" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now'))
    )`)
    // The public page filters on all three of these on every load, and the review
    // screen pages through them; without the index that is a scan per request once
    // the table is doing its job.
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GalleryMedia_org_status_idx" ON "GalleryMedia" ("orgId","status","tournamentId")`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GalleryMedia_sub_idx" ON "GalleryMedia" ("submissionId")`)
    ensured = true
  } catch { /* a read will simply come back empty, which the callers handle */ }
}

const str = (x: unknown): string => String(x ?? '').trim()
const int = (x: unknown): number => (Number.isFinite(Number(x)) ? Math.max(0, Math.round(Number(x))) : 0)

function row(r: any): GalleryMedia {
  return {
    id: String(r.id), orgId: String(r.orgId),
    tournamentId: String(r.tournamentId || ''),
    url: String(r.url || ''),
    kind: (String(r.kind) === 'video' ? 'video' : 'photo'),
    caption: String(r.caption || ''), credit: String(r.credit || ''),
    photographerSlug: String(r.photographerSlug || ''),
    submissionId: String(r.submissionId || ''),
    status: (['pending', 'published', 'hidden'].includes(String(r.status)) ? String(r.status) : 'pending') as GalleryStatus,
    bytes: int(r.bytes), width: int(r.width), height: int(r.height), durationMs: int(r.durationMs),
    createdAt: String(r.createdAt || ''),
  }
}

export type NewMedia = {
  url: string
  kind?: GalleryKind
  tournamentId?: string
  caption?: string
  credit?: string
  photographerSlug?: string
  submissionId?: string
  bytes?: number
  width?: number
  height?: number
  durationMs?: number
  status?: GalleryStatus
}

/** Insert a batch. Returns the ids written; a row that fails is skipped rather than
 *  failing the whole upload -- a photographer who dropped 300 files should not lose
 *  299 of them to one bad record. */
export async function addGalleryMedia(orgId: string, items: NewMedia[]): Promise<string[]> {
  if (!orgId || !items?.length) return []
  await ensureGalleryTable()
  const ids: string[] = []
  for (const m of items) {
    const url = str(m.url)
    if (!url) continue
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    try {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "GalleryMedia"
         ("id","orgId","tournamentId","url","kind","caption","credit","photographerSlug","submissionId","status","bytes","width","height","durationMs")
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, orgId, str(m.tournamentId), url,
        m.kind === 'video' ? 'video' : 'photo',
        str(m.caption).slice(0, 200), str(m.credit).slice(0, 160), str(m.photographerSlug),
        str(m.submissionId),
        m.status && ['pending', 'published', 'hidden'].includes(m.status) ? m.status : 'pending',
        int(m.bytes), int(m.width), int(m.height), int(m.durationMs),
      )
      ids.push(id)
    } catch { /* skip this one */ }
  }
  return ids
}

export type ListArgs = {
  orgId: string
  status?: GalleryStatus | 'all'
  tournamentId?: string
  submissionId?: string
  limit?: number
  offset?: number
}

function where(a: ListArgs): { sql: string; args: any[] } {
  const parts = ['"orgId" = ?']
  const args: any[] = [a.orgId]
  if (a.status && a.status !== 'all') { parts.push('"status" = ?'); args.push(a.status) }
  if (a.tournamentId) { parts.push('"tournamentId" = ?'); args.push(a.tournamentId) }
  if (a.submissionId) { parts.push('"submissionId" = ?'); args.push(a.submissionId) }
  return { sql: parts.join(' AND '), args }
}

export async function listGalleryMedia(a: ListArgs): Promise<GalleryMedia[]> {
  if (!a.orgId) return []
  await ensureGalleryTable()
  const w = where(a)
  const limit = Math.min(Math.max(int(a.limit) || 60, 1), 500)
  const offset = int(a.offset)
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM "GalleryMedia" WHERE ${w.sql} ORDER BY "createdAt" DESC, "id" DESC LIMIT ? OFFSET ?`,
      ...w.args, limit, offset)
    return (rows || []).map(row)
  } catch { return [] }
}

export async function countGalleryMedia(a: ListArgs): Promise<number> {
  if (!a.orgId) return 0
  await ensureGalleryTable()
  const w = where(a)
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS n FROM "GalleryMedia" WHERE ${w.sql}`, ...w.args)
    return int((rows?.[0] as any)?.n)
  } catch { return 0 }
}

/** How many are waiting on somebody, per org -- the number the review screen badges. */
export async function pendingCount(orgId: string, tournamentId?: string): Promise<number> {
  return countGalleryMedia({ orgId, status: 'pending', tournamentId })
}

export async function setGalleryStatus(orgId: string, ids: string[], status: GalleryStatus): Promise<number> {
  if (!orgId || !ids?.length) return 0
  await ensureGalleryTable()
  let n = 0
  for (const id of ids.slice(0, 500)) {
    try {
      // orgId in the WHERE is the guard: an id from another org matches nothing.
      n += await prisma.$executeRawUnsafe(`UPDATE "GalleryMedia" SET "status" = ? WHERE "id" = ? AND "orgId" = ?`, status, str(id), orgId)
    } catch { /* skip */ }
  }
  return n
}

export async function patchGalleryMedia(orgId: string, id: string, patch: { caption?: string; tournamentId?: string }): Promise<boolean> {
  if (!orgId || !id) return false
  await ensureGalleryTable()
  const sets: string[] = []
  const args: any[] = []
  if (patch.caption !== undefined) { sets.push('"caption" = ?'); args.push(str(patch.caption).slice(0, 200)) }
  if (patch.tournamentId !== undefined) { sets.push('"tournamentId" = ?'); args.push(str(patch.tournamentId)) }
  if (!sets.length) return false
  try {
    const n = await prisma.$executeRawUnsafe(`UPDATE "GalleryMedia" SET ${sets.join(', ')} WHERE "id" = ? AND "orgId" = ?`, ...args, str(id), orgId)
    return n > 0
  } catch { return false }
}

export async function deleteGalleryMedia(orgId: string, ids: string[]): Promise<number> {
  if (!orgId || !ids?.length) return 0
  await ensureGalleryTable()
  let n = 0
  for (const id of ids.slice(0, 500)) {
    try { n += await prisma.$executeRawUnsafe(`DELETE FROM "GalleryMedia" WHERE "id" = ? AND "orgId" = ?`, str(id), orgId) } catch { /* skip */ }
  }
  return n
}

/** What the public gallery merges in, shaped like the curated photos beside it so
 *  the page and PublicGallery never have to care which store a photo came from. */
export type PublicPhoto = { id: string; url: string; caption?: string; credit?: string; tournamentId?: string; kind?: GalleryKind }

export async function publishedForOrg(orgId: string, limit = 240): Promise<PublicPhoto[]> {
  const rows = await listGalleryMedia({ orgId, status: 'published', limit })
  return rows.map(r => ({
    id: r.id, url: r.url, caption: r.caption, credit: r.credit,
    tournamentId: r.tournamentId || undefined, kind: r.kind,
  }))
}

/** Per-event counts and a cover, for the album grid, in one query each.
 *
 *  The album grid has to know an event has 800 contributed photos without the page
 *  loading 800 rows -- that is the whole point of moving them out of the JSON. The
 *  bare "url" beside MAX("createdAt") is SQLite's documented behaviour: it returns
 *  the url from the row that supplied the max, i.e. the newest photo. */
export async function publishedSummary(orgId: string): Promise<{
  total: number
  byTournament: Record<string, number>
  covers: Record<string, string>
}> {
  const out = { total: 0, byTournament: {} as Record<string, number>, covers: {} as Record<string, string> }
  if (!orgId) return out
  await ensureGalleryTable()
  try {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "tournamentId" AS t, COUNT(*) AS n, "url" AS u, MAX("createdAt") AS newest
       FROM "GalleryMedia"
       WHERE "orgId" = ? AND "status" = 'published' AND "kind" = 'photo'
       GROUP BY "tournamentId"`, orgId)
    for (const r of rows || []) {
      const key = String((r as any).t || '')
      const n = int((r as any).n)
      out.byTournament[key] = n
      out.total += n
      const u = String((r as any).u || '')
      if (u) out.covers[key] = u
    }
    // Video is published alongside photos but never used as a cover, so it is
    // counted separately rather than being left out of the album totals.
    const vid = await prisma.$queryRawUnsafe<any[]>(
      `SELECT "tournamentId" AS t, COUNT(*) AS n FROM "GalleryMedia"
       WHERE "orgId" = ? AND "status" = 'published' AND "kind" = 'video' GROUP BY "tournamentId"`, orgId)
    for (const r of vid || []) {
      const key = String((r as any).t || '')
      const n = int((r as any).n)
      out.byTournament[key] = (out.byTournament[key] || 0) + n
      out.total += n
    }
  } catch { /* an empty summary just means no contributed section */ }
  return out
}
