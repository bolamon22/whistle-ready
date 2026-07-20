import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createClient } from '@libsql/client'
import { resolveBlocks } from '@/lib/eventBlocks'

// TEMPORARY read-only diagnostic.
//
// Some public event pages render content from the `tournamentSite:{id}` AppSetting
// (overview, contacts, hero) and some don't, even though the /site API returns that
// content. The page reads the row with a RAW libSQL client; the API reads it with
// PRISMA. This route performs BOTH reads for the same key in a single request so the
// two can be compared directly, and reports the shape/length of what each returns
// rather than assuming they agree.
//
// Admin-only: it can read any AppSetting value, which may hold private config.
// Delete once the event-page issue is resolved.
export const dynamic = 'force-dynamic'

function raw() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

function describe(value: unknown) {
  if (typeof value !== 'string') return { ok: false, note: `not a string: ${typeof value}` }
  let parsed: any
  try { parsed = JSON.parse(value || '{}') } catch (e: any) {
    return { ok: false, length: value.length, parseError: e?.message, head: value.slice(0, 120) }
  }
  const doubleEncoded = typeof parsed === 'string'
  return {
    ok: true,
    length: value.length,
    parsedType: Array.isArray(parsed) ? 'array' : typeof parsed,
    doubleEncoded,
    topLevelKeys: doubleEncoded ? null : Object.keys(parsed || {}),
    hasOverview: !!(parsed && typeof parsed === 'object' && parsed.overview),
    overviewLength: parsed && typeof parsed === 'object' && typeof parsed.overview === 'string' ? parsed.overview.length : 0,
    contactsCount: parsed && typeof parsed === 'object' && Array.isArray(parsed.contacts) ? parsed.contacts.length : 0,
    blocksCount: parsed && typeof parsed === 'object' && Array.isArray(parsed.blocks) ? parsed.blocks.length : 0,
    head: value.slice(0, 100),
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'Pass ?key=tournamentSite:<id>' }, { status: 400 })

  const out: any = { key }

  // Path A — raw libSQL client, exactly as the public event page does it.
  try {
    const client = raw()
    const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [key] })
    out.rawClient = { rowCount: r.rows.length, ...(r.rows.length ? describe((r.rows[0] as any).value) : {}) }
  } catch (e: any) {
    out.rawClient = { error: e?.message || String(e) }
  }

  // Path B — Prisma, exactly as the /site API does it.
  try {
    const row = await prisma.appSetting.findUnique({ where: { key } })
    out.prisma = row ? describe(row.value) : { rowCount: 0 }
  } catch (e: any) {
    out.prisma = { error: e?.message || String(e) }
  }

  // Replicate the public event page's exact pipeline against this row, so we can see
  // which gate is failing at runtime instead of inferring it from the rendered HTML.
  try {
    const client = raw()
    const r = await client.execute({ sql: 'SELECT value FROM "AppSetting" WHERE key = ?', args: [key] })
    let c: any = {}
    if (r.rows.length) c = JSON.parse(((r.rows[0] as any).value as string) || '{}')
    const contacts = Array.isArray(c.contacts) ? c.contacts : []
    out.pageSimulation = {
      typeofC: typeof c,
      cIsArray: Array.isArray(c),
      gate_overview: !!c.overview,
      gate_hotels: !!(c.hotelsUrl || c.hotels),
      gate_contacts: contacts.length > 0,
      gate_heroImage: !!c.heroImage,
      overviewSample: typeof c.overview === 'string' ? c.overview.slice(0, 60) : `(${typeof c.overview})`,
      resolvedBlockTypes: resolveBlocks(c).map((b: any) => `${b.type}${b.hidden ? ':hidden' : ''}`),
    }
  } catch (e: any) {
    out.pageSimulation = { error: e?.message || String(e) }
  }

  // Are there duplicate rows for this key? (Would make rows[0] arbitrary.)
  try {
    const client = raw()
    const d = await client.execute({ sql: 'SELECT COUNT(*) AS n FROM "AppSetting" WHERE key = ?', args: [key] })
    out.duplicateRowCount = Number((d.rows[0] as any).n)
  } catch (e: any) {
    out.duplicateRowCount = `error: ${e?.message}`
  }

  return NextResponse.json(out)
}
