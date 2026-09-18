import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from '../_chrome'
import PublicGallery from '@/components/PublicGallery'
import PhotographerTiles from '@/components/PhotographerTiles'
import { photographerList, creditLinks } from '@/lib/photographers'
import { publishedSummary } from '@/lib/galleryStore'

// Cache policy for published pages.
//
// Jul 20 2026: these pages read Turso via @libsql/client, which uses fetch() under the
// hood, and Next caches fetch responses in its Data Cache. A `dynamic` export does NOT
// disable that, so pages re-rendered on every request while replaying a stale DB
// response — and since nothing expired, they stayed stale indefinitely (an org hero
// image and gallery went missing until it was noticed).
//
// `revalidate` is the fix rather than turning caching off: content is served from cache
// for this many seconds then re-fetched, so staleness is always bounded. Saving in the
// admin also calls revalidatePath() for an immediate refresh. Don't swap this back to
// dynamic/no-store — that made every visit re-run every query (~14s page loads).
export const revalidate = 30
import type { Metadata } from 'next'
import { orgAbs, clip, stripMd } from '@/lib/seo'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db(); let name = params.slug
  try { const r = await client.execute({ sql: 'SELECT name FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) name = (r.rows[0] as any).name } catch {}
  const title = `Photo gallery — ${name}`; const description = clip(`Action photos from ${name} tournaments and events.`); const url = orgAbs(params.slug, '/gallery')
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function GalleryPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) notFound()
  const org = orgRes.rows[0] as any

  let content: any = {}
  try {
    const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
    if (cr.rows.length) content = JSON.parse(((cr.rows[0] as any).value as string) || '{}')
  } catch { /* none */ }
  if (content.logo) org.logoUrl = content.logo
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const contact = content.contact || {}
  const socials = content.socials || {}
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  // Whoever is scrolling these photos is the exact person who might book one of
  // the people who took them, so the tiles go under the grid rather than on a
  // page nobody navigates to.
  let shooters: any[] = []
  try {
    const pr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`photographers:${org.id}`] })
    if (pr.rows.length) shooters = JSON.parse(((pr.rows[0] as any).value as string) || '[]')
  } catch { /* the section just doesn't render */ }

  let forms: any = {}
  try { const fr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (fr.rows.length) forms = JSON.parse(((fr.rows[0] as any).value as string) || '{}') } catch {}
  const base = orgBase(params.slug)
  const workHref = (forms.staff?.enabled !== false) ? `${base}/work` : undefined
  const nav = buildNav(base, pages, gallery.length > 0, workHref)

  const tRes = await client.execute({ sql: 'SELECT id, name, startDate, endDate, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate', args: [org.id as string] })
  const today = new Date().toISOString().slice(0, 10)
  const reg = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today).find(t => Number(t.teamRegEnabled))
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined
  const tournaments = (tRes.rows as any[]).map(t => ({ id: String(t.id), name: String(t.name || 'Tournament') }))
  const photos = gallery.map((p: any, i: number) => ({ ...p, id: p.id || `p${i}` }))
  const covers = (content.galleryCovers && typeof content.galleryCovers === 'object') ? content.galleryCovers : {}
  // The credit under each photo is the photographer's payment for contributing
  // it. Resolved here rather than in the client component so the browser gets a
  // small string map instead of every profile.
  const shooterList = photographerList(shooters)

  // Contributed media is counted here and fetched by the browser per album. The
  // page renders Bo's curated set, which is small because he picks it by hand;
  // shipping a photographer's whole weekend into this HTML is the thing the table
  // exists to stop.
  const contributed = await publishedSummary(String(org.id))
  const creditHrefs = creditLinks(photos, shooterList, base)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} registerHref={registerHref} />
      <main className="max-w-6xl mx-auto px-6 py-14 w-full flex-1">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">Gallery</h1>
          <div className="flex items-center gap-4">
            <Link href={`${base}/photographers`}
              className="text-[14px] font-semibold text-slate-600 hover:text-slate-900">
              Book photo &amp; video
            </Link>
            <Link href={`${base}/gallery/shoot`}
              className="text-[14px] font-semibold text-teal-700 hover:text-teal-900 inline-flex items-center gap-1.5">
              Shoot with us &rarr;
            </Link>
          </div>
        </div>
        <PublicGallery
          photos={photos} tournaments={tournaments} covers={covers} creditLinks={creditHrefs}
          feed={{ orgSlug: params.slug, total: contributed.total, byTournament: contributed.byTournament, covers: contributed.covers, videoTotal: contributed.videoTotal }}
        />

        <div className="mt-16 pt-12 border-t border-slate-200">
          <PhotographerTiles
            photographers={shooterList}
            base={base}
            limit={4}
            title="Book photo &amp; video"
            subtitle={`Credentialed by ${org.name} and shooting our events. You book them directly \u2014 we take no cut.`}
          />
        </div>
      </main>
      <OrgFooter org={org} contact={contact} socials={socials} base={base} pages={pages} />
    </div>
  )
}

function NotFound({ slug }: { slug: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6">
      <div>
        <Trophy size={40} className="mx-auto text-slate-300" />
        <h1 className="mt-3 text-xl font-bold text-slate-800">Site not found</h1>
        <Link href={`/o/${slug}`} className="text-teal-700 hover:underline text-sm mt-2 inline-block">Back to home</Link>
      </div>
    </div>
  )
}
