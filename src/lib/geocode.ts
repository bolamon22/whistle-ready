// Street address to a spot on the map, for the hotels page map (Bo, Oct 7 2026:
// "put a map on the page with some of the hotels listed on it").
//
// The US Census Bureau's geocoder: free, no key, US addresses only (every event is
// in the US). Answers are kept (lib/geocodeStore) so each address is looked up once.
// Some addresses aren't in its list (WoodSpring Suites, 6350 Okeechobee Blvd, on
// Oct 7); for those staff paste the spot from Google Maps, which parseLatLng reads.
//
// Pure: no database. The Builder (client) uses parseLatLng; the server side passes
// a store.

export type GeoPoint = { lat: number; lng: number; matched?: string }
export type GeoStore = { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }

const inRange = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)

/**
 * A spot typed or pasted as numbers: "26.7073, -80.1395" (what Google Maps copies
 * when you right-click a place and click the numbers), or a Google Maps link with
 * @lat,lng or q=lat,lng in it. Null for anything else, like a street address.
 */
export function parseLatLng(text: string): { lat: number; lng: number } | null {
  const s = String(text || '').trim()
  if (!s || s.length > 2000) return null
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)'
  const patterns = [
    new RegExp(`^${num}\\s*[, ]\\s*${num}$`),
    new RegExp(`@${num},${num}`),
    new RegExp(`[?&](?:q|query|ll|destination)=${num}(?:,|%2C)\\s*${num}`, 'i'),
  ]
  for (const re of patterns) {
    const m = re.exec(s)
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2])
      if (inRange(lat, lng)) return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }
    }
  }
  return null
}

/** The store key for an address: case, punctuation and spacing don't make a new lookup. */
export const geoKey = (address: string) => 'geocode:' + String(address || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 200)

const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'

/** The Census answer: a spot, null when it has no match, undefined when it couldn't be asked. */
export async function censusLookup(address: string, opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<GeoPoint | null | undefined> {
  const f = opts.fetchImpl || fetch
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 6000)
  try {
    const url = `${CENSUS}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`
    const r = await f(url, { signal: ctl.signal, cache: 'no-store', headers: { Accept: 'application/json' } } as RequestInit)
    if (!r.ok) return undefined
    const d: any = await r.json()
    const m = d?.result?.addressMatches?.[0]
    if (!m) return null
    const lat = Number(m?.coordinates?.y), lng = Number(m?.coordinates?.x)
    if (!inRange(lat, lng)) return null
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, matched: String(m.matchedAddress || '').slice(0, 200) }
  } catch {
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

// An address the Census couldn't match is asked again after a week, in case
// its list was updated; one it matched is kept.
const MISS_RETRY_MS = 7 * 24 * 3600 * 1000

/** The spot for an address (or typed numbers), asking the Census at most once per address. */
export async function geocodeAddress(address: string, store: GeoStore, opts: { timeoutMs?: number; fetchImpl?: typeof fetch; now?: number } = {}): Promise<GeoPoint | null> {
  const a = String(address || '').replace(/\s+/g, ' ').trim()
  if (!a) return null
  const typed = parseLatLng(a)
  if (typed) return typed
  if (a.length < 6 || a.length > 200) return null
  const key = geoKey(a)
  const now = opts.now ?? Date.now()
  try {
    const kept = await store.get(key)
    if (kept) {
      const v = JSON.parse(kept)
      if (v && inRange(Number(v.lat), Number(v.lng))) return { lat: Number(v.lat), lng: Number(v.lng), matched: v.matched || '' }
      if (v?.miss && now - Number(v.at || 0) < MISS_RETRY_MS) return null
    }
  } catch { /* ask again */ }
  const hit = await censusLookup(a, opts)
  if (hit === undefined) return null // couldn't ask; don't remember a miss
  try { await store.set(key, JSON.stringify(hit ? { ...hit, at: now } : { miss: true, at: now })) } catch { /* still answer */ }
  return hit
}
