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

/** "Oct 24–25" / "Oct 31 – Nov 1": the phone's fact line, where the year is
 *  already in the eyebrow and the width is not there to say it twice. */
export function fmtRangeNoYear(s: string, e: string) {
  if (!s) return 'TBA'
  if (e && e !== s) {
    const [sy, sm] = s.split('-'); const [ey, em] = e.split('-')
    if (sy === ey && sm === em) return `${fmtDayShort(s)}–${parseInt(e.split('-')[2])}`
    return `${fmtDayShort(s)} – ${fmtDayShort(e)}`
  }
  return fmtDayShort(s)
}

/** Inside the event's days, in Eastern time (see eventIsOver for the string compare). */
export function eventIsOn(startDate?: string, endDate?: string): boolean {
  const first = String(startDate || '').slice(0, 10), last = String(endDate || startDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first) || !/^\d{4}-\d{2}-\d{2}$/.test(last)) return false
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  return today >= first && today <= last
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
  /** The public can see the schedule (lib/publicView). Decides whether the
   *  Schedule cell is the thing to feature on a phone. */
  scheduleLive?: boolean
}

/** One cell of the fact strip. `short` is the phone's word for it; `kind`
 *  says which phone row it sits in -- facts read as a line, actions as tabs. */
export type HeroFact = {
  key: string
  label: string
  value: string
  short: string
  kind: 'fact' | 'action'
  icon: 'calendar' | 'map-pin' | 'layers' | 'ticket' | 'bed-double' | 'clipboard-list' | 'calendar-days' | 'activity' | 'trophy'
  href?: string
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
  const minFee = fee > 0 ? `$${fee.toLocaleString()}` : ''
  const n = o.divisions.length
  const on = !over && eventIsOn(t.startDate, t.endDate)

  // One line per cell, no label row: a date reads as a date and a place as a
  // place (Bo, Oct 3). The one value that needed its label -- "from $1,495" --
  // carries it in the words. The Schedule cell says what it opens and follows
  // the calendar: the schedule before the event, live scores during it, the
  // results after.
  const facts = ([
    t.startDate && { key: 'dates', kind: 'fact', icon: 'calendar', label: 'Dates', value: fmtRangeShort(t.startDate, t.endDate), short: fmtRangeNoYear(t.startDate, t.endDate) },
    t.location && { key: 'location', kind: 'fact', icon: 'map-pin', label: 'Location', value: shortLocation(t.location), short: shortLocation(t.location), href: o.sectionHref('locations') },
    n > 0 && { key: 'divisions', kind: 'fact', icon: 'layers', label: 'Divisions', value: `${n} division${n > 1 ? 's' : ''}`, short: `${n} division${n > 1 ? 's' : ''}`, href: o.sectionHref('divisions') },
    minFee && { key: 'fee', kind: 'action', icon: 'ticket', label: 'Team fee', value: `Team fee from ${minFee}`, short: 'Team fee', href: registerHref || o.sectionHref('fees') },
    (c.hotelsUrl || c.hotels) && { key: 'hotels', kind: 'action', icon: 'bed-double', label: 'Hotels', value: 'Book hotels', short: 'Hotels', href: c.hotelsUrl || o.sectionHref('hotels') },
    { key: 'waiver', kind: 'action', icon: 'clipboard-list', label: 'Waiver', value: 'Player waiver', short: 'Waiver', href: `${o.base}/player-waiver` },
    {
      key: 'schedule', kind: 'action', label: 'Schedule', href: `${o.base}/public`,
      icon: over ? 'trophy' : on ? 'activity' : 'calendar-days',
      value: over ? 'View results' : on ? 'Live scores' : 'View schedule',
      short: over ? 'Results' : on ? 'Live' : 'Schedule',
    },
  ].filter(Boolean)) as HeroFact[]

  // What a phone should push: once the schedule is out there is nothing a
  // spectator wants more, and that stays true through the finals and the
  // results. Before that the hero's Register button is the one call to action,
  // and a second filled cell would compete with it.
  const featured = o.scheduleLive ? 'schedule' : undefined

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
    featured,
    homeHref: o.homeHref,
  }
}
