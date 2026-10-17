import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@libsql/client'
import { ChevronLeft } from 'lucide-react'
import type { Metadata } from 'next'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from '../_chrome'
import { orgAbs } from '@/lib/seo'
import { hasHowTo, publicHowTo } from '@/lib/howToVideos'
import HowToGrid from './HowToGrid'

// Same cache policy as the org's other pages (see [page]/page.tsx for why).
export const revalidate = 30

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const title = 'How-to videos for families and coaches'
  const description = 'Short videos: signing your player’s waiver, your parent dashboard, and the coach waiver.'
  const url = orgAbs(params.slug, '/how-to')
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url } }
}

/** sunshineeventsgroup.com/how-to: the family and club how-to videos (lib/howToVideos). */
export default async function HowToPage({ params }: { params: { slug: string } }) {
  if (!hasHowTo(params.slug)) notFound()
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) notFound()
  const org = orgRes.rows[0] as any
  let content: any = {}
  try {
    const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
    if (cr.rows.length) content = JSON.parse(((cr.rows[0] as any).value as string) || '{}')
  } catch { /* no content */ }
  if (content.logo) org.logoUrl = content.logo
  // Which videos are Public (the Video library's Visibility, lib/videoVisibility).
  let vis: any = {}
  try {
    const vr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: ['howToVisibility'] })
    if (vr.rows.length) vis = JSON.parse(((vr.rows[0] as any).value as string) || '{}')
  } catch { /* defaults */ }
  const ids = publicHowTo(vis).map(v => v.id)
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const base = orgBase(params.slug)
  const nav = buildNav(base, pages, gallery.length > 0)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} />
      <section className="bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white">
        <div className="max-w-3xl mx-auto px-6 py-14">
          <Link href={base || '/'} className="text-sm text-teal-200 hover:text-white inline-flex items-center gap-1"><ChevronLeft size={14} /> Back</Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-3">How-to videos</h1>
          <p className="text-teal-100 mt-3 max-w-xl">Quick videos for families and coaches. Each one is about a minute.</p>
        </div>
      </section>
      <main className="max-w-3xl mx-auto px-6 py-12 w-full flex-1">
        <HowToGrid ids={ids} />
      </main>
      <OrgFooter org={org} contact={content.contact || {}} socials={content.socials || {}} base={base} pages={pages} />
    </div>
  )
}
