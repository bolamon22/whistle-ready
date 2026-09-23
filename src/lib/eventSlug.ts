// PRETTY, SELF-MAINTAINING EVENT URLS.
//
// /tournaments/monstermash26/event instead of /tournaments/cmqjrmdum0000f7po8pf4rgxo/event.
//
// THE OLD LINKS NEVER BREAK. The slug is an alias resolved in middleware, not a
// replacement: the cuid path still renders exactly as it always has, so every
// emailed letter, printed flyer, QR code and indexed page keeps working, and the
// 408 places in the app that build a URL from the id need no change at all.
//
// THE YEAR IS COMPUTED, NOT TYPED. Slugs must be unique, so each season needs its
// own -- and nobody should have to remember to retype it. The stored slug is
// base + two-digit year, and the year comes off the event's own start date. Copy
// Monster Mash 2026 into 2027 and `monstermash26` becomes `monstermash27` by
// itself; move an event's dates and the slug follows. Only the base is ever
// typed, and only once.

/** "Monster Mash Lax Clash" -> "monstermashlaxclash". Lowercase, no punctuation. */
export function slugifyBase(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 40)
}

/**
 * The base of an existing slug -- the part that stays the same year on year.
 * Strips a trailing 2- or 4-digit year and any separator before it, so both
 * `monstermash26` and `monster-mash-2026` come back as their base.
 */
export function slugBase(slug: string): string {
  return String(slug || '').toLowerCase().replace(/[-_]?(?:19|20)?\d{2}$/, '')
}

/** Two-digit year from an ISO date, or the current year when it has none yet. */
function yy(startDate?: string | null): string {
  const m = /^(\d{4})/.exec(String(startDate || ''))
  const year = m ? Number(m[1]) : new Date().getFullYear()
  return String(year % 100).padStart(2, '0')
}

/** base + the event's year. The whole point: the suffix is never hand-typed. */
export function eventSlug(base: string, startDate?: string | null): string {
  const b = slugifyBase(base) || 'event'
  return `${b}${yy(startDate)}`
}

/**
 * The slug a NEW event should get. `from` is the source slug when duplicating,
 * so the base carries over and only the year moves.
 */
export function slugForEvent(a: { name: string; startDate?: string | null; from?: string | null }): string {
  const base = (a.from && slugBase(a.from)) || slugifyBase(a.name)
  return eventSlug(base, a.startDate)
}

/** A cuid-looking id, as opposed to a slug someone typed. */
export function looksLikeId(seg: string): boolean {
  return /^c[a-z0-9]{16,}$/i.test(String(seg || ''))
}

/** First free variant of `slug` given the ones already taken. */
export function uniqueSlug(slug: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(s => String(s || '').toLowerCase()))
  if (!used.has(slug)) return slug
  for (let n = 2; n < 100; n++) {
    const c = `${slug}-${n}`
    if (!used.has(c)) return c
  }
  return `${slug}-${Date.now().toString(36).slice(-4)}`
}

// ---------------------------------------------------------------------------
// Persistence. `slug` is a raw column, like orgId and venues -- added here so no
// Prisma migration is needed and an older database simply behaves as it did.
import { prisma } from '@/lib/db'

async function ensureSlugColumn(): Promise<void> {
  try { await prisma.$executeRawUnsafe('ALTER TABLE "Tournament" ADD COLUMN "slug" TEXT NOT NULL DEFAULT \'\'') }
  catch { /* already there */ }
}

/**
 * Give a tournament its slug. Idempotent and never throws -- a create or a copy
 * must not fail because a URL alias could not be written.
 *
 * `from` is the SOURCE slug when duplicating: the base carries over and only the
 * year moves, which is the whole reason nobody has to retype it.
 */
export async function assignEventSlug(
  id: string,
  a: { name: string; startDate?: string | null; from?: string | null },
): Promise<string> {
  try {
    await ensureSlugColumn()
    const wanted = slugForEvent(a)
    const rows: any[] = await prisma.$queryRawUnsafe(
      'SELECT slug FROM "Tournament" WHERE slug <> \'\' AND id <> ?', id)
    const slug = uniqueSlug(wanted, (rows || []).map(r => String(r.slug || '')))
    await prisma.$executeRawUnsafe('UPDATE "Tournament" SET slug = ? WHERE id = ?', slug, id)
    return slug
  } catch { return '' }
}

/** The slug already on a tournament, or ''. Used to seed a copy's base. */
export async function slugOf(id: string): Promise<string> {
  try {
    const rows: any[] = await prisma.$queryRawUnsafe('SELECT slug FROM "Tournament" WHERE id = ?', id)
    return String(rows?.[0]?.slug || '')
  } catch { return '' }
}
