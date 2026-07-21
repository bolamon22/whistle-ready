import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy, ChevronLeft } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from '../_chrome'
import { mdToHtml } from '../_md'
import WorkForm from '@/components/WorkForm'

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
import { abs, clip, stripMd } from '@/lib/seo'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }
const D_POSITIONS = ['Referee / Official', 'Scorekeeper', 'Field / Event staff', 'Athletic trainer / Medical']
const D_REF_LEVELS = ['Level 1 / Local', 'Level 2', 'Level 3', 'Regional', 'National', 'Other']
const D_INTRO = "We're looking for officials, scorekeepers, trainers, and event staff to help us run a great event. Tell us about yourself and we'll be in touch about open positions."
const D_AGE = 'I am at least 16 years old (or in high school or older)'

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db(); let name = params.slug
  try { const r = await client.execute({ sql: 'SELECT name FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) name = (r.rows[0] as any).name } catch {}
  const title = `Work with us — ${name}`; const description = clip(`Apply to work ${name} events as a referee, scorekeeper, athletic trainer or event staff.`); const url = abs(`${base}/work`)
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function OrgWorkPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) return <NotFound slug={params.slug} />
  const org = orgRes.rows[0] as any

  let content: any = {}
  try { const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (cr.rows.length) content = JSON.parse(((cr.rows[0] as any).value as string) || '{}') } catch {}
  if (content.logo) org.logoUrl = content.logo
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const contact = content.contact || {}
  const socials = content.socials || {}

  let forms: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  const sf = forms.staff || {}
  const base = orgBase(params.slug)
  const workHref = (sf.enabled !== false) ? `${base}/work` : undefined
  const nav = buildNav(base, pages, gallery.length > 0, workHref)

  const tRes = await client.execute({ sql: 'SELECT id, name, startDate, endDate, teamRegEnabled FROM "Tournament" WHERE orgId = ? ORDER BY startDate', args: [org.id as string] })
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (tRes.rows as any[]).filter(t => (t.endDate || t.startDate || '') >= today)
  const reg = upcoming.find(t => Number(t.teamRegEnabled))
  const registerHref = reg ? `/tournaments/${reg.id}/register` : undefined
  const events = upcoming.map(t => ({ id: String(t.id), name: String(t.name || 'Event') }))

  const positions = Array.isArray(sf.positions) && sf.positions.length ? sf.positions : D_POSITIONS
  const refLevels = Array.isArray(sf.refLevels) && sf.refLevels.length ? sf.refLevels : D_REF_LEVELS
  const ageLabel = sf.ageLabel !== undefined ? sf.ageLabel : D_AGE
  const introHtml = mdToHtml(sf.intro || D_INTRO)
  const confirmationTitle = sf.confirmationTitle || 'Application received!'
  const confirmationHtml = mdToHtml(sf.confirmationMessage || "Thanks for your interest in working our events! We've received your application and will reach out about open positions.")
  const heroImage = sf.heroImage || ''

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} registerHref={registerHref} />
      <section className="relative bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a] text-white">
        {heroImage && <div className="absolute inset-0 bg-center bg-cover" style={{ backgroundImage: `url(${heroImage})` }} aria-hidden />}
        {heroImage && <div className="absolute inset-0 bg-[#0b1f3a]/55" aria-hidden />}
        <div className="relative max-w-3xl mx-auto px-6 py-14">
          <Link href={base || '/'} className="text-sm text-teal-200 hover:text-white inline-flex items-center gap-1"><ChevronLeft size={14} /> Back</Link>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mt-3">Work With Us</h1>
        </div>
      </section>
      <main className="w-full flex-1">
        <WorkForm orgId={org.id} introHtml={introHtml} positions={positions} refLevels={refLevels} ageLabel={ageLabel} confirmationTitle={confirmationTitle} confirmationHtml={confirmationHtml} events={events} />
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
