import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from './_chrome'
import { fetchInstagram } from './_instagram'
import type { Metadata } from 'next'
import { SITE_URL, abs, orgAbs, tournamentAbs, clip, stripMd } from '@/lib/seo'
import { regBadge, type RegBadge } from '@/lib/regStatus'
import JsonLd from '@/components/JsonLd'
import { sponsorList, sponsorPitch } from '@/lib/sponsors'
import { computeOrgHistory, type OrgHistory } from '@/lib/orgHistory'
import OrgHomeView from '@/components/site/OrgHomeView'
import SiteEditBar from '@/components/site/SiteEditBar'
import { siteLayout } from '@/lib/siteLayout'

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

interface Tourn { id: string; name: string; tagline?: string; startDate: string; endDate: string; location: string; logoUrl: string; sport: string; teamRegEnabled: number; badge?: RegBadge | null }

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db()
  let org: any = null
  try { const r = await client.execute({ sql: 'SELECT id, name, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) org = r.rows[0] } catch {}
  if (!org) return { title: 'Organization' }
  let about = ''
  let seoTitle = ''
  let seoDescription = ''
  try { const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (cr.rows.length) { const c = JSON.parse(((cr.rows[0] as any).value as string) || '{}'); about = c.hero?.subtext || c.about?.body || ''; seoTitle = String(c.seoTitle || ''); seoDescription = String(c.seoDescription || ''); if (c.logo) org.logoUrl = c.logo } } catch {}
  // The generic "{Org} — Tournaments, schedules & team registration" default wins no
  // non-brand searches: it carries no sport and no geography, which is what people
  // actually type. Orgs can override both from Dashboard → Website → Search engines.
  const title = seoTitle || `${org.name} — Tournaments, schedules & team registration`
  const description = clip(seoDescription || stripMd(about) || `${org.name}: upcoming tournaments, live schedules, standings and online team registration — all in one place.`)
  const url = orgAbs(params.slug)
  // A purpose-built 1200x630 card, NOT the logo. og:image used to be the logo
  // file, which every messaging app padded and tinted into a washed-out block —
  // see src/lib/ogCard.tsx. Absolute on whistleready.app so it resolves the same
  // from the org's own domain.
  const images = [{ url: abs(`/api/og/org/${params.slug}`), width: 1200, height: 630, alt: title }]
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url, images }, twitter: { title, description, images }, appleWebApp: { title: org.name || title } }
}

