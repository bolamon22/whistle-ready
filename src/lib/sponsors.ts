// Sponsors & partners — one shape, one normalizer, three surfaces.
//
// The list lives in AppSetting `orgSite:<orgId>.sponsors` and is read by the org
// home page, every event page and the admin editor. It started life as
// `{ name, logoUrl, url }`, which is why everything below treats the extra fields
// as optional: rows saved before this change keep working and simply render as
// untiered partners with no role line.
//
// WHY THE EXTRA FIELDS: a logo on its own doesn't tell a parent who the business
// is, and it gives us nothing to price. `tier` is what makes a presenting slot
// worth more than a grid slot; `role` is the line that makes an unreadable logo
// legible ("Wellington Parks & Recreation" is baked into its own image at 48px).

export type SponsorTierKey = 'presenting' | 'official'

export type Sponsor = {
  name: string
  logoUrl: string
  url: string
  /** Short label under the name — "Official apparel", "Host venue". */
  role: string
  tier: SponsorTierKey
  /** Only shown for the presenting slot, which has room for a sentence. */
  blurb: string
}

export type SponsorStat = { value: string; label: string }

export type SponsorPitch = {
  show: boolean
  headline: string
  sub: string
  /** What a sponsor actually gets — the part that justifies the price. */
  benefits: string[]
  /** Numbers the org fills in. Live counts are prepended by the caller. */
  stats: SponsorStat[]
  ctaLabel: string
  /** Fallback copy for the side panel when no sponsorship levels are set. */
  note: string
}

const str = (x: unknown): string => String(x ?? '').trim()

export const DEFAULT_PITCH_BENEFITS = [
  'Logo on the live schedule and results pages',
  'Named in every confirmation and reminder email',
  'Banner at the field entrance both days',
  'Booth space in the vendor row if you want it',
]

export const DEFAULT_PITCH_NOTE =
  'Tell us what you\u2019re trying to reach and we\u2019ll put together the package that fits \u2014 ' +
  'there\u2019s no set menu you have to squeeze into.\n\n' +
  'Local businesses, clubs and travel brands all work here. If you already sell to lacrosse families, ' +
  'this is the weekend they\u2019re all in one place.'

export const DEFAULT_PITCH_HEADLINE = 'Put your brand in front of every family at the event.'
export const DEFAULT_PITCH_SUB = 'A full weekend at one venue, and a schedule page parents refresh all day long.'

/** One sponsor row, whatever shape it was saved in. Returns null for empty rows. */
export function sponsorRec(raw: any): Sponsor | null {
  const name = str(raw?.name)
  const logoUrl = str(raw?.logoUrl)
  if (!name && !logoUrl) return null
  return {
    name,
    logoUrl,
    url: str(raw?.url),
    role: str(raw?.role),
    tier: str(raw?.tier).toLowerCase() === 'presenting' ? 'presenting' : 'official',
    blurb: str(raw?.blurb),
  }
}

export function sponsorList(raw: unknown): Sponsor[] {
  return (Array.isArray(raw) ? raw : []).map(sponsorRec).filter((s): s is Sponsor => !!s)
}

/**
 * Presenting slots first, everyone else after, original order kept inside each
 * group so reordering in the admin still means something.
 */
export function splitSponsors(list: Sponsor[]): { presenting: Sponsor[]; official: Sponsor[] } {
  return {
    presenting: list.filter(s => s.tier === 'presenting'),
    official: list.filter(s => s.tier !== 'presenting'),
  }
}

export function sponsorPitch(raw: any): SponsorPitch {
  const benefits = Array.isArray(raw?.benefits)
    ? raw.benefits.map(str).filter(Boolean)
    : []
  const stats: SponsorStat[] = Array.isArray(raw?.stats)
    ? raw.stats.map((s: any) => ({ value: str(s?.value), label: str(s?.label) })).filter((s: SponsorStat) => s.value && s.label)
    : []
  return {
    // Off by default: an org with nothing to say shouldn't get a half-empty sales
    // panel on its event pages just because we shipped the feature.
    show: raw?.show === true,
    headline: str(raw?.headline) || DEFAULT_PITCH_HEADLINE,
    sub: str(raw?.sub) || DEFAULT_PITCH_SUB,
    benefits: benefits.length ? benefits : DEFAULT_PITCH_BENEFITS,
    stats,
    ctaLabel: str(raw?.ctaLabel) || 'Become a sponsor',
    note: str(raw?.note) || DEFAULT_PITCH_NOTE,
  }
}

/** Compact display number: 1240 -> "1,240". Keeps a string as-is. */
export function statNum(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : ''
}
