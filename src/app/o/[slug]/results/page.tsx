import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@libsql/client'
import { Trophy, BarChart3 } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from '../_chrome'
import type { Metadata } from 'next'
import { orgAbs, clip } from '@/lib/seo'
import ResultsGrid, { ResultRow } from './ResultsGrid'

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

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db(); let name = params.slug
  try { const r = await client.execute({ sql: 'SELECT name FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) name = (r.rows[0] as any).name } catch {}
  const title = `Results & past tournaments — ${name}`
  const description = clip(`Past tournament results, scores and final standings from ${name}.`)
  const url = orgAbs(params.slug, '/results')
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function ResultsPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) notFound()
  const org = orgRes.rows[0] as any

  let content: any = {}
  try { const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (cr.rows.length) content = JSON.parse(((cr.rows[0] as any).value as string) || '{}') } catch {}
  if (content.logo) org.logoUrl = content.logo
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const contact = content.contact || {}
  const socials = content.socials || {}
  let forms: any = {}
  try { const fr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (fr.rows.length) forms = JSON.parse(((fr.rows[0] as any).value as string) || '{}') } catch {}
  const base = orgBase(params.slug)
  const workHref = (forms.staff?.enabled !== false) ? `${base}/work` : undefined
  const nav = buildNav(base, pages, gallery.length > 0, workHref)

  const tRes = await client.execute({ sql: 'SELECT id, name, startDate, endDate, location, logoUrl FROM "Tournament" WHERE orgId = ? ORDER BY startDate DESC', args: [org.id as string] })
  const today = new Date().toISOString().slice(0, 10)
  const past = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') < today)
  const reg = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today)[0]
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined
  const rows: ResultRow[] = past.map(t => ({
    id: String(t.id), name: String(t.name || ''),
    startDate: String(t.startDate || ''), endDate: String(t.endDate || ''),
    location: String(t.location || ''), logoUrl: String(t.logoUrl || ''),
  }))

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} registerHref={registerHref} />
      <section className="relative bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white">
        <div className="relative max-w-6xl mx-auto px-6 py-14">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Results</h1>
          <p className="text-teal-100 mt-2">Scores, final standings and brackets from past tournaments.</p>
          <Link href={`${base}/stats`}
            className="inline-flex items-center gap-1.5 mt-5 bg-white/10 border border-white/25 hover:bg-white/20 transition-colors rounded-full px-4 py-2 text-sm font-semibold">
            <BarChart3 size={15} /> See the whole history by the numbers
          </Link>
        </div>
      </section>
      <main className="max-w-6xl mx-auto px-6 py-14 w-full flex-1">
        {past.length === 0
          ? <p className="text-slate-500">No past tournament results yet — check back after the next event.</p>
          : <ResultsGrid items={rows} />}
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
        <h1 className="mt-3 text-xl font-bold text-slate-800">Page not found</h1>
        <Link href={`/o/${slug}`} className="text-teal-700 hover:underline text-sm mt-2 inline-block">Back to home</Link>
      </div>
    </div>
  )
}
