import type { MetadataRoute } from 'next'
import { createClient } from '@libsql/client'
import { SITE_URL } from '@/lib/seo'

export const dynamic = 'force-dynamic'
function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const out: MetadataRoute.Sitemap = []
  const now = new Date()
  try {
    const client = db()
    const orgs = await client.execute('SELECT id, slug FROM "Organization"')
    for (const row of orgs.rows as any[]) {
      const slug = String(row.slug || ''); if (!slug) continue
      out.push({ url: `${SITE_URL}/o/${slug}`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 })
      out.push({ url: `${SITE_URL}/o/${slug}/work`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 })
      out.push({ url: `${SITE_URL}/o/${slug}/results`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 })
      try {
        const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${row.id}`] })
        if (cr.rows.length) {
          const c = JSON.parse(((cr.rows[0] as any).value as string) || '{}')
          if (Array.isArray(c.gallery) && c.gallery.length) out.push({ url: `${SITE_URL}/o/${slug}/gallery`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 })
          ;(Array.isArray(c.pages) ? c.pages : []).forEach((p: any) => { if (p && p.slug) out.push({ url: `${SITE_URL}/o/${slug}/${p.slug}`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 }) })
        }
      } catch {}
    }
    const ts = await client.execute('SELECT id FROM "Tournament"')
    for (const row of ts.rows as any[]) {
      const id = String(row.id || ''); if (!id) continue
      out.push({ url: `${SITE_URL}/tournaments/${id}/event`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 })
      out.push({ url: `${SITE_URL}/tournaments/${id}/public`, lastModified: now, changeFrequency: 'daily', priority: 0.6 })
    }
  } catch {}
  return out
}
