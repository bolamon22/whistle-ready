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
  /** Holds a room block at the event rate. Lists saved before this field were all block hotels. */
  eventRate: boolean
  /** Chain, when staff set it; '' means worked out from the name (hotelChain). */
  chain: string
  /** Street address. The Builder looks it up (lib/geocode) to put the hotel on the map. */
  address: string
  /** Where the hotel sits on the hotels page map; both or neither. */
  lat?: number
  lng?: number
  /** Set for the families' pages from the event's sold-out marks (withSoldOut); never stored with the list. */
  soldOut?: boolean
}

/** A spot on the hotels page map other than a hotel: the fields (from the event's venues). */
export type MapPlace = { name: string; address: string; lat: number; lng: number }

// Bo, Oct 7: list more than the block hotels, "at least the closest ones", and
// let families filter by price, distance and chain (components/HotelBrowser).
export const MAX_HOTELS = 40
export const MAX_HOTEL_PHOTOS = 20

export const EMPTY_HOTEL: EventHotel = { name: '', rate: '', miles: '', bookBy: '', note: '', url: '', photos: [], eventRate: false, chain: '', address: '' }

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

/** A real map spot as {lat, lng} (rounded to about 10 cm), or null. 0,0 is a blank, not a place. */
export function mapSpot(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null
  const a = Number(lat), o = Number(lng)
  if (!Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180 || (a === 0 && o === 0)) return null
  return { lat: Math.round(a * 1e6) / 1e6, lng: Math.round(o * 1e6) / 1e6 }
}

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
    eventRate: h?.eventRate !== false,
    chain: one(h?.chain, 40),
    address: one(h?.address, 160),
    ...(mapSpot(h?.lat, h?.lng) || {}),
  })).filter(h => h.name)
}

/** True when the hotel has a spot on the map. */
export const onMap = (h: { lat?: number; lng?: number }) => typeof h.lat === 'number' && typeof h.lng === 'number'

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

// ── Sold out ───────────────────────────────────────────────────────────────
// Bo, Oct 7: "if the hotel sells out ... will it mark it on our site if Vinny
// marks it on the actual booking website?" It can't: nothing here reads Legacy's
// site. So Vinny marks it on his Whistle Ready housing board instead (staff can in
// Builder › Hotels too), and the pages show it at once. The marks live apart from
// the list (AppSetting hotelStatus:<id>, lib/hotelStatus) so a Builder save made
// from an older copy of the page can't quietly undo one.

/** A hotel's lasting key: its booking-site property number when it has one, else its name. */
export function hotelKey(h: { url?: string; name?: string }): string {
  const p = reserveTravelProperty(String(h?.url || ''))
  if (p) return `p:${p}`
  const n = String(h?.name || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120)
  return n ? `n:${n}` : ''
}

/** The list with sold-out hotels marked and moved to the end; otherwise staff's order. */
export function withSoldOut(hotels: EventHotel[], soldOut?: Record<string, unknown> | null): EventHotel[] {
  const marked = hotels.map(h => { const k = hotelKey(h); return { ...h, soldOut: !!(k && soldOut && soldOut[k]) } })
  return [...marked.filter(h => !h.soldOut), ...marked.filter(h => h.soldOut)]
}

// ── Chain, price, distance (the families' filters) ─────────────────────────

// Brand words to the chain whose loyalty program families know. First match
// wins, so the longer, more specific names come first.
const CHAINS: [string, RegExp][] = [
  ['Marriott', /marriott|courtyard|fairfield|residence inn|springhill|towneplace|four points|sheraton|westin|aloft|\bac hotel|moxy|element |renaissance|le m[ée]ridien|delta hotels|gaylord|autograph collection|tribute portfolio|ritz-?carlton|st\.? regis/i],
  ['Hilton', /hilton|hampton|homewood|home2|embassy suites|doubletree|tru by|curio collection|tapestry collection|canopy by|conrad|waldorf|motto by|spark by|tempo by|livsmart|signia/i],
  ['IHG', /holiday inn|crowne plaza|candlewood|staybridge|avid hotel|hotel indigo|kimpton|intercontinental|even hotel|voco|atwell|garner/i],
  ['Hyatt', /hyatt|andaz|thompson hotel|alila|caption by/i],
  ['Wyndham', /wyndham|la quinta|days inn|super 8|ramada|microtel|baymont|howard johnson|travelodge|wingate|hawthorn|americinn|trademark collection/i],
  ['Choice', /comfort inn|comfort suites|quality inn|sleep inn|clarion|mainstay|suburban studios|econo lodge|rodeway|cambria|ascend|woodspring|everhome|radisson/i],
  ['Best Western', /best western|surestay|\bv[iī]b\b|gl[oō] hotel|aiden by|sadie by/i],
  ['Kasa', /\bkasa\b/i],
  ['Sonesta', /sonesta/i],
  ['Extended Stay America', /extended stay america/i],
  ['Red Roof', /red roof/i],
  ['Motel 6', /motel 6|studio 6/i],
]
export const CHAIN_NAMES = CHAINS.map(([n]) => n)

/** The hotel's chain: what staff set, else worked out from its name, else 'Other'. */
export function hotelChain(h: { name?: string; chain?: string }): string {
  const set = String(h?.chain || '').trim()
  if (set) return set
  const n = String(h?.name || '')
  for (const [chain, re] of CHAINS) if (re.test(n)) return chain
  return 'Other'
}

/** The nightly rate as a number, or null when it isn't one. */
export function rateNumber(rate: string): number | null {
  const n = Number(String(rate || '').replace(/[$,\s]/g, ''))
  return rate && Number.isFinite(n) && n > 0 ? n : null
}

/** Miles from the fields as a number, or null when blank. */
export function milesNumber(miles: string): number | null {
  const n = Number(String(miles || '').replace(/[^0-9.]/g, ''))
  return miles && Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * The few hotels the event page shows (its Hotels section and side rail; the
 * hotels page lists them all): the event-rate hotels in staff's order, or the
 * closest ones when none are marked. Sold-out ones stay last.
 */
export function featuredHotels(hotels: EventHotel[], max = 4): EventHotel[] {
  const block = hotels.filter(h => h.eventRate)
  const pool = block.length ? block : [...hotels].sort((a, b) =>
    Number(!!a.soldOut) - Number(!!b.soldOut) || (milesNumber(a.miles) ?? 1e9) - (milesNumber(b.miles) ?? 1e9))
  return pool.slice(0, max)
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