export default async function OrgSite({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6">
        <div>
          <Trophy size={40} className="mx-auto text-slate-300" />
          <h1 className="mt-3 text-xl font-bold text-slate-800">Site not found</h1>
          <p className="text-slate-500 mt-1 text-sm">No organization matches “{params.slug}”.</p>
        </div>
      </div>
    )
  }
  const org = orgRes.rows[0] as any

  let content: any = {}
  try {
    const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
    if (cr.rows.length) content = JSON.parse(((cr.rows[0] as any).value as string) || '{}')
  } catch (e: any) {
    // Don't fail silently: a bad read here blanks the hero, gallery and sponsors.
    console.error('[org page] failed to read orgSite content:', org.id, e?.message || e)
  }
  const hero = content.hero || {}
  const about = content.about || {}
  const sponsors: any[] = Array.isArray(content.sponsors) ? content.sponsors : []
  const contact = content.contact || {}
  const socials = content.socials || {}
  if (content.logo) org.logoUrl = content.logo
  const gallery: any[] = Array.isArray(content.gallery) ? content.gallery : []
  const ig = content.instagram || {}

  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  let forms: any = {}
  try { const fr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (fr.rows.length) forms = JSON.parse(((fr.rows[0] as any).value as string) || '{}') } catch {}
  const base = orgBase(params.slug)
  const spons = sponsorList(sponsors)
  const spitch = sponsorPitch(content.sponsorPitch)
  const workHref = (forms.staff?.enabled !== false) ? `${base}/work` : undefined
  const nav = buildNav(base, pages, gallery.length > 0, workHref)

  const tRes = await client.execute({
    sql: 'SELECT id, name, startDate, endDate, location, logoUrl, sport, teamRegEnabled, registrationDivisions FROM "Tournament" WHERE orgId = ? ORDER BY startDate',
    args: [org.id as string],
  })
  const all = (tRes.rows as any[]).map(r => ({ ...r, teamRegEnabled: Number(r.teamRegEnabled) })) as Tourn[]
  try { const tg = await client.execute({ sql: 'SELECT id, tagline FROM "Tournament" WHERE orgId = ?', args: [org.id as string] }); const tm: Record<string, string> = {}; (tg.rows as any[]).forEach(r => { if (r.tagline) tm[String(r.id)] = String(r.tagline) }); all.forEach(t => { (t as any).tagline = tm[String(t.id)] || '' }) } catch {}
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = all.filter(t => (t.endDate || t.startDate || '') >= today).sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''))
  // The name check matches /stats exactly. Without it an unnamed draft event would be
  // counted here and not there -- one of the two ways these pages could report a
  // different number of tournaments run; the other was the event count itself, typed
  // into site settings here and computed from the series origins there.
  const past = all.filter(t => (t.endDate || t.startDate || '') < today && String(t.name || '')).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))

  // Teaser for /stats, from the SAME computation /stats renders. It used to run its own
  // cheaper pair of aggregates, which is how the front door came to claim 7,608 games
  // while /stats claimed 10,791 on the same afternoon: this counted only what is in the
  // game table, and /stats folds in an estimate for the editions that predate online
  // scorekeeping. Whichever way that call goes, both pages now go the same way.
  let hist: OrgHistory | null = null
  if (past.length) {
    try { hist = await computeOrgHistory(client, past, content) } catch { /* the band just doesn't render */ }
  }
  // Registration-status badges. One query for every upcoming event rather than a
  // round trip per card; a failure here just means no badges, never a broken page.
  if (upcoming.length) {
    try {
      const keys = upcoming.map(t => `tournamentSite:${t.id}`)
      const rows = await client.execute({
        sql: `SELECT "key", "value" FROM "AppSetting" WHERE "key" IN (${keys.map(() => '?').join(',')})`,
        args: keys,
      })
      const byId: Record<string, any> = {}
      for (const r of rows.rows as any[]) {
        try { byId[String(r.key).replace('tournamentSite:', '')] = JSON.parse(String(r.value || '{}')) } catch { /* skip one bad blob */ }
      }
      for (const t of upcoming) {
        const content = byId[t.id]
        if (!content) continue
        let divs: string[] = []
        try { const d = JSON.parse((t as any).registrationDivisions || '[]'); if (Array.isArray(d)) divs = d.filter(Boolean) } catch { /* no divisions, label falls back */ }
        t.badge = regBadge(content, divs)
      }
    } catch { /* no badges this render */ }
  }

  const registerHref = upcoming[0] ? `/tournaments/${upcoming[0].id}/register` : undefined

  const igItems = await fetchInstagram(ig.token || '', 8)

  const orgUrl = orgAbs(params.slug)
  const orgLd = { '@context': 'https://schema.org', '@type': 'SportsOrganization', name: org.name, url: orgUrl, ...(org.logoUrl ? { logo: abs(org.logoUrl) } : {}), sameAs: [socials.facebook, socials.instagram, socials.website].filter(Boolean) }
  const eventsLd = upcoming.length ? { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: upcoming.map((t, i) => ({ '@type': 'ListItem', position: i + 1, url: tournamentAbs(params.slug, `/tournaments/${t.id}/event`), name: t.name })) } : null
  return (
    <div className="min-h-screen bg-slate-50">
      <JsonLd data={eventsLd ? [orgLd, eventsLd] : orgLd} />
      <OrgHeader org={org} homeHref={base || '/'} nav={nav} registerHref={registerHref} />

      <OrgHomeView
        orgName={String(org.name || '')} hero={hero} about={about} foundedYear={content.foundedYear}
        upcoming={upcoming} hasPast={past.length > 0} hist={hist}
        gallery={gallery} spons={spons} spitch={spitch} ig={ig} igItems={igItems} socials={socials}
        base={base} registerHref={registerHref} layout={siteLayout(content.layout)} />
      <SiteEditBar slug={params.slug} />
      <OrgFooter org={org} contact={contact} socials={socials} base={base} pages={pages} />
    </div>
  )
}
