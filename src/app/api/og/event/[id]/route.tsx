import { createClient } from '@libsql/client'
import { ogHeroCard } from '@/lib/ogCard'
import { DOMAIN_BY_SLUG, hostOnly } from '@/lib/orgDomains'

// One tournament's link-preview card. This is the one Bo texts most — a club
// director gets the registration link and should see the event name, the dates
// and the town without opening anything.

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
function shortLocation(loc: string) {
  if (!loc) return ''
  const m = loc.match(/([A-Za-z .'-]+),\s*([A-Z]{2})(?:\s*\d{5})?/)
  return m ? `${m[1].trim()}, ${m[2]}` : loc.split(',')[0].trim()
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const client = db()
  let t: any = null
  try {
    const r = await client.execute({
      sql: 'SELECT id, name, startDate, endDate, location, logoUrl, orgId FROM "Tournament" WHERE id = ?',
      args: [params.id],
    })
    if (r.rows.length) t = r.rows[0]
  } catch { /* fall through */ }

  // The event's own hero photo when it has one, else the org's — a card with a
  // photo beats a flat one, and an event rarely has its own early on.
  let imageUrl = ''
  let logoUrl = String(t?.logoUrl || '')
  try {
    const c = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${params.id}`] })
    if (c.rows.length) imageUrl = String(JSON.parse(((c.rows[0] as any).value as string) || '{}').heroImage || '')
  } catch { /* ignore */ }
  let orgSlug = ''
  if (t?.orgId) {
    try {
      const o = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${t.orgId}`] })
      if (o.rows.length) {
        const c = JSON.parse(((o.rows[0] as any).value as string) || '{}')
        if (!imageUrl) imageUrl = String(c.hero?.imageUrl || '')
        if (!logoUrl && c.logo) logoUrl = String(c.logo)
      }
    } catch { /* ignore */ }
    try {
      const o = await client.execute({ sql: 'SELECT slug FROM "Organization" WHERE id = ?', args: [t.orgId] })
      if (o.rows.length) orgSlug = String((o.rows[0] as any).slug || '')
    } catch { /* ignore */ }
  }
  // Show the org's own domain when it has one — that is the address the reader
  // will recognize, not whistleready.app.
  const domain = hostOnly(DOMAIN_BY_SLUG[orgSlug] || '') || 'whistleready.app'

  const when = fmtRange(String(t?.startDate || ''), String(t?.endDate || ''))
  const loc = shortLocation(String(t?.location || ''))

  return ogHeroCard({
    eyebrow: [when, loc].filter(Boolean).join(' · ') || undefined,
    headline: String(t?.name || 'Tournament'),
    footer: `Team registration open · ${domain}`,
    imageUrl: imageUrl || undefined,
    logoUrl: logoUrl || undefined,
  })
}
