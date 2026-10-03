// Reads and writes of the photographers AppSetting, plus gallery credit matching.
// The record shapes and pure helpers live in photographerProfiles.ts and are
// re-exported here, so server code can keep importing from this file. Client
// components must import photographerProfiles directly: this file imports lib/db.
import { prisma } from '@/lib/db'
import { DEFAULT_PACKAGES, slugify, type Photographer } from './photographerProfiles'

export * from './photographerProfiles'

const str = (x: unknown): string => String(x ?? '').trim()

// ── self-serve ───────────────────────────────────────────────────────────────
// Approving a media credential with "take bookings" ticked creates the
// photographer's profile from what they already typed on the application, and
// hands them the keys to it. The alternative -- an organizer retyping a name, an
// email and an Instagram handle every time someone new applies -- is the kind of
// chore that quietly stops happening, and then the booking page is empty.
//
// Everything below works on the raw AppSetting array so the caller can read,
// change and write it in one place.

const KEY = (orgId: string) => `photographers:${orgId}`

export async function readPhotographers(orgId: string): Promise<any[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY(orgId) } })
    const v = JSON.parse(row?.value || '[]')
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export async function writePhotographers(orgId: string, list: any[]): Promise<void> {
  const value = JSON.stringify(Array.isArray(list) ? list : [])
  await prisma.appSetting.upsert({ where: { key: KEY(orgId) }, update: { value }, create: { key: KEY(orgId), value } })
}

/** A free slug near `want`, not colliding with anything already in `list`. */
export function freeSlug(list: any[], want: string): string {
  const taken = new Set(list.map(p => slugify(String(p?.slug || ''))))
  const base = slugify(want) || 'photographer'
  if (!taken.has(base)) return base
  for (let n = 2; n < 50; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
  return `${base}-${Date.now().toString(36)}`
}

/**
 * Create (or find) the profile for an approved photographer. Idempotent: matched
 * on booking email first, then business name, so re-approving or approving the
 * same person for a second event never makes a duplicate page.
 *
 * Returns the slug either way, so the approval email can link them to it.
 */
export async function ensureProfileFromApplication(orgId: string, data: any): Promise<string> {
  const email = str(data?.email).toLowerCase()
  const business = str(data?.company)
  const name = str(data?.name)
  if (!email && !business && !name) return ''

  const list = await readPhotographers(orgId)
  const hit = list.find(p =>
    (email && str(p?.bookingEmail).toLowerCase() === email) ||
    (business && str(p?.business).toLowerCase() === business.toLowerCase())
  )
  if (hit) return slugify(String(hit.slug || ''))

  // The portfolio field takes a website or a social link; only the former belongs
  // in `website`, or the tile's "Portfolio" button points at an Instagram profile
  // the Instagram link already covers.
  const portfolio = str(data?.portfolio)
  const isSocial = /instagram\.com|facebook\.com|x\.com|twitter\.com|tiktok\.com/i.test(portfolio)

  const rec = {
    slug: freeSlug(list, business || name),
    name,
    business,
    location: '',
    bio: '',
    avatarUrl: '',
    coverUrl: '',
    website: isSocial ? '' : portfolio,
    instagram: str(data?.instagram).replace(/^@/, ''),
    bookingEmail: str(data?.email),
    eventIds: (Array.isArray(data?.tournamentIds) ? data.tournamentIds : [data?.tournamentId]).map(str).filter(Boolean),
    packages: DEFAULT_PACKAGES.map(p => ({ ...p })),
    samples: [],
    // Live immediately: they were just approved, and a page nobody can see is the
    // same as no page. Everything on it is theirs to edit.
    active: true,
  }
  await writePhotographers(orgId, [...list, rec])
  return rec.slug
}

/** One profile by slug, as the raw record (for the self-serve editor). */
export async function profileBySlug(orgId: string, slug: string): Promise<any | null> {
  const want = slugify(slug)
  return (await readPhotographers(orgId)).find(p => slugify(String(p?.slug || '')) === want) || null
}

/** Save the fields a photographer is allowed to change on their own page. */
export async function savePhotographerSelf(orgId: string, slug: string, patch: any): Promise<boolean> {
  const want = slugify(slug)
  const list = await readPhotographers(orgId)
  const i = list.findIndex(p => slugify(String(p?.slug || '')) === want)
  if (i === -1) return false
  const cur = list[i]
  // Deliberately NOT editable by the photographer: slug (it is a published URL),
  // and active (whether they appear at all is the org's call, not theirs).
  const next = {
    ...cur,
    name: str(patch?.name) || cur.name,
    business: str(patch?.business) || cur.business,
    location: str(patch?.location),
    bio: str(patch?.bio).slice(0, 600),
    website: str(patch?.website),
    instagram: str(patch?.instagram).replace(/^@/, ''),
    bookingEmail: str(patch?.bookingEmail) || cur.bookingEmail,
    avatarUrl: str(patch?.avatarUrl),
    coverUrl: str(patch?.coverUrl),
    packages: (Array.isArray(patch?.packages) ? patch.packages : [])
      .map((p: any, n: number) => ({
        id: slugify(str(p?.id) || str(p?.name)) || `pkg-${n}`,
        name: str(p?.name),
        price: Number(p?.price) > 0 ? Number(p.price) : 0,
        note: str(p?.note).slice(0, 240),
      }))
      .filter((p: any) => p.name)
      .slice(0, 8),
    samples: (Array.isArray(patch?.samples) ? patch.samples : []).map(str).filter(Boolean).slice(0, 6),
  }
  list[i] = next
  await writePhotographers(orgId, list)
  return true
}

// ── photo credits ────────────────────────────────────────────────────────────
// Every gallery photo carries a free-text `credit` line ("Coyote Magic Action
// Shots"). That line is most of what a photographer gets in return for handing
// over a weekend of work, and until now it was a dead string sitting under a
// thumbnail. Resolving it back to the profile turns each credit into a link to
// the page where that person can actually be booked -- which is the trade the
// application page promises, finally kept.
//
// Matching is deliberately strict. Sending a family to the wrong photographer is
// worse than sending them nowhere, so a credit resolves only when it equals the
// profile's slug, business or name once normalized -- never on a partial or fuzzy
// match. Anything unmatched keeps rendering as the plain grey text it is today.

/** "Photo by Coyote Magic Action Shots." -> "coyote magic action shots" */
function normCredit(s: string): string {
  return str(s)
    .replace(/^\s*(photos?|images?|video)\s*(?:by|:)\s*/i, '')
    .replace(/^@/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** The credentialed photographer a credit line names, or null. */
export function photographerForCredit(credit: string, list: Photographer[]): Photographer | null {
  const want = normCredit(credit)
  if (!want) return null
  return list.find(p => p.active && (
    normCredit(p.slug) === want ||
    normCredit(p.business) === want ||
    normCredit(p.name) === want
  )) || null
}

/**
 * Every distinct credit in a gallery -> the profile href it should link to.
 *
 * Built once on the server: the client component then needs a plain string map
 * rather than the photographer list, and 193 photos cost one pass over a handful
 * of profiles instead of a lookup per thumbnail. Credits with no match are simply
 * absent from the map, which is what makes the fallback automatic.
 */
export function creditLinks(photos: { credit?: string }[], list: Photographer[], base: string): Record<string, string> {
  const out: Record<string, string> = {}
  const seen = new Set<string>()
  for (const ph of photos) {
    const credit = str(ph?.credit)
    if (!credit || seen.has(credit)) continue
    seen.add(credit)
    const hit = photographerForCredit(credit, list)
    if (hit) out[credit] = `${base}/photographers/${hit.slug}`
  }
  return out
}
