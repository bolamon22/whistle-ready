import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { OrgHeader, OrgFooter, PageLink } from '../_chrome'

export const dynamic = 'force-dynamic'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
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
  const pages: any[] = Array.isArray(content.pages) ? content.pages : []
  const navPages: PageLink[] = pages.filter(p => p.title && p.slug).map(p => ({ title: p.title, slug: p.slug }))
  if (gallery.length > 0) navPages.unshift({ title: 'Gallery', slug: 'gallery' })

  const tRes = await client.execute({ sql: 'SELECT id, startDate, endDate, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate', args: [org.id as string] })
  const today = new Date().toISOString().slice(0, 10)
  const reg = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today).find(t => Number(t.teamRegEnabled))
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} slug={params.slug} pages={navPages} registerHref={registerHref} />
      <main className="max-w-6xl mx-auto px-6 py-14 w-full flex-1">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-8">Gallery</h1>
        {gallery.length === 0
          ? <p className="text-slate-400">No photos yet — check back soon.</p>
          : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {gallery.map((ph, i) => (
                <a key={i} href={ph.url} target="_blank" rel="noreferrer" className="group block rounded-2xl overflow-hidden border border-slate-200 bg-white">
                  <div className="aspect-square overflow-hidden">
                    <img src={ph.url} alt={ph.caption || ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  </div>
                  {ph.caption && <p className="text-xs text-slate-500 px-3 py-2 truncate">{ph.caption}</p>}
                </a>
              ))}
            </div>}
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
