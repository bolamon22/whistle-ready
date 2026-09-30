import { parsePricing, baseFee } from '@/lib/regPricing'
import { regBadge, type BadgeTone } from '@/lib/regStatus'

// Everything the event header needs, worked out once. The event page and every
// page wrapped in _eventChrome call buildHeroProps, so the eyebrow, the fact
// cells and the badge cannot say different things on different pages -- which
// they did when each page computed its own.

const fmtDayShort = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

/** "Oct 24–25, 2026" / "Oct 31 – Nov 1, 2026". Parts are split, never passed to
 *  new Date('YYYY-MM-DD') -- that parses as UTC midnight and prints the day
 *  before in every US timezone. */
export function fmtRangeShort(s: string, e: string) {
  if (!s) return 'TBA'
  if (e && e !== s) {
    const [sy, sm] = s.split('-'); const [ey, em] = e.split('-')
    if (sy === ey && sm === em) return `${fmtDayShort(s)}–${parseInt(e.split('-')[2])}, ${ey}`
    if (sy === ey) return `${fmtDayShort(s)} – ${fmtDayShort(e)}, ${ey}`
    return `${fmtDayShort(s)}, ${sy} – ${fmtDayShort(e)}, ${ey}`
  }
  return `${fmtDayShort(s)}, ${s.split('-')[0]}`
}

/** "11700 Pierson Rd, Wellington, FL 33414" -> "Wellington, FL". */
export function shortLocation(loc: string) {
  if (!loc) return ''
  const m = loc.match(/([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s*\d{5})?/)
  if (m) return `${m[1].trim()}, ${m[2]}`
  return loc.split(',')[0].trim()
}

/** Past the event's last day, in Eastern time. String compare on YYYY-MM-DD,
 *  so the server's UTC clock can't flip it to "over" at 8pm on the last day. */
export function eventIsOver(startDate?: string, endDate?: string): boolean {
  const last = String(endDate || startDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) return false
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return today > last
}

export interface HeroInput {
  /** Tournament row: name, sport, startDate, endDate, location, logoUrl, teamRegEnabled, registrationPricing. */
  t: any
  /** tournamentSite:{id} content. */
  c: any
  base: string
  divisions: string[]
  infoItems: { href: string; label: string }[]
  /** Link to an event-page section, or undefined when that section isn't shown.
   *  The event page links to #id; every other page to /event#id. */
  sectionHref: (id: string) => string | undefined
  logoUrl?: string
  active?: string
  homeHref?: string
}

export function buildHeroProps(o: HeroInput) {
  const t = o.t || {}; const c = o.c || {}
  const over = eventIsOver(t.startDate, t.endDate)
  // A finished event has nothing to register for; the button led to a form
  // nobody could act on.
  const registerHref = Number(t.teamRegEnabled) && !over ? `${o.base}/register` : undefined
  const eyebrow = [
    t.sport ? String(t.sport) : 'Tournament',
    t.startDate ? fmtRangeShort(t.startDate, t.endDate) : '',
    shortLocation(t.location || ''),
  ].filter(Boolean).join(' · ')
  const fee = Number(t.teamRegEnabled) ? baseFee(parsePricing(t.registrationPricing)) : 0
  const minFee = fee > 0 ? `from $${fee.toLocaleString()}` : ''
  const n = o.divisions.length

  // Label short, words in the value: "PLAYER WAIVER" as a label wrapped to two
  // lines in a six-across bar at tablet width (measured at 820px, 128px cells).
  const facts = ([
    t.startDate && { key: 'dates', label: 'DATES', value: fmtRangeShort(t.startDate, t.endDate) },
    t.location && { key: 'location', label: 'LOCATION', value: shortLocation(t.location), href: o.sectionHref('locations') },
    n > 0 && { key: 'divisions', label: 'DIVISIONS', value: `${n} division${n > 1 ? 's' : ''}`, href: o.sectionHref('divisions') },
    minFee && { key: 'fee', label: 'TEAM FEE', value: minFee, href: registerHref || o.sectionHref('fees') },
    (c.hotelsUrl || c.hotels) && { key: 'hotels', label: 'HOTELS', value: 'Book hotels', href: c.hotelsUrl || o.sectionHref('hotels') },
    { key: 'waiver', label: 'WAIVER', value: 'Player waiver', href: `${o.base}/player-waiver` },
    { key: 'schedule', label: 'SCHEDULE', value: 'View games', href: `${o.base}/public` },
  ].filter(Boolean)) as { key: string; label: string; value: string; href?: string }[]

  // A finished event is past registration status: "Waiting list only" on last
  // year's results reads as a mistake.
  const badge: { tone: BadgeTone; label: string } | null = over
    ? { tone: 'navy', label: 'Final results' }
    : regBadge(c, o.divisions)

  return {
    name: String(t.name || ''),
    logoUrl: o.logoUrl ?? t.logoUrl,
    heroImage: c.heroImage,
    eyebrow, badge, registerHref,
    infoItems: o.infoItems,
    facts,
    active: o.active,
    homeHref: o.homeHref,
  }
}
