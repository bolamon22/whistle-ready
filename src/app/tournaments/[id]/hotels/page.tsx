import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@libsql/client'
import { ArrowLeft, Hotel, ArrowUpRight } from 'lucide-react'
import type { Metadata } from 'next'
import { mdToHtml } from '@/app/o/[slug]/_md'
import { tournamentAbs, clip } from '@/lib/seo'
import { cleanHotels, onMap, safeUrl, withSoldOut, type MapPlace } from '@/lib/eventHotels'
import { geocodeCached } from '@/lib/geocodeStore'
import { todayET } from '@/components/HotelCards'
import HotelBrowser from '@/components/HotelBrowser'
import PublicChirp from '@/components/PublicChirp'

// The event's hotels, in Whistle Ready: the block hotels staff list in the
// Builder (Hotels), each with its own "See rates & book" button into the housing
// company's booking page for that hotel. lib/eventHotels has the why.
//
// Public: families arrive from /tournaments/<slug>/hotel (the short link in club
// letters and the share page), the event page and its menu. In
// PUBLIC_TOURNAMENT_PATH in middleware.ts.

// Same cache policy as the event and rules pages (see the note there): served
// from cache for 30 s; saving in the Builder refreshes it at once.
export const revalidate = 30

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

async function load(id: string) {
  const client = db()
  let t: any = null; let c: any = {}; let soldOut: any = {}
  try { const r = await client.execute({ sql: 'SELECT t.id, t.name, t.venues, o.slug AS orgSlug FROM "Tournament" t LEFT JOIN "Organization" o ON o.id = t.orgId WHERE t.id = ?', args: [id] }); if (r.rows.length) t = r.rows[0] } catch {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${id}`] }); if (r.rows.length) c = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  // Sold-out marks from the housing board / Builder (lib/hotelStatus).
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`hotelStatus:${id}`] }); if (r.rows.length) soldOut = JSON.parse(((r.rows[0] as any).value as string) || '{}')?.soldOut || {} } catch {}
  return { t, c, soldOut }
}

/**
 * The fields for the map: each venue with an address (Setup › Venues & fields),
 * looked up once and kept (lib/geocodeStore). A slow or failed lookup just leaves
 * the fields off the map.
 */
async function fieldsOnMap(venues: unknown): Promise<MapPlace[]> {
  let list: any[] = []
  try { const v = JSON.parse(String(venues || '[]')); list = Array.isArray(v) ? v : Array.isArray(v?.venues) ? v.venues : [] } catch {}
  const withAddress = list.filter(v => typeof v?.address === 'string' && v.address.trim()).slice(0, 4)
  const found = await Promise.all(withAddress.map(async v => {
    const spot = await geocodeCached(v.address, { timeoutMs: 4000 }).catch(() => null)
    return spot ? { name: String(v.name || '').trim().slice(0, 80), address: String(v.address).replace(/\s+/g, ' ').trim().slice(0, 160), lat: spot.lat, lng: spot.lng } : null
  }))
  return found.filter((f): f is MapPlace => !!f)
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const { t } = await load(params.id)
  const name = String(t?.name || 'Tournament').trim()
  const title = `Hotels — ${name}`
  const description = clip(`Team hotels and event rates for ${name}.`)
  const url = tournamentAbs(String(t?.orgSlug || ''), `/tournaments/${params.id}/hotels`)
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function TournamentHotelsPage({ params }: { params: { id: string } }) {
  const { t, c, soldOut } = await load(params.id)
  const hotels = withSoldOut(cleanHotels(c?.hotelList), soldOut)
  // No list yet: the short link knows the next best place (the housing link,
  // then the event page), and never sends anyone back here.
  if (!t || !hotels.length) redirect(`/tournaments/${params.id}/hotel`)

  const base = `/tournaments/${params.id}`
  const moreUrl = safeUrl(c?.hotelsUrl)
  const name = String(t.name || '').trim()
  // Only worth looking up when a hotel can go on the map.
  const fields = hotels.some(onMap) ? await fieldsOnMap(t.venues) : []

  return (
    // A size wider than the rules page so each hotel's photos have room.
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <div className="mb-4">
        <Link href={`${base}/event`} className="inline-flex items-center gap-1.5 text-teal-700 hover:text-teal-900 text-sm font-semibold"><ArrowLeft size={15} /> Back to event page</Link>
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2"><Hotel size={22} className="text-slate-400" /> Hotels</h1>
      <p className="text-slate-600 mt-2 mb-6">
        {hotels.every(h => h.eventRate)
          ? <>Hotels holding rooms for {name || 'the event'}. Book through these buttons so you get the event rate and your rooms count for the event.</>
          : <>Hotels near the fields for {name || 'the event'}. The ones marked Event rate hold rooms for the tournament. Book through these buttons so you get that rate and your rooms count for the event.</>}
      </p>

      {hotels.every(h => h.soldOut) && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-4 py-3 mb-4 text-sm">
          Every hotel here is sold out right now.
          {moreUrl && <> <a href={moreUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">See more hotels near the fields</a>.</>}
        </div>
      )}

      <HotelBrowser hotels={hotels} fields={fields} fallbackUrl={moreUrl} today={todayET()} />

      {moreUrl && (
        <p className="text-sm text-slate-500 mt-5">
          Need something else? <a href={moreUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-0.5">See more hotels near the fields<ArrowUpRight size={13} /></a>
        </p>
      )}

      {c?.hotels && (
        <section className="mt-10">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Good to know</h2>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 prose-body" dangerouslySetInnerHTML={{ __html: mdToHtml(String(c.hotels)) }} />
        </section>
      )}

      <PublicChirp tournamentId={params.id} tournamentName={name} />
    </main>
  )
}
