import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import ShootPage from './ShootPage'
import { mediaConfig, photographerSharePct } from '@/lib/mediaForm'
import { upcomingOrgEvents } from '@/lib/vendorApproval'
import type { Metadata } from 'next'
import { orgAbs, clip } from '@/lib/seo'

// Same cache policy as the rest of the public org pages: bounded staleness rather
// than no-store, which made every visit re-run every query.
export const revalidate = 30

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const client = db(); let name = params.slug
  try { const r = await client.execute({ sql: 'SELECT name FROM "Organization" WHERE slug = ?', args: [params.slug] }); if (r.rows.length) name = (r.rows[0] as any).name } catch {}
  const title = `Shoot with us — media credentials · ${name}`
  const description = clip(`Free media credentials for photographers and content creators at ${name} tournaments. Field access, credit on every photo, and bookings from teams.`)
  const url = orgAbs(params.slug, '/gallery/shoot')
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function Page({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, logoUrl, contactEmail FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Page not found</h1></div></div>
  }
  const org = orgRes.rows[0] as any

  let forms: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  try { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo } } catch {}
  const cfg = mediaConfig(forms.media)
  const events = await upcomingOrgEvents(org.id)

  // Reach, counted rather than claimed: teams is the sum of numTeams on
  // registrations that haven't been soft-deleted, across every upcoming event.
  // A failed read drops the stats; it never drops the page.
  let teams = 0, clubs = 0
  try {
    const r = await client.execute({
      sql: `SELECT COALESCE(SUM(r.numTeams),0) AS teams, COUNT(DISTINCT r.clubName) AS clubs
            FROM "TeamRegistration" r JOIN "Tournament" t ON t.id = r.tournamentId
            WHERE t.orgId = ? AND r.deletedAt IS NULL`,
      args: [org.id as string],
    })
    teams = Number((r.rows[0] as any)?.teams || 0)
    clubs = Number((r.rows[0] as any)?.clubs || 0)
  } catch { /* stats are a nicety */ }

  return (
    <ShootPage
      orgId={String(org.id)} orgName={String(org.name || '')} orgLogo={String(org.logoUrl || '')}
      contactEmail={String(cfg.notifyEmail || org.contactEmail || '')}
      cfg={cfg} keepPct={photographerSharePct(cfg)} events={events}
      liveStats={{ teams, clubs, events: events.length }}
    />
  )
}
