import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy, ChevronLeft } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, PageRec } from '../_chrome'
import { mdToHtml } from '../_md'

export const dynamic = 'force-dynamic'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export default async function OrgInfoPage({ params }: { params: { slug: string; page: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) return <NotFound slug={params.slug} />
  const org = orgRes.rows[0] as any

  let content: any = {}
  try {
    const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
    if (cr.rows.length) content = JSON.parse(((cr.rows[0] as any).value as string) || '{}')
  } catch { /* no content */ }
  if (content.logo) org.logoUrl = content.logo
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const page = pages.find(p => p.slug === params.page)
  const nav = buildNav(params.slug, pages, gallery.length > 0)
  const contact = content.contact || {}
  const socials = content.socials || {}

  const tRes = await client.execute({ sql: 'SELECT id, startDate, endDate, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate', args: [org.id as string] })
  const today = new Date().toISOString().slice(0, 10)
  const reg = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today).find(t => Number(t.teamRegEnabled))
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined

  if (!page) return <NotFound slug={params.slug} />

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} slug={params.slug} nav={nav} registerHref={registerHref} />
      {/* Title band */}
      <section className="relative bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white">
        {page.heroImage && <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url(${page.heroImage})` }} aria-hidden />}
        {page.heroImage && <div className="absolute inset-0 bg-[#0b1f3a]/55" aria-hidden />}
        <div className="relative max-w-3xl mx-auto px-6 py-14">
          <Link href={`/o/${params.slug}`} className="text-sm text-teal-200 hover:text-white inline-flex items-center gap-1"><ChevronLeft size={14} /> Back</Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-3">{page.title}</h1>
        </div>
      </section>
      <main className="max-w-3xl mx-auto px-6 py-12 w-full flex-1">
        {page.body
          ? <article className="text-[15px]" dangerouslySetInnerHTML={{ __html: mdToHtml(page.body) }} />
          : <p className="text-slate-400">This page has no content yet.</p>}
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
        <h1 className="mt-3 text-xl font-bold text-slate-800">Page not found</h1>
        <Link href={`/o/${slug}`} className="text-teal-700 hover:underline text-sm mt-2 inline-block">Back to home</Link>
      </div>
    </div>
  )
}
