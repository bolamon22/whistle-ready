// Credentialed photographers, their packages, and the page families book them from.
//
// Stored per org in AppSetting `photographers:{orgId}` as a list. Same shape of
// thing as the sponsor list: few rows, edited by hand in the admin, read by a
// public page -- so it lives in a settings record rather than earning a table.
//
// WHY THIS EXISTS AT ALL: the booking form it replaces was a Jotform with a
// hardcoded list of three tournaments, no prices, and a free-text club field.
// Every one of those is a thing this app already knows, so the page can be
// better simply by asking the database instead of the parent:
//
//   - events come from Tournament, so the list is never stale
//   - packages carry their price, so nobody picks "Player Package" blind
//   - the club field autocompletes from teams actually registered for that event
//
// The photographer is not employed by the org. Bookings, pricing and delivery
// are between them and the family; the org credentials them and hosts the page.
// `bookingEmail` is where a request goes, and the org is copied so there is a
// record -- nothing more.

export type PhotoPackage = {
  id: string
  name: string
  /** Dollars. 0 renders as "Ask" -- never an invented number. */
  price: number
  note: string
}

export type Photographer = {
  /** URL segment: /photographers/<slug>. Stable once shared. */
  slug: string
  name: string
  business: string
  location: string
  bio: string
  avatarUrl: string
  coverUrl: string
  website: string
  instagram: string
  bookingEmail: string
  /** Tournament ids they are shooting. Empty = offer them for every event. */
  eventIds: string[]
  packages: PhotoPackage[]
  /** Image URLs for the sample strip. */
  samples: string[]
  /** Off hides them from the index and 404s the profile, without deleting them. */
  active: boolean
}

const str = (x: unknown): string => String(x ?? '').trim()

export function slugify(s: string): string {
  return str(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
}

/** The three packages the Coyote Magic form offered, as a starting point. Prices
 *  are 0 on purpose: the old form never showed one, so we do not have them and
 *  will not invent them. "Ask" renders until someone types the real number. */
export const DEFAULT_PACKAGES: PhotoPackage[] = [
  { id: 'player', name: 'Player package', price: 0, note: 'One player followed across the weekend, edited and delivered after the event.' },
  { id: 'team',   name: 'Team package',   price: 0, note: 'The full team — posed photo, individual portraits and game action.' },
  { id: 'custom', name: 'Custom',         price: 0, note: 'Multiple teams, a club-wide shoot, or video. Tell them what you need.' },
]

export function photographerRec(raw: any): Photographer | null {
  const name = str(raw?.name)
  const business = str(raw?.business)
  if (!name && !business) return null
  const packages: PhotoPackage[] = (Array.isArray(raw?.packages) ? raw.packages : [])
    .map((p: any, i: number) => ({
      id: slugify(str(p?.id) || str(p?.name)) || `pkg-${i}`,
      name: str(p?.name),
      price: Number(p?.price) > 0 ? Number(p.price) : 0,
      note: str(p?.note),
    }))
    .filter((p: PhotoPackage) => p.name)
  return {
    slug: slugify(str(raw?.slug) || business || name),
    name,
    business,
    location: str(raw?.location),
    bio: str(raw?.bio),
    avatarUrl: str(raw?.avatarUrl),
    coverUrl: str(raw?.coverUrl),
    website: str(raw?.website),
    instagram: str(raw?.instagram).replace(/^@/, ''),
    bookingEmail: str(raw?.bookingEmail),
    eventIds: (Array.isArray(raw?.eventIds) ? raw.eventIds : []).map(str).filter(Boolean),
    packages: packages.length ? packages : DEFAULT_PACKAGES,
    samples: (Array.isArray(raw?.samples) ? raw.samples : []).map(str).filter(Boolean),
    active: raw?.active !== false,
  }
}

export function photographerList(raw: unknown): Photographer[] {
  const seen = new Set<string>()
  return (Array.isArray(raw) ? raw : [])
    .map(photographerRec)
    .filter((p): p is Photographer => !!p)
    // Two photographers with the same business name would otherwise share a URL
    // and the second would be unreachable.
    .map(p => {
      let s = p.slug || 'photographer'
      let n = 2
      while (seen.has(s)) s = `${p.slug}-${n++}`
      seen.add(s)
      return { ...p, slug: s }
    })
}

export function findPhotographer(list: Photographer[], slug: string): Photographer | null {
  const want = slugify(slug)
  return list.find(p => p.active && p.slug === want) || null
}

/** Photographers offering a given event. An empty eventIds means "all of them". */
export function forEvent(list: Photographer[], tournamentId: string): Photographer[] {
  if (!tournamentId) return list.filter(p => p.active)
  return list.filter(p => p.active && (p.eventIds.length === 0 || p.eventIds.includes(tournamentId)))
}

/** "$150" / "Ask" — never a made-up number. */
export function packagePrice(p: PhotoPackage): string {
  return p.price > 0 ? `$${p.price.toLocaleString('en-US')}` : 'Ask'
}

export function displayName(p: Photographer): string {
  return p.business || p.name
}

// ── self-serve ───────────────────────────────────────────────────────────────
// Approving a media credential with "take bookings" ticked creates the
// photographer's profile from what they already typed on the application, and
// hands them the keys to it. The alternative -- an organizer retyping a name, an
// email and an Instagram handle every time someone new applies -- is the kind of
// chore that quietly stops happening, and then the booking page is empty.
//
// Everything below works on the raw AppSetting array so the caller can read,
// change and write it in one place.

import { prisma } from '@/lib/db'

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
