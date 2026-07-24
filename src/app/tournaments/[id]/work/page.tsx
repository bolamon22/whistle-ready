import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'
import WorkForm from '@/components/WorkForm'

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
import type { Metadata } from 'next'
import { tournamentAbs, clip, stripMd } from '@/lib/seo'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }
const D_POSITIONS = ['Referee / Official', 'Scorekeeper', 'Field / Event staff', 'Athletic trainer / Medical']
const D_REF_LEVELS = ['Level 1 / Local', 'Level 2', 'Level 3', 'Regional', 'National', 'Other']
const D_INTRO = "We're looking for officials, scorekeepers, trainers, and event staff to help us run a great event. Tell us about yourself and we'll be in touch about open positions."
const D_AGE = 'I am at least 16 years old (or in high school or older)'

function dayRange(start?: string, end?: string): string[] {
  if (!start) return []
  try {
    const s = new Date(start + 'T00:00:00'); const e = new Date((end || start) + 'T00:00:00')
    const out: string[] = []
    for (let dt = new Date(s); dt <= e && out.length < 14; dt.setDate(dt.getDate() + 1)) out.push(dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))
    return out
  } catch { return [] }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const client = db(); let name = 'our event'; let orgSlug = ''
  try { const r = await client.execute({ sql: 'SELECT t.name, o.slug AS orgSlug FROM "Tournament" t LEFT JOIN "Organization" o ON o.id = t.orgId WHERE t.id = ?', args: [params.id] }); if (r.rows.length) { name = (r.rows[0] as any).name; orgSlug = (r.rows[0] as any).orgSlug || '' } } catch {}
  const title = `Work at ${name}`; const description = clip(`Apply to work ${name} as a referee, scorekeeper, athletic trainer or event staff.`); const url = tournamentAbs(orgSlug, `/tournaments/${params.id}/work`)
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function TournamentWork({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name, orgId, startDate, endDate FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  const t = tRes.rows[0] as any
  const orgId = t.orgId as string
  let forms: any = {}
  try { if (orgId) { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${orgId}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') } } catch {}
  const sf = forms.staff || {}
  const positions = Array.isArray(sf.positions) && sf.positions.length ? sf.positions : D_POSITIONS
  const refLevels = Array.isArray(sf.refLevels) && sf.refLevels.length ? sf.refLevels : D_REF_LEVELS
  const ageLabel = sf.ageLabel !== undefined ? sf.ageLabel : D_AGE
  const introHtml = mdToHtml(sf.intro || D_INTRO)
  const confirmationTitle = sf.confirmationTitle || 'Application received!'
  const confirmationHtml = mdToHtml(sf.confirmationMessage || "Thanks for your interest in working our events! We've received your application and will reach out about open positions.")
  const days = dayRange(t.startDate, t.endDate)
  const today = new Date().toISOString().slice(0, 10)
  let events: { id: string; name: string }[] = []
  try { if (orgId) { const er = await client.execute({ sql: 'SELECT id, name, startDate, endDate FROM "Tournament" WHERE orgId = ? ORDER BY startDate', args: [orgId] }); events = (er.rows as any[]).filter(x => (x.endDate || x.startDate || '') >= today || String(x.id) === String(t.id)).map(x => ({ id: String(x.id), name: String(x.name || 'Event') })) } } catch {}
  return (
    <div className="min-h-screen bg-slate-50">
      <WorkForm orgId={orgId} introHtml={introHtml} positions={positions} refLevels={refLevels} ageLabel={ageLabel} confirmationTitle={confirmationTitle} confirmationHtml={confirmationHtml} tournamentId={t.id} tournamentName={t.name} days={days} events={events} preselect={String(t.id)} />
    </div>
  )
}
