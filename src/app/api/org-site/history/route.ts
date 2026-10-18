import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createClient } from '@libsql/client'
import { authOptions } from '@/lib/auth'
import { computeOrgHistory } from '@/lib/orgHistory'

// The three headline figures of the home page's "By the numbers" band, for the Website
// editor's live preview. Same computation and same past-event filter as /o/[slug], so
// the preview shows what the published page shows. `content` is the editor's unsaved
// copy, posted so a changed "events run before" count shows before it is published.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'admin' && role !== 'director') return NextResponse.json(null, { status: 403 })
  const paramOrg = new URL(req.url).searchParams.get('org')
  const orgId = role === 'admin' && paramOrg ? paramOrg : (session?.user as any)?.orgId
  if (!orgId) return NextResponse.json(null)
  try {
    const content = await req.json().catch(() => ({}))
    const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
    const r = await client.execute({ sql: 'SELECT id, name, startDate, endDate, location FROM "Tournament" WHERE orgId = ?', args: [String(orgId)] })
    const today = new Date().toISOString().slice(0, 10)
    const past = (r.rows as any[])
      .filter(t => String(t.endDate || t.startDate || '') < today && String(t.name || ''))
      .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))
    if (!past.length) return NextResponse.json(null)
    const h = await computeOrgHistory(client, past, content || {})
    return NextResponse.json({ totalEvents: h.totalEvents, totalGames: h.totalGames, champs: h.champs })
  } catch {
    return NextResponse.json(null)
  }
}
