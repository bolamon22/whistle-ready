import { createClient } from '@libsql/client'
import { ogHeroCard } from '@/lib/ogCard'

// The org site's link-preview card. Served from a plain API route rather than
// Next's opengraph-image file convention, because org sites are reached through
// a middleware rewrite on their own domain and an absolute whistleready.app URL
// is the one thing every crawler resolves the same way.

export const runtime = 'nodejs'
export const revalidate = 3600

const db = () => createClient({ url: process.env.DATABASE_URL!, authToken: process.env.DATABASE_AUTH_TOKEN })

const fmtDay = (d: string) => {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return new Date(+y, +m - 1, +day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtRange(s: string, e: string) {
  if (!s) return ''
  const yr = (e || s).split('-')[0]
  return e && e !== s ? `${fmtDay(s)} – ${fmtDay(e)}, ${yr}` : `${fmtDay(s)}, ${yr}`
}

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const client = db()
  let org: any = null
  try {
    const r = await client.execute({ sql: 'SELECT id, name, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
    if (r.rows.length) org = r.rows[0]
  } catch { /* fall through to a text-only card */ }

  let hero: any = {}
  let logoUrl = String(org?.logoUrl || '')
  if (org) {
    try {
      const cr = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
      if (cr.rows.length) {
        const c = JSON.parse(((cr.rows[0] as any).value as string) || '{}')
        hero = c.hero || {}
        if (c.logo) logoUrl = String(c.logo)
      }
    } catch { /* the card falls back to a flat ground */ }
  }

  // Same "Next up" chip the site's own hero shows, so the preview stays current
  // as events pass without anyone editing a graphic.
  let eyebrow = String(hero.eyebrow || '')
  if (org) {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const up = await client.execute({
        sql: 'SELECT name, startDate, endDate FROM "Tournament" WHERE orgId = ? AND startDate >= ? ORDER BY startDate ASC LIMIT 1',
        args: [org.id, today],
      })
      if (up.rows.length) {
        const t: any = up.rows[0]
        const when = fmtRange(String(t.startDate || ''), String(t.endDate || ''))
        eyebrow = `Next up · ${t.name}${when ? ` · ${when}` : ''}`
      }
    } catch { /* keep whatever eyebrow the site config gave */ }
  }

  return ogHeroCard({
    eyebrow,
    headline: String(hero.headline || org?.name || 'Tournaments'),
    footer: String(hero.subtext || '').slice(0, 90) || undefined,
    imageUrl: String(hero.imageUrl || '') || undefined,
    logoUrl: logoUrl || undefined,
  })
}
