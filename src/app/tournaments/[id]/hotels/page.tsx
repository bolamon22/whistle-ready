import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@libsql/client'
import { ArrowLeft, Hotel, ArrowUpRight } from 'lucide-react'
import type { Metadata } from 'next'
import { mdToHtml } from '@/app/o/[slug]/_md'
import { tournamentAbs, clip } from '@/lib/seo'
import { cleanHotels, safeUrl } from '@/lib/eventHotels'
import HotelCards, { todayET } from '@/components/HotelCards'
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
  let t: any = null; let c: any = {}
  try { const r = await client.execute({ sql: 'SELECT t.id, t.name, o.slug AS orgSlug FROM "Tournament" t LEFT JOIN "Organization" o ON o.id = t.orgId WHERE t.id = ?', args: [id] }); if (r.rows.length) t = r.rows[0] } catch {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${id}`] }); if (r.rows.length) c = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  return { t, c }
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
  const { t, c } = await load(params.id)
  const hotels = cleanHotels(c?.hotelList)
  // No list yet: the short link knows the next best place (the housing link,
  // then the event page), and never sends anyone back here.
  if (!t || !hotels.length) redirect(`/tournaments/${params.id}/hotel`)

  const base = `/tournaments/${params.id}`
  const moreUrl = safeUrl(c?.hotelsUrl)
  const name = String(t.name || '').trim()

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
      <div className="mb-4">
        <Link href={`${base}/event`} className="inline-flex items-center gap-1.5 text-teal-700 hover:text-teal-900 text-sm font-semibold"><ArrowLeft size={15} /> Back to event page</Link>
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2"><Hotel size={22} className="text-slate-400" /> Hotels</h1>
      <p className="text-slate-600 mt-2 mb-6">
        Hotels holding rooms for {name || 'the event'}. Book through these buttons so you get the event rate and your rooms count for the event.
      </p>

      <HotelCards hotels={hotels} fallbackUrl={moreUrl} today={todayET()} />

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
