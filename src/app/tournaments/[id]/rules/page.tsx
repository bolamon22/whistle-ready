import Link from 'next/link'
import { createClient } from '@libsql/client'
import { Trophy, ScrollText, ArrowLeft } from 'lucide-react'
import { mdToHtml } from '@/app/o/[slug]/_md'
import { OrgHeader, OrgFooter, buildNav } from '@/app/o/[slug]/_chrome'

export const dynamic = 'force-dynamic'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export default async function TournamentRulesPage({ params }: { params: { id: string } }) {
  const client = db()
  const tRes = await client.execute({ sql: 'SELECT id, name, logoUrl, orgId FROM "Tournament" WHERE id = ?', args: [params.id] })
  if (tRes.rows.length === 0) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-center px-6"><div><Trophy size={40} className="mx-auto text-slate-300" /><h1 className="mt-3 text-xl font-bold text-slate-800">Tournament not found</h1></div></div>
  }
  const t = tRes.rows[0] as any

  let c: any = {}
  try { const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`tournamentSite:${params.id}`] }); if (r.rows.length) c = JSON.parse(((r.rows[0] as any).value as string) || '{}') } catch {}

  let org: any = { name: '', slug: '', logoUrl: '', contactEmail: '' }
  let navPages: any[] = []; let hasGallery = false; let contact: any = {}; let socials: any = {}; let orgLogo = ''
  if (t.orgId) {
    try { const oRes = await client.execute({ sql: 'SELECT id, name, slug, contactEmail, logoUrl FROM "Organization" WHERE id = ?', args: [t.orgId] }); if (oRes.rows.length) org = oRes.rows[0] } catch {}
    try { const s = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${t.orgId}`] }); if (s.rows.length) { const oc = JSON.parse(((s.rows[0] as any).value as string) || '{}'); orgLogo = oc.logo || ''; navPages = Array.isArray(oc.pages) ? oc.pages : []; hasGallery = Array.isArray(oc.gallery) && oc.gallery.length > 0; contact = oc.contact || {}; socials = oc.socials || {} } } catch {}
  }
  const headerLogo = orgLogo || org.logoUrl || ''
  const orgForChrome = { name: org.name, logoUrl: headerLogo, contactEmail: org.contactEmail }
  const nav = org.slug ? buildNav(org.slug, navPages, hasGallery) : []
  const base = `/tournaments/${params.id}`

  return (
    <div className="min-h-screen bg-slate-50">
      {org.slug && <OrgHeader org={orgForChrome} slug={org.slug} nav={nav} registerHref={undefined} />}
      <section className="relative overflow-hidden text-white bg-gradient-to-br from-[#0b1f3a] via-[#0e7490] to-[#0b1f3a]">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <Link href={`${base}/event`} className="inline-flex items-center gap-1.5 text-teal-200 hover:text-white text-sm font-medium mb-4"><ArrowLeft size={15} /> Back to {t.name || 'event'}</Link>
          <h1 className="text-3xl font-extrabold tracking-tight inline-flex items-center gap-2.5"><ScrollText size={26} /> Rules &amp; policies</h1>
        </div>
      </section>

      <main className="max-w-3xl mx-auto px-6 py-12">
        {c.rules
          ? <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 prose-body" dangerouslySetInnerHTML={{ __html: mdToHtml(c.rules) }} />
          : <p className="text-slate-500">Rules & policies haven&apos;t been posted yet.</p>}
        <div className="mt-8">
          <Link href={`${base}/event`} className="inline-flex items-center gap-1.5 text-teal-700 hover:text-teal-900 text-sm font-semibold"><ArrowLeft size={15} /> Back to event page</Link>
        </div>
      </main>
      {org.slug && <OrgFooter org={orgForChrome} contact={contact} socials={socials} />}
    </div>
  )
}
