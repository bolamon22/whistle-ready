// Hotels listed on an event's own pages: the Hotels section of the event page
// and /tournaments/<id>/hotels. Families see the block hotels in Whistle Ready
// rather than landing on the housing company's site and its wording first (Bo,
// Oct 7 2026: "I just want the hotel listings to be natively in there").
//
// Why a list here and not the housing site itself: Legacy Sports Travel's booking
// pages are a white-label engine run by Alliance Reservations Network
// (reservetravel.com). They refuse to be shown inside another site
// (X-Frame-Options SAMEORIGIN, CSP frame-ancestors 'none'), sit behind Cloudflare
// and Forter bot checks, and their terms forbid copying what is on them. ARN does
// sell a Hotel API (search, rates, availability) to its customers, so live rates
// would come through Legacy. Until then staff list the block hotels in the
// Builder, and each hotel's button opens that hotel on Legacy's site for the
// event dates. Checked Oct 7 on the Fall Classic's Marriott Hutchinson Island:
// the hotel's own link still shows the $199 special event rate, rooms left and
// the Group Block button, with Legacy's site id, so bookings count for them.
//
// Photos (Bo, Oct 7, with a screenshot of the gallery on Legacy's hotel page:
// "Are we able to show the images that the hotel provides... Maybe with some
// thumbnails"): staff upload them per hotel in the Builder. The photos on
// Legacy's pages are the hotels' supplier content, under the same terms, so they
// are not taken from there; the hotel or Legacy sends them, and ARN's API would
// carry them along with live rates.
//
// Pure, no database: the Builder (client) and the pages (server) both use it.

export type EventHotel = {
  name: string
  /** Nightly rate as staff typed it ("199", "$199.00"). */
  rate: string
  /** Miles from the fields. */
  miles: string
  /** Last day to book at the block rate, YYYY-MM-DD. */
  bookBy: string
  note: string
  /** That hotel's booking page. */
  url: string
  /** Photos, the main one first: uploads (/api/img/<id>) or library picks. */
  photos: string[]
}

export const MAX_HOTELS = 20
export const MAX_HOTEL_PHOTOS = 20

export const EMPTY_HOTEL: EventHotel = { name: '', rate: '', miles: '', bookBy: '', note: '', url: '', photos: [] }

/** An http(s) address or ''. A button only ever opens a real web page. */
export function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim()
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : ''
}

/**
 * A photo we can show, or ''. An upload is /api/img/<id> (what /api/upload
 * answers), a library pick may be a full address. Never a data: URL: the bytes
 * would ride inside the event's JSON on every page load.
 */
export function photoUrl(u: unknown): string {
  const s = String(u ?? '').trim()
  if (s.length > 1000) return ''
  return /^\/(?!\/)[^\s"'<>\\]+$/.test(s) ? s : safeUrl(s)
}

/** A hotel's photos, tidied: showable, no repeats, at most MAX_HOTEL_PHOTOS. */
export function cleanPhotos(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return Array.from(new Set(v.map(photoUrl).filter(Boolean))).slice(0, MAX_HOTEL_PHOTOS)
}

const one = (x: unknown, n: number) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** The stored list, tidied: named rows only, at most MAX_HOTELS. */
export function cleanHotels(v: unknown): EventHotel[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, MAX_HOTELS).map((h: any) => ({
    name: one(h?.name, 120),
    rate: one(h?.rate, 20),
    miles: one(h?.miles, 12),
    bookBy: /^\d{4}-\d{2}-\d{2}$/.test(String(h?.bookBy ?? '')) ? String(h.bookBy) : '',
    note: one(h?.note, 280),
    url: safeUrl(h?.url),
    photos: cleanPhotos(h?.photos),
  })).filter(h => h.name)
}

/** True when the event content lists at least one hotel. */
export const hasHotelList = (c: any) => cleanHotels(c?.hotelList).length > 0

/** "$199 / night" from "199", "$199" or "199.00"; '' when it isn't a price. */
export function rateLabel(rate: string): string {
  const n = Number(String(rate || '').replace(/[$,\s]/g, ''))
  if (!rate || !Number.isFinite(n) || n <= 0) return ''
  return `$${Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / night`
}

/** "11.1 miles from the fields", "1 mile from the fields"; '' when blank. */
export function milesLabel(miles: string): string {
  const n = Number(String(miles || '').replace(/[^0-9.]/g, ''))
  if (!miles || !Number.isFinite(n) || n < 0) return ''
  const v = Math.round(n * 10) / 10
  return `${v} mile${v === 1 ? '' : 's'} from the fields`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** "Book by Fri, Oct 9", or that the block deadline has passed. `today` is YYYY-MM-DD. */
export function bookByLabel(bookBy: string, today: string): { text: string; passed: boolean } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bookBy || '')
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  const day = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  if (today && bookBy < today) return { text: `Block deadline passed (${day})`, passed: true }
  return { text: `Book by ${DAYS[d.getUTCDay()]}, ${day}`, passed: false }
}

/** Where the event's hotels live on its own site. */
export const hotelsPath = (tournamentId: string) => `/tournaments/${tournamentId}/hotels`

// ── ReserveTravel (Alliance Reservations Network) links ─────────────────────
// Legacy's event search link carries the site id, the event dates and the block
// hotels' property numbers (properties=24455,258045,3All; the last token is a
// display mode). ARN documents type=property&property=<id> for one hotel's page.

export type ReserveTravelLink = { siteid: string; checkin: string; nights: string; properties: string[]; cid: string; currency: string }

export function parseReserveTravel(url: string): ReserveTravelLink | null {
  let u: URL
  try { u = new URL(String(url || '').trim()) } catch { return null }
  if (!/(^|\.)reservetravel\.com$/i.test(u.hostname)) return null
  // ARN writes siteId and siteid; read the names without caring about case.
  const p = new Map<string, string>()
  u.searchParams.forEach((v, k) => { if (!p.has(k.toLowerCase())) p.set(k.toLowerCase(), v) })
  const siteid = (p.get('siteid') || '').trim()
  if (!/^\d+$/.test(siteid)) return null
  const props = String(p.get('properties') || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s))
  const single = String(p.get('property') || '').trim()
  if (/^\d+$/.test(single) && !props.includes(single)) props.push(single)
  return {
    siteid,
    checkin: String(p.get('checkin') || '').trim(),
    nights: /^\d{1,2}$/.test(String(p.get('nights') || '')) ? String(p.get('nights')) : '',
    properties: props,
    cid: String(p.get('cid') || '').trim().slice(0, 60),
    currency: /^[A-Z]{3}$/.test(String(p.get('currency') || '')) ? String(p.get('currency')) : 'USD',
  }
}

/** One hotel's booking page on the event's ReserveTravel site, for the event dates. */
export function reserveTravelHotelUrl(l: ReserveTravelLink, propertyId: string): string {
  const q = new URLSearchParams({ currency: l.currency || 'USD', siteid: l.siteid, type: 'property', property: propertyId })
  if (l.checkin) q.set('checkin', l.checkin)
  if (l.nights) q.set('nights', l.nights)
  if (l.cid) q.set('cid', l.cid)
  return `https://www.reservetravel.com/v6?${q.toString()}`
}

/** The property number a ReserveTravel hotel link points at, or ''. */
export function reserveTravelProperty(url: string): string {
  const l = parseReserveTravel(url)
  return l && l.properties.length === 1 ? l.properties[0] : ''
}
