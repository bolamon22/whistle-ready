import { headers } from 'next/headers'
import { createClient } from '@libsql/client'
import { DOMAIN_BY_SLUG, orgSlugForHost } from '@/lib/orgDomains'
import RegisterForm, { type WorkLink } from './RegisterForm'

export const dynamic = 'force-dynamic'

// Create account (RegisterForm asks who it's for). The staff choice can't make an
// account here, so it offers each organizer's "Work with us" application instead:
// organizers with a public site, an event coming up, and the staff form left on.
// On an org's own domain, only that org.
async function workLinks(slug: string | null): Promise<WorkLink[]> {
  try {
    const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
    const today = new Date().toISOString().slice(0, 10)
    const r = await db.execute({
      sql: `SELECT o.id, o.name, o.slug FROM "Organization" o
            WHERE (? = '' OR o.slug = ?)
              AND EXISTS (SELECT 1 FROM "AppSetting" s WHERE s.key = 'orgSite:' || o.id)
              AND EXISTS (SELECT 1 FROM "Tournament" t WHERE t.orgId = o.id AND COALESCE(NULLIF(t.endDate, ''), t.startDate) >= ?)
            ORDER BY o.name LIMIT 6`,
      args: [slug ?? '', slug ?? '', today],
    })
    const out: WorkLink[] = []
    for (const row of r.rows as Record<string, unknown>[]) {
      const id = String(row.id), s = String(row.slug || '')
      if (!s) continue
      let on = true
      try {
        const f = await db.execute({ sql: `SELECT value FROM "AppSetting" WHERE key = ?`, args: [`orgForms:${id}`] })
        const forms = f.rows.length ? JSON.parse(String((f.rows[0] as Record<string, unknown>).value || '{}')) : {}
        on = forms?.staff?.enabled !== false
      } catch { /* unreadable settings: the form's default is on */ }
      if (!on) continue
      const href = slug ? '/work' : DOMAIN_BY_SLUG[s] ? `https://${DOMAIN_BY_SLUG[s]}/work` : `/o/${s}/work`
      out.push({ name: String(row.name || s), href })
    }
    return out.slice(0, 4)
  } catch { return [] }
}

export default async function RegisterPage() {
  const slug = orgSlugForHost(headers().get('host'))
  // /find isn't served on an org's domain; its home page lists the org's events.
  return <RegisterForm workLinks={await workLinks(slug)} eventsHref={slug ? '/' : '/find'} />
}
