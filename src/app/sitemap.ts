import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { createClient } from '@libsql/client'
import { orgAbs, tournamentAbs } from '@/lib/seo'
import { ORG_DOMAINS, DOMAIN_BY_SLUG } from '@/lib/orgDomains'

export const dynamic = 'force-dynamic'
function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

// Orgs with a custom domain (ORG_DOMAINS) get their URLs emitted ON that domain
// (via orgAbs/tournamentAbs) so the sitemap matches the canonicals and search
// credit consolidates there. Everything else stays on whistleready.app.
//
// Aug 2026 audit: one sitemap was served to every host, so
// sunshineeventsgroup.com/sitemap.xml listed 35 URLs of which 13 were OTHER
// orgs' whistleready.app pages. A sitemap is supposed to describe the host that
// serves it — cross-domain entries are ignored at best, and it leaked one
// client's pages into another's sitemap. Now each host lists only its own URLs:
// an org's custom domain describes that org, and whistleready.app describes the
// orgs that don't have a domain of their own (those are covered by theirs).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = []
  const now = new Date()

  let onlySlug: string | null = null
  try {
    const host = (headers().get('host') || '').replace(/:\d+$/, '').replace(/^www\./, '').toLowerCase()
    onlySlug = ORG_DOMAINS[host] || null
  } catch { /* main-domain behaviour */ }

  try {
    const client = db()
    const orgSlugById: Record<string, string> = {}
    const orgs = await client.execute('SELECT id, slug FROM "Organization"')

    const included = new Set<string>()
    for (const row of orgs.rows as any[]) {
      const slug = String(row.slug || ''); if (!slug) continue
      orgSlugById[String(row.id)] = slug
      // On an org's own domain: that org only. On whistleready.app: only orgs
      // without a custom domain, so no entry is ever cross-host.
      if (onlySlug ? slug !== onlySlug : Boolean(DOMAIN_BY_SLUG[slug])) continue
      included.add(slug)

      out.push({ url: orgAbs(slug), lastModified: now, changeFrequency: 'weekly', priority: 0.8 })
      out.push({ url: orgAbs(slug, '/work'), lastModified: now, changeFrequency: 'monthly', priority: 0.4 })
      out.push({ url: orgAbs(slug, '/results'), lastModified: now, changeFrequency: 'weekly', priority: 0.5 })
      try {
        const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${row.id}`] })
        if (cr.rows.length) {
          const c = JSON.parse(((cr.rows[0] as any).value as string) || '{}')
          if (Array.isArray(c.gallery) && c.gallery.length) out.push({ url: orgAbs(slug, '/gallery'), lastModified: now, changeFrequency: 'weekly', priority: 0.5 })
          ;(Array.isArray(c.pages) ? c.pages : []).forEach((p: any) => { if (p && p.slug) out.push({ url: orgAbs(slug, `/${p.slug}`), lastModified: now, changeFrequency: 'monthly', priority: 0.4 }) })
        }
      } catch {}
    }

    const ts = await client.execute('SELECT id, orgId FROM "Tournament"')
    for (const row of ts.rows as any[]) {
      const id = String(row.id || ''); if (!id) continue
      const oSlug = orgSlugById[String(row.orgId || '')] || ''
      if (!included.has(oSlug)) continue
      out.push({ url: tournamentAbs(oSlug, `/tournaments/${id}/event`), lastModified: now, changeFrequency: 'weekly', priority: 0.7 })
      out.push({ url: tournamentAbs(oSlug, `/tournaments/${id}/public`), lastModified: now, changeFrequency: 'daily', priority: 0.6 })
    }
  } catch {}
  return out
}
