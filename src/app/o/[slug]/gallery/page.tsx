import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, PageRec } from '../_chrome'
import PublicGallery from '@/components/PublicGallery'

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
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const nav = buildNav(params.slug, pages, gallery.length > 0)

  const tRes = await client.execute({ sql: 'SELECT id, name, startDate, endDate, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate', args: [org.id as string] })
  const today = new Date().toISOString().slice(0, 10)
  const reg = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today).find(t => Number(t.teamRegEnabled))
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined
  const tournaments = (tRes.rows as any[]).map(t => ({ id: String(t.id), name: String(t.name || 'Tournament') }))
  const photos = gallery.map((p: any, i: number) => ({ ...p, id: p.id || `p${i}` }))
  const covers = (content.galleryCovers && typeof content.galleryCovers === 'object') ? content.galleryCovers : {}

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} slug={params.slug} nav={nav} registerHref={registerHref} />
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
