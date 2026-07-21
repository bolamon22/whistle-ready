import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'
import PlayerRegForm from '@/app/o/[slug]/register/player/PlayerRegForm'

// Reads below go to Turso via @libsql/client, which uses fetch() under the hood.
// Next caches fetch responses in its Data Cache, and `force-dynamic` does NOT
// disable that — the page re-renders per request but replays a stale DB result.
// These two lines are what actually keep published pages current.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const DEFAULT_WAIVER = `## Player Participation Waiver & Release of Liability
By submitting this form I confirm I have read and agree to this waiver, that I am at least 18 years of age, that I am the participant or the legal parent/guardian of the minor participant, and that my typed name is my legal electronic signature.`
const DEFAULT_FIELDS = { gender: true, grade: true, teamName: true, parent2: true, hotelQuestion: false, newsletter: false }

export default async function TournamentPlayerWaiver({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name, orgId FROM "Tournament" WHERE id = ?', args: [params.id] })
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

  // teams registered for THIS tournament -> dropdown
  let teams: string[] = []
  try {
    const tr = await client.execute({ sql: 'SELECT DISTINCT clubName FROM "TeamRegistration" WHERE tournamentId = ? AND deletedAt IS NULL ORDER BY clubName', args: [params.id] })
    teams = (tr.rows as any[]).map(r => String(r.clubName || '').trim()).filter(Boolean)
  } catch { /* none */ }

  const pf = forms.player || {}
  const waiverTitle = pf.waiverTitle || 'Player Participation Waiver & Release of Liability'
  const waiverHtml = mdToHtml(pf.waiverText || DEFAULT_WAIVER)
  const fields = { ...DEFAULT_FIELDS, ...(pf.fields || {}) }
  const confirmationTitle = pf.confirmationTitle || "You're registered!"
  const confirmationHtml = mdToHtml(pf.confirmationMessage || "Thanks for registering. We've received your information and signed waiver.")

  return (
    <div className="min-h-screen bg-slate-50">
      <p className="max-w-2xl mx-auto px-6 pt-6 text-sm text-slate-500">All players must complete this waiver to compete. Required fields are marked *.</p>
      <PlayerRegForm orgId={orgId} fields={fields} waiverTitle={waiverTitle} waiverHtml={waiverHtml} confirmationTitle={confirmationTitle} confirmationHtml={confirmationHtml} teams={teams} tournamentId={t.id} tournamentName={t.name} />
    </div>
  )
}
