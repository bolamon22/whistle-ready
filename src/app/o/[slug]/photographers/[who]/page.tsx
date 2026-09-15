import { createClient } from '@libsql/client'
import { notFound } from 'next/navigation'
import BookingForm from './BookingForm'
import { photographerList, findPhotographer, displayName } from '@/lib/photographers'
import { upcomingOrgEvents } from '@/lib/vendorApproval'
import type { Metadata } from 'next'
import { orgAbs, clip } from '@/lib/seo'

export const revalidate = 30

function db() { return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }) }

async function load(slug: string, who: string) {
  const client = db()
  const orgRes = await client.execute({ sql: 'SELECT id, name, contactEmail FROM "Organization" WHERE slug = ?', args: [slug] })
  if (orgRes.rows.length === 0) return null
  const org = orgRes.rows[0] as any
  let list: any[] = []
  try {
    const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [`photographers:${org.id}`] })
    if (r.rows.length) list = JSON.parse(((r.rows[0] as any).value as string) || '[]')
  } catch { /* no photographers configured */ }
  const ph = findPhotographer(photographerList(list), who)
  return ph ? { org, ph, client } : null
}

export async function generateMetadata({ params }: { params: { slug: string; who: string } }): Promise<Metadata> {
  const d = await load(params.slug, params.who)
  if (!d) return { title: 'Photographer not found' }
  const title = `${displayName(d.ph)} — book a shoot`
  const description = clip(d.ph.bio || `Book ${displayName(d.ph)} for team and player photos at ${d.org.name} tournaments.`)
  const url = orgAbs(params.slug, `/photographers/${d.ph.slug}`)
  return { title: { absolute: title }, description, alternates: { canonical: url }, openGraph: { title, description, url }, twitter: { title, description } }
}

export default async function Page({ params }: { params: { slug: string; who: string } }) {
  const d = await load(params.slug, params.who)
  if (!d) notFound()
  const { org, ph, client } = d

  const all = await upcomingOrgEvents(String(org.id))
  // An empty eventIds means "available at every event" -- see src/lib/photographers.ts.
  const events = ph.eventIds.length ? all.filter(e => ph.eventIds.includes(e.id)) : all

  // Teams registered for each of those events, for the club autocomplete. This is the
  // whole reason this page beats the form it replaces: the parent picks from teams
  // that actually exist instead of typing "14U" six different ways.
  const teamsByEvent: Record<string, { name: string; division: string }[]> = {}
  for (const e of events) {
    try {
      const r = await client.execute({
        sql: `SELECT DISTINCT rt.teamName AS name, rt.division AS division
              FROM "RegisteredTeam" rt JOIN "TeamRegistration" tr ON tr.id = rt.registrationId
              WHERE tr.tournamentId = ? AND tr.deletedAt IS NULL AND rt.teamName <> ''
              ORDER BY rt.teamName`,
        args: [e.id],
      })
      teamsByEvent[e.id] = (r.rows as any[]).map(x => ({ name: String(x.name || ''), division: String(x.division || '') })).filter(x => x.name)
    } catch { teamsByEvent[e.id] = [] }
  }

  return (
    <BookingForm
      orgId={String(org.id)} orgName={String(org.name || '')}
      photographer={ph} events={events} teamsByEvent={teamsByEvent}
      disclaimer={`${org.name} credentials photographers but doesn’t employ them. Pricing, delivery and payment are between you and ${displayName(ph)}.`}
    />
  )
}
