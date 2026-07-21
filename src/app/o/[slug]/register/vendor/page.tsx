import { createClient } from '@libsql/client'
import { Trophy } from 'lucide-react'
import { mdToHtml } from '../../_md'
import VendorForm from './VendorForm'

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
const D_DISCLAIMER = "Vendors are not allowed to sell tournament merchandise unless receiving prior approval from the organizer. Items not pre-approved on this application must be removed from the booth or may result in denied future access. Products that do not fit the mission of the event or are deemed not family-friendly will not be allowed to be sold."
const D_LEVELS = ['Food Vendor', 'Merchandise Vendor', 'Bronze Sponsor', 'Silver Sponsor', 'Gold Sponsor']
const D_PAY = ['Check', 'Venmo', 'Zelle', 'Invoice me']

export default async function VendorPage({ params }: { params: { slug: string } }) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, logoUrl FROM "Organization" WHERE slug = ?', args: [params.slug] })
  if (orgRes.rows.length === 0) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Form not found</h1></div></div>
  const org = orgRes.rows[0] as any
  let forms: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] }); if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}
  try { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] }); if (s.rows.length) { const c = JSON.parse(((s.rows[0] as any).value as string) || '{}'); if (c.logo) org.logoUrl = c.logo } } catch {}
  const vf = forms.vendor || {}
  const levels = Array.isArray(vf.levels) ? vf.levels : D_LEVELS
  const paymentOptions = Array.isArray(vf.paymentOptions) ? vf.paymentOptions : D_PAY
  const disclaimerHtml = mdToHtml(vf.disclaimer || D_DISCLAIMER)
  const confirmationTitle = vf.confirmationTitle || 'Vendor request received!'
  const confirmationHtml = mdToHtml(vf.confirmationMessage || "Thanks! We've received your vendor request and will be in touch about next steps and payment.")
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0b1220] text-white"><div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-3">{org.logoUrl && <img src={org.logoUrl} alt="" className="w-12 h-12 rounded-lg object-contain bg-white/95 p-1" />}<div><div className="text-xs uppercase tracking-[0.2em] text-teal-300">Vendor Request</div><h1 className="text-xl font-extrabold leading-tight">{org.name}</h1></div></div></header>
      <VendorForm orgId={org.id} levels={levels} paymentOptions={paymentOptions} disclaimerHtml={disclaimerHtml} confirmationTitle={confirmationTitle} confirmationHtml={confirmationHtml} />
    </div>
  )
}
