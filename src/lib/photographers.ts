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
