import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'
import VendorForm from '@/app/o/[slug]/register/vendor/VendorForm'
import { vendorConfig } from '@/lib/vendorForm'

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

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export default async function TournamentVendorRequest({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name, orgId, startDate, endDate FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  const t = tRes.rows[0] as any
  const orgId = t.orgId as string
  let org: any = { name: '', logoUrl: '' }
  if (orgId) { const oRes = await client.execute({ sql: 'SELECT name, logoUrl, contactEmail FROM "Organization" WHERE id = ?', args: [orgId] }); if (oRes.rows.length) org = oRes.rows[0] }
  let forms: any = {}
  try { if (orgId) { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${orgId}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') } } catch {}
  try { if (orgId) { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${orgId}`] }); if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo } } } catch {}
  // Types, copy and defaults all come from one normaliser so this page, the org
  // page and the admin editor can never disagree about what a vendor can pick.
  const cfg = vendorConfig(forms.vendor)
  const disclaimerHtml = mdToHtml(cfg.disclaimer)
  const confirmationHtml = mdToHtml(cfg.confirmationMessage)
  return (
    <VendorForm orgId={orgId} types={cfg.types} approvalNotice={cfg.approvalNotice}
      disclaimerHtml={disclaimerHtml} confirmationTitle={cfg.confirmationTitle} confirmationHtml={confirmationHtml}
      orgName={org.name || ''} orgLogo={org.logoUrl || undefined}
      tournamentId={t.id} tournamentName={t.name} eventDates={fmtDates(t.startDate, t.endDate)}
      showHero={false}
        heroImage={cfg.heroImage} headline={cfg.headline} subhead={cfg.subhead}
        sponsorShow={cfg.sponsorShow} sponsorBlurb={cfg.sponsorBlurb} sponsorTiers={cfg.sponsorTiers}
        sponsorEmail={cfg.sponsorEmail || org.contactEmail || ''}
    />
  )
}

/** "Oct 24–25, 2026" from the tournament's stored YYYY-MM-DD strings. */
function fmtDates(start?: string, end?: string): string {
  const d = (v?: string) => { if (!v) return null; const [y, m, day] = String(v).split('-').map(Number); const x = new Date(y, (m || 1) - 1, day || 1); return isNaN(x.getTime()) ? null : x }
  const a = d(start), b = d(end)
  if (!a) return ''
  const M = (x: Date) => x.toLocaleDateString('en-US', { month: 'short' })
  if (!b || a.getTime() === b.getTime()) return `${M(a)} ${a.getDate()}, ${a.getFullYear()}`
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${M(a)} ${a.getDate()}\u2013${b.getDate()}, ${a.getFullYear()}`
  return `${M(a)} ${a.getDate()} \u2013 ${M(b)} ${b.getDate()}, ${b.getFullYear()}`
}
