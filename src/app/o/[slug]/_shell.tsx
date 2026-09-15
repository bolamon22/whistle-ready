import { createClient } from '@libsql/client'
import { OrgHeader, OrgFooter, buildNav, orgBase, PageRec } from './_chrome'

// Org chrome for the public pages that render a bare form.
//
// WHY: /register/vendor, /register/player, /gallery/shoot and the photographer
// booking page all shipped without a header. On whistleready.app that was hidden
// by the app's own nav sitting above them; on the org's own domain the same nav
// leaked the Whistle Ready brand onto the client's site, and once that was
// correctly hidden these pages had NO navigation at all -- a visitor who landed
// on the vendor form could not get back to the site.
//
// One loader so the nav on these pages is the same nav as everywhere else: the
// org's info pages, the gallery when it has photos, and Work With Us when staff
// applications are open.
export type OrgShellData = {
  org: any
  base: string
  nav: ReturnType<typeof buildNav>
  contact: any
  socials: any
  registerHref?: string
}

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

/** Everything the header and footer need, for an org identified by slug or id. */
export async function orgShell(opts: { slug?: string; orgId?: string }): Promise<OrgShellData | null> {
  const client = db()
  const res = opts.slug
    ? await client.execute({ sql: 'SELECT id, name, slug, contactEmail, logoUrl FROM "Organization" WHERE slug = ?', args: [opts.slug] })
    : await client.execute({ sql: 'SELECT id, name, slug, contactEmail, logoUrl FROM "Organization" WHERE id = ?', args: [String(opts.orgId || '')] })
  if (res.rows.length === 0) return null
  const org = res.rows[0] as any

  let content: any = {}
  try {
    const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgSite:${org.id}`] })
    if (r.rows.length) content = JSON.parse(((r.rows[0] as any).value as string) || '{}')
  } catch { /* the chrome still renders without site content */ }
  if (content.logo) org.logoUrl = content.logo

  let forms: any = {}
  try {
    const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`orgForms:${org.id}`] })
    if (r.rows.length) forms = JSON.parse(((r.rows[0] as any).value as string) || '{}')
  } catch { /* Work With Us just won't show */ }

  const slug = String(org.slug || opts.slug || '')
  const base = orgBase(slug)
  const pages: PageRec[] = Array.isArray(content.pages) ? content.pages : []
  const hasGallery = Array.isArray(content.gallery) && content.gallery.length > 0
  const workHref = forms.staff?.enabled !== false ? `${base}/work` : undefined
  const nav = buildNav(base, pages, hasGallery, workHref)

  // The soonest upcoming event still taking team registrations, for the header button.
  let registerHref: string | undefined
  try {
    const t = await client.execute({
      sql: `SELECT id FROM "Tournament" WHERE orgId = ? AND teamRegEnabled = 1
            AND COALESCE(NULLIF(endDate,''), startDate) >= ? ORDER BY startDate LIMIT 1`,
      args: [String(org.id), new Date().toISOString().slice(0, 10)],
    })
    if (t.rows.length) registerHref = `/tournaments/${(t.rows[0] as any).id}/register`
  } catch { /* the button just won't show */ }

  return { org, base, nav, contact: content.contact || {}, socials: content.socials || {}, registerHref }
}

/** Wraps a page's content in the org's own header and footer. */
export function OrgShell({ data, children }: { data: OrgShellData; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <OrgHeader org={data.org} homeHref={data.base || '/'} nav={data.nav} registerHref={data.registerHref} />
      <div className="flex-1">{children}</div>
      <OrgFooter org={data.org} contact={data.contact} socials={data.socials} />
    </div>
  )
}
