import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { mdToHtml } from '../../_md'
import VendorForm from './VendorForm'
import { vendorConfig } from '@/lib/vendorForm'
import { upcomingOrgEvents } from '@/lib/vendorApproval'

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

export default async function VendorPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, logoUrl, contactEmail FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Form not found</h1></div></div>
  const org = orgRes.rows[0] as any
  let forms: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  try { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo } } catch {}
  // Types, copy and defaults all come from one normaliser so this page, the org
  // page and the admin editor can never disagree about what a vendor can pick.
  const cfg = vendorConfig(forms.vendor)
  const disclaimerHtml = mdToHtml(cfg.disclaimer)
  const confirmationHtml = mdToHtml(cfg.confirmationMessage)
  const events = await upcomingOrgEvents(org.id)

  return (
    <VendorForm orgId={org.id} types={cfg.types} approvalNotice={cfg.approvalNotice}
      disclaimerHtml={disclaimerHtml} confirmationTitle={cfg.confirmationTitle} confirmationHtml={confirmationHtml}
      orgName={org.name} orgLogo={org.logoUrl || undefined}
        heroImage={cfg.heroImage} headline={cfg.headline} subhead={cfg.subhead}
        sponsorShow={cfg.sponsorShow} sponsorBlurb={cfg.sponsorBlurb} sponsorTiers={cfg.sponsorTiers}
        sponsorEmail={cfg.sponsorEmail || org.contactEmail || ''} events={events}
    />
  )
}
