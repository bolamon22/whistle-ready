import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from '../_chrome'
import PublicGallery from '@/components/PublicGallery'

// Reads below go to Turso via @libsql/client, which uses fetch() under the hood.
// Next caches fetch responses in its Data Cache, and `force-dynamic` does NOT
// disable that — the page re-renders per request but replays a stale DB result.
// These two lines are what actually keep published pages current.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'
import type { Metadata } from 'next'
import { abs, clip, stripMd } from '@/lib/seo'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db(); let name = params.slug
  try { const r = await client.execute({ sql: 'SELECT name FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) name = (r.rows[0] as any).name } catch {}
  const title = `Photo gallery — ${name}`; const description = clip(`Action photos from ${name} tournaments and events.`); const url = abs(`/o/${params.slug}/gallery`)
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function GalleryPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) return <NotFound slug={params.slug} />
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} registerHref={registerHref} />
      <main className="max-w-6xl mx-auto px-6 py-14 w-full flex-1">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-8">Gallery</h1>
        <PublicGallery photos={photos} tournaments={tournaments} covers={covers} />
      </main>
      <OrgFooter org={org} contact={contact} socials={socials} />
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
