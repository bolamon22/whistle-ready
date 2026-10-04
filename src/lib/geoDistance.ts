// How far a club is from the venue, from the free text we actually have.
//
// There is no geocoding in this app and no lat/lng on any record: a club types
// `clubBasedIn` by hand on the registration form ("Ocala", "Coral Springs, FL")
// and the tournament's `location` is free text too ("Village Park, Wellington").
// So this does the cheap, honest thing — look for a known Florida place name in
// each string and measure between them. No API, no key, no per-event cost.
//
// EVERY failure mode resolves to "we don't know", and every caller treats "we
// don't know" as "ask them about a hotel". Being wrong in that direction costs
// one line in an email; being wrong the other way costs room nights, which is
// what pays for the event.
import { FL_CITIES } from '@/lib/flCities'

/** Bo, Oct 4 2026: a club more than 100 miles out is staying over. */
export const HOTEL_RADIUS_MILES = 100

const EARTH_MILES = 3958.8
const rad = (d: number) => (d * Math.PI) / 180

export function milesBetween(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0])
  const dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Longest name first, so "Palm Beach Gardens" wins over "Palm Beach" and
// "North Miami Beach" over "Miami". Built once per process.
let byLength: string[] | null = null
const namesByLength = () => (byLength ||= Object.keys(FL_CITIES).sort((a, b) => b.length - a.length))

/** Coordinates of the first Florida place named anywhere in the text, or null.
 *  Matched on word boundaries so "Naples" isn't found inside a longer word. */
export function findFlCity(text?: string | null): [number, number] | null {
  const s = String(text || '').toLowerCase()
  if (!s.trim()) return null
  for (const name of namesByLength()) {
    const i = s.indexOf(name)
    if (i < 0) continue
    const before = i === 0 ? ' ' : s[i - 1]
    const after = i + name.length >= s.length ? ' ' : s[i + name.length]
    if (!/[a-z]/.test(before) && !/[a-z]/.test(after)) return FL_CITIES[name]
  }
  return null
}

/** Miles from the club's home town to the venue, or null when either side can't
 *  be placed — an out-of-state club included, which is the point: unknown means
 *  "assume they need rooms". */
export function hotelDistance(clubBasedIn?: string | null, eventLocation?: string | null): number | null {
  const club = findFlCity(clubBasedIn)
  const venue = findFlCity(eventLocation)
  if (!club || !venue) return null
  return Math.round(milesBetween(club, venue))
}
