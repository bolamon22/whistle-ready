import type { Metadata } from 'next'
import { createClient } from '@libsql/client'
import { tournamentAbs, clip } from '@/lib/seo'
import EventChrome from '@/app/tournaments/[id]/_eventChrome'

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  let name = 'Tournament'; let orgSlug = ''
  try { const r = await db().execute({ sql: 'SELECT t.name, o.slug AS orgSlug FROM "Tournament" t LEFT JOIN "Organization" o ON o.id = t.orgId WHERE t.id = ?', args: [params.id] }); if (r.rows.length) { name = (r.rows[0] as any).name; orgSlug = (r.rows[0] as any).orgSlug || '' } } catch {}
  const title = `Schedule & standings — ${name}`
  const description = clip(`Live game schedule, scores and standings for ${name}.`)
  const url = tournamentAbs(orgSlug, `/tournaments/${params.id}/public`)
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

// The schedule is a section of the event, not a separate site: same org header,
// same hero, same fact strip (with SCHEDULE marked as the current page). It
// used to draw a header of its own, the third one in the codebase.
export default function PublicLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  return <EventChrome tournamentId={params.id} active="schedule">{children}</EventChrome>
}
