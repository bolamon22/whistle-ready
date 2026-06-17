import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy, ChevronLeft } from 'lucide-react'
import { OrgHeader, OrgFooter, PageLink } from '../_chrome'

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
  const pages: any[] = Array.isArray(content.pages) ? content.pages : []
  const page = pages.find(p => p.slug === params.page)
  const navPages: PageLink[] = pages.filter(p => p.title && p.slug).map(p => ({ title: p.title, slug: p.slug }))
  const contact = content.contact || {}
  const socials = content.socials || {}

  // register CTA = earliest upcoming tournament that takes registrations
  const tRes = await client.execute({
    sql: 'SELECT id, startDate, endDate, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate',
    args: [org.id as string],
  })
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today)
  const reg = upcoming.find(t => Number(t.teamRegEnabled))
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined

  if (!page) return <NotFound slug={params.slug} />

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} slug={params.slug} pages={navPages} registerHref={registerHref} />
      <main className="max-w-3xl mx-auto px-6 py-12 w-full flex-1">
        <Link href={`/o/${params.slug}`} className="text-sm text-slate-500 hover:text-teal-700 inline-flex items-center gap-1"><ChevronLeft size={14} /> Back</Link>
        <h1 className="text-3xl font-extrabold text-slate-900 mt-3 mb-5">{page.title}</h1>
        {page.body
          ? <div className="text-slate-600 whitespace-pre-line leading-relaxed text-[15px]">{page.body}</div>
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
