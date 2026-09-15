import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import ShootPage from '@/app/o/[slug]/gallery/shoot/ShootPage'
import { mediaConfig, photographerSharePct } from '@/lib/mediaForm'
import { upcomingOrgEvents } from '@/lib/vendorApproval'

// Same page as /gallery/shoot, reached from an event. Both render one component so
// the copy, levels and terms can never differ between the two doors in.
export const revalidate = 30

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export default async function TournamentShoot({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name, orgId FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  }
  const t = tRes.rows[0] as any
  const orgId = String(t.orgId || '')

  let org: any = { name: '', logoUrl: '', contactEmail: '' }
  if (orgId) { const o = await client.execute({ sql: 'SELECT name, logoUrl, contactEmail FROM "Organization" WHERE id = ?', args: [orgId] }); if (o.rows.length) org = o.rows[0] }
  let forms: any = {}
  try { if (orgId) { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${orgId}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') } } catch {}
  try { if (orgId) { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${orgId}`] }); if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo } } } catch {}
  const cfg = mediaConfig(forms.media)
  const events = await upcomingOrgEvents(orgId)

  let teams = 0, clubs = 0
  try {
    const r = await client.execute({
      sql: 'SELECT COALESCE(SUM(numTeams),0) AS teams, COUNT(DISTINCT clubName) AS clubs FROM "TeamRegistration" WHERE tournamentId = ? AND deletedAt IS NULL',
      args: [params.id],
    })
    teams = Number((r.rows[0] as any)?.teams || 0)
    clubs = Number((r.rows[0] as any)?.clubs || 0)
  } catch { /* stats are a nicety */ }

  return (
    <ShootPage
      orgId={orgId} orgName={String(org.name || '')} orgLogo={String(org.logoUrl || '')}
      contactEmail={String(cfg.notifyEmail || org.contactEmail || '')}
      cfg={cfg} keepPct={photographerSharePct(cfg)} events={events}
      // Arriving from an event means that event is the one they came for.
      defaultEventIds={[String(t.id)]}
      liveStats={{ teams, clubs, events: events.length }}
    />
  )
}
