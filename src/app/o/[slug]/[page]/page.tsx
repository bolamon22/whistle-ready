import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@libsql/client'
import { Trophy, ChevronLeft } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from '../_chrome'
import { mdToHtml } from '../_md'

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
import JsonLd from '@/components/JsonLd'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// AEO: pull FAQ question/answer pairs out of a page's Markdown so we can emit
// FAQPage structured data without any extra authoring UI. Convention: an H2
// containing "FAQ" or "frequently asked" opens the section; each H3 inside it
// is a question and the text below it (until the next heading) is the answer.
// Any info page that follows the pattern gets rich-result markup for free.
function extractFaqs(md: string): { q: string; a: string }[] {
  const faqs: { q: string; a: string }[] = []
  let inFaq = false, q = '', a: string[] = []
  const push = () => { const ans = stripMd(a.join(' ')).trim(); if (q && ans) faqs.push({ q, a: ans }); q = ''; a = [] }
  for (const line of (md || '').split(/\r?\n/)) {
    const h3 = line.match(/^###\s+(.+)/); const h2 = !h3 && line.match(/^##\s+(.+)/); const h1 = !h3 && !h2 && line.match(/^#\s+(.+)/)
    if (h2 || h1) { push(); inFaq = /faq|frequently asked/i.test((h2 || h1)![1]); continue }
    if (h3) { push(); if (inFaq) q = stripMd(h3[1]).trim(); continue }
    if (inFaq && q) a.push(line)
  }
  push()
  return faqs
}

export async function generateMetadata({ params }: { params: { slug: string; page: string } }): Promise<Metadata> {
  const client = db(); let orgName = params.slug; let pageTitle = params.page; let body = ''; let pg: any = null
  try { const r = await client.execute({ sql: 'SELECT id, name FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) { const o = r.rows[0] as any; orgName = o.name; try { const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${o.id}`] }); if (cr.rows.length) { const c = JSON.parse(((cr.rows[0] as any).value as string) || '{}'); pg = (Array.isArray(c.pages) ? c.pages : []).find((p: any) => p.slug === params.page); if (pg) { pageTitle = pg.title; body = pg.body || '' } } } catch {} } } catch {}
  // Pages can carry explicit seoTitle/seoDescription (set via the site API or a
  // future editor field); otherwise metadata is computed from title + body.
  const title = (pg?.seoTitle && String(pg.seoTitle)) || `${pageTitle} — ${orgName}`
  const description = (pg?.seoDescription && String(pg.seoDescription)) || clip(stripMd(body) || `${pageTitle} — ${orgName}.`)
  const url = orgAbs(params.slug, `/${params.page}`)
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function OrgInfoPage({ params }: { params: { slug: string; page: string } }) {
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
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const page = pages.find(p => p.slug === params.page)
  let forms: any = {}
  try { const fr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (fr.rows.length) forms = JSON.parse(((fr.rows[0] as any).value as string) || '{}') } catch {}
  const base = orgBase(params.slug)
  const workHref = (forms.staff?.enabled !== false) ? `${base}/work` : undefined
  const nav = buildNav(base, pages, gallery.length > 0, workHref)
  const contact = content.contact || {}
  const socials = content.socials || {}

  const tRes = await client.execute({ sql: 'SELECT id, startDate, endDate, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate', args: [org.id as string] })
  const today = new Date().toISOString().slice(0, 10)
  const reg = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today).find(t => Number(t.teamRegEnabled))
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined

  if (!page) notFound()

  // Structured data: Article for every info page; FAQPage when the body follows
  // the H2-"FAQ" / H3-question convention (see extractFaqs above).
  const pageUrl = orgAbs(params.slug, `/${params.page}`)
  const articleLd = { '@context': 'https://schema.org', '@type': 'Article', headline: page.title, url: pageUrl, publisher: { '@type': 'Organization', name: org.name }, ...(page.heroImage ? { image: page.heroImage } : {}) }
  const faqs = extractFaqs(page.body || '')
  const faqLd = faqs.length >= 2 ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) } : null

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <JsonLd data={[articleLd, ...(faqLd ? [faqLd] : [])]} />
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} registerHref={registerHref} />
      {/* Title band */}
      <section className="relative bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white">
        {page.heroImage && <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url(${page.heroImage})` }} aria-hidden />}
        {page.heroImage && <div className="absolute inset-0 bg-[#0b1f3a]/55" aria-hidden />}
        <div className="relative max-w-3xl mx-auto px-6 py-14">
          <Link href={base || '/'} className="text-sm text-teal-200 hover:text-white inline-flex items-center gap-1"><ChevronLeft size={14} /> Back</Link>
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
