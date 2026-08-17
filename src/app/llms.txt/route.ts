import { headers } from 'next/headers'
import { createClient } from '@libsql/client'
import { orgAbs, tournamentAbs } from '@/lib/seo'
import { ORG_DOMAINS } from '@/lib/orgDomains'

// llms.txt — the plain-text site summary answer engines read.
//
// Two things this has to get right, both learned the hard way (Aug 2026 audit):
//
// 1. CANONICAL URLS. This used to emit `${SITE_URL}/o/${slug}` for every org,
//    so sunshineeventsgroup.com/llms.txt advertised whistleready.app URLs — the
//    exact opposite of the canonicals in seo.ts, which deliberately consolidate
//    an org's search credit on its own domain. Use orgAbs/tournamentAbs.
//
// 2. HOST SCOPE. It also listed EVERY organization on the platform regardless of
//    which domain was asked, so one client's llms.txt handed answer engines a
//    directory of the others. When the request arrives on an org's custom
//    domain, describe that org only.
export const dynamic = 'force-dynamic'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export async function GET() {
  const host = (headers().get('host') || '').replace(/:\d+$/, '').replace(/^www\./, '').toLowerCase()
  const orgSlugForHost = ORG_DOMAINS[host] || null

  const client = db()
  let orgs: any[] = []
  try {
    const r = orgSlugForHost
      ? await client.execute({ sql: 'SELECT id, name, slug FROM "Organization" WHERE slug = ?', args: [orgSlugForHost] })
      : await client.execute('SELECT id, name, slug FROM "Organization"')
    orgs = r.rows as any[]
  } catch { /* fall through to the generic body below */ }

  const single = orgSlugForHost ? orgs[0] : null

  let body = single
    ? `# ${single.name}\n\n> ${single.name} runs sports tournaments: upcoming events, live schedules and standings, online team registration, rules, hotels, and photo galleries.\n\n`
    : `# Whistle Ready\n\n> Whistle Ready powers public tournament websites for sports event organizers: upcoming tournaments, live schedules and standings, online team registration, rules, hotels, and photo galleries.\n\n`

  for (const o of orgs) {
    const slug = String(o.slug || '')
    if (!slug) continue
    body += `## ${o.name}\n- [${o.name} — home](${orgAbs(slug)})\n`
    try {
      const ts = await client.execute({
        sql: 'SELECT id, name, startDate, endDate FROM "Tournament" WHERE orgId = ? ORDER BY startDate',
        args: [o.id],
      })
      for (const t of ts.rows as any[]) {
        // Dates inline: answer engines quote "when is X" straight from this line.
        const when = [t.startDate, t.endDate].filter(Boolean).join(' – ')
        const label = when ? `${t.name} (${when})` : String(t.name)
        body += `- [${label}](${tournamentAbs(slug, `/tournaments/${t.id}/event`)})\n`
      }
    } catch { /* skip this org's events */ }
    body += `\n`
  }

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
