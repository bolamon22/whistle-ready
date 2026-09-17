import { createClient } from '@libsql/client'
import { headers } from 'next/headers'
import { Trophy } from 'lucide-react'
import { DOMAIN_BY_SLUG } from '@/lib/orgDomains'
import { appBaseUrl, fmtRange, orgSiteConfig } from '@/lib/playerPass'
import { coachConfig, coachWaiverFor } from '@/lib/coachForm'
import type { ClubOption } from '@/app/o/[slug]/register/player/PlayerRegForm'
import CoachRegForm from './CoachRegForm'

// Public coach waiver for one tournament. Mirrors the player waiver page — same
// club/team query, same cache policy — so the two forms can never drift on which
// teams exist.

// See the note on the player waiver page: these pages read Turso through
// @libsql/client (fetch under the hood), which Next caches. `revalidate` bounds
// the staleness; don't swap it for dynamic/no-store.
export const revalidate = 30

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

function notFound(msg: string) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6">
      <div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">{msg}</h1></div>
    </div>
  )
}

export default async function TournamentCoachWaiver({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({
    sql: 'SELECT id, name, orgId, logoUrl, startDate, endDate, location FROM "Tournament" WHERE id = ?',
    args: [params.id],
  })
  if (tRes.rows.length === 0) return notFound('Tournament not found')
  const t = tRes.rows[0] as any
  const orgId = String(t.orgId || '')

  let org: any = { name: '', slug: '', logoUrl: '' }
  if (orgId) {
    const o = await client.execute({ sql: 'SELECT name, slug, logoUrl FROM "Organization" WHERE id = ?', args: [orgId] })
    if (o.rows.length) org = o.rows[0]
  }

  let forms: any = {}
  try {
    if (orgId) {
      const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${orgId}`] })
      if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}')
    }
  } catch { /* defaults below */ }
  try {
    if (orgId) {
      const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${orgId}`] })
      if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo }
    }
  } catch { /* none */ }

  const cfg = coachConfig(forms.coach)
  if (!cfg.enabled) return notFound('Coach registration is closed for this event')

  // Clubs registered for THIS tournament with their teams — the same query the
  // player waiver runs, including the name||division key. Several teams in one
  // club are routinely all named after the club; keyed by name alone they
  // collapse into one entry and the waiver files against the wrong division.
  let clubs: ClubOption[] = []
  try {
    const tr = await client.execute({
      sql: 'SELECT r.clubName AS club, r.clubLogoUrl AS clubLogo, t.teamName AS team, t.division AS division, t.logoUrl AS teamLogo FROM "TeamRegistration" r LEFT JOIN "RegisteredTeam" t ON t.registrationId = r.id WHERE r.tournamentId = ? AND r.deletedAt IS NULL ORDER BY r.clubName, t.teamName',
      args: [params.id],
    })
    const byClub = new Map<string, Map<string, { name: string; division: string }>>()
    const logoByClub = new Map<string, string>()
    for (const row of tr.rows as any[]) {
      const club = String(row.club || '').trim()
      if (!club) continue
      if (!byClub.has(club)) byClub.set(club, new Map())
      const team = String(row.team || '').trim()
      const division = String(row.division || '').trim()
      if (team) byClub.get(club)!.set(`${team}||${division}`, { name: team, division })
      const logo = String(row.clubLogo || '').trim() || String(row.teamLogo || '').trim()
      if (logo && !logoByClub.has(club)) logoByClub.set(club, logo)
    }
    clubs = [...byClub.entries()].map(([name, ts]) => ({
      name,
      logoUrl: logoByClub.get(name) || '',
      teams: [...ts.entries()]
        .map(([id, x]) => ({ id, name: x.name, division: x.division }))
        .sort((a, b) => a.division.localeCompare(b.division) || a.name.localeCompare(b.name)),
    }))
  } catch { /* an empty picker is better than a dead page */ }

  const site = orgId ? await orgSiteConfig(orgId).catch(() => ({ logo: '', socials: { instagram: '', facebook: '', website: '' } })) : null
  const orgSite = (org.slug && DOMAIN_BY_SLUG[String(org.slug)]) || ''

  return (
    <div className="min-h-screen bg-slate-50">
      <CoachRegForm
        orgId={orgId}
        tournamentId={String(t.id)}
        tournamentName={String(t.name || '')}
        clubs={clubs}
        cfg={cfg}
        sections={coachWaiverFor(cfg)}
        card={{
          eventNames: String(t.name || ''),
          eventDates: fmtRange(String(t.startDate || ''), String(t.endDate || '')),
          location: String(t.location || ''),
          orgName: String(org.name || ''),
          orgLogoUrl: String(site?.logo || org.logoUrl || t.logoUrl || ''),
          orgSite,
          passBase: appBaseUrl(headers()),
        }}
      />
    </div>
  )
}
