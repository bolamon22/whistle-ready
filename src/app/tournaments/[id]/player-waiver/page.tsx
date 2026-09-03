import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'
import PlayerRegForm, { type ClubOption } from '@/app/o/[slug]/register/player/PlayerRegForm'

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

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const DEFAULT_WAIVER = `## Player Participation Waiver & Release of Liability
By submitting this form I confirm I have read and agree to this waiver, that I am at least 18 years of age, that I am the participant or the legal parent/guardian of the minor participant, and that my typed name is my legal electronic signature.`
const DEFAULT_FIELDS = { gender: true, grade: true, teamName: true, parent2: true, hotelQuestion: false, newsletter: false }

export default async function TournamentPlayerWaiver({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name, orgId, logoUrl FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  }
  const t = tRes.rows[0] as any
  const orgId = t.orgId as string

  let org: any = { name: '', logoUrl: '' }
  if (orgId) {
    const oRes = await client.execute({ sql: 'SELECT name, logoUrl FROM "Organization" WHERE id = ?', args: [orgId] })
    if (oRes.rows.length) org = oRes.rows[0]
  }

  let forms: any = {}
  try {
    if (orgId) { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${orgId}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') }
  } catch { /* none */ }
  try {
    if (orgId) { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${orgId}`] }); if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo } }
  } catch { /* none */ }

  // Clubs registered for THIS tournament, each with its teams -> club picker, then team picker
  let teams: string[] = []
  let clubs: ClubOption[] = []
  try {
    const tr = await client.execute({
      sql: 'SELECT r.clubName AS club, r.clubLogoUrl AS clubLogo, t.teamName AS team, t.division AS division, t.logoUrl AS teamLogo FROM "TeamRegistration" r LEFT JOIN "RegisteredTeam" t ON t.registrationId = r.id WHERE r.tournamentId = ? AND r.deletedAt IS NULL ORDER BY r.clubName, t.teamName',
      args: [params.id],
    })
    const byClub = new Map<string, Map<string, string>>()
    const logoByClub = new Map<string, string>() // club logo from the registration, else a team's
    for (const row of tr.rows as any[]) {
      const club = String(row.club || '').trim()
      if (!club) continue
      if (!byClub.has(club)) byClub.set(club, new Map())
      const team = String(row.team || '').trim()
      if (team) byClub.get(club)!.set(team, String(row.division || '').trim())
      const logo = String(row.clubLogo || '').trim() || String(row.teamLogo || '').trim()
      if (logo && !logoByClub.has(club)) logoByClub.set(club, logo)
    }
    clubs = [...byClub.entries()].map(([name, ts]) => ({ name, logoUrl: logoByClub.get(name) || '', teams: [...ts.entries()].map(([n, division]) => ({ name: n, division })) }))
    teams = clubs.map(c => c.name)
  } catch { /* none */ }

  const pf = forms.player || {}
  const waiverTitle = pf.waiverTitle || 'Player Participation Waiver & Release of Liability'
  const waiverHtml = mdToHtml(pf.waiverText || DEFAULT_WAIVER)
  const fields = { ...DEFAULT_FIELDS, ...(pf.fields || {}) }
  const confirmationTitle = pf.confirmationTitle || "You're registered!"
  const confirmationHtml = mdToHtml(pf.confirmationMessage || "Thanks for registering. We've received your information and signed waiver.")

  return (
    <div className="min-h-screen bg-slate-50">
      <PlayerRegForm orgId={orgId} fields={fields} waiverTitle={waiverTitle} waiverHtml={waiverHtml} confirmationTitle={confirmationTitle} confirmationHtml={confirmationHtml} teams={teams} clubs={clubs} tournamentId={t.id} tournamentName={t.name}
        header={{ logoUrl: String(t.logoUrl || org.logoUrl || ''), title: String(t.name || '') }} />
    </div>
  )
}
