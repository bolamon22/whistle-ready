import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { requireDirector } from '@/lib/apiAuth'

// Empty staff profiles (Oct 2026). Bo's early import left people in the pool with no
// email and no phone; he asked to remove the ones that can't be reached. Many of those
// still carry real history though (game assignments and pay records from past events,
// or a spot on an upcoming roster), and deleting a Worker cascades away all of it. So a
// profile only counts as empty when it has no email, no phone, and nothing attached
// anywhere: no assignment, roster entry, availability, time entry or pay record. The
// delete re-checks every id against the same rule, so a stale list can't take history.

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const EMPTY_SQL = `
  SELECT w.id, w.name, w.defaultRole, w.createdAt FROM "Worker" w
   WHERE (w.email IS NULL OR trim(w.email) = '')
     AND length(replace(replace(replace(replace(replace(replace(coalesce(w.phone,''),' ',''),'-',''),'(',''),')',''),'.',''),'+','')) < 7
     AND NOT EXISTS (SELECT 1 FROM "Assignment"    x WHERE x.workerId = w.id)
     AND NOT EXISTS (SELECT 1 FROM "RosterEntry"   x WHERE x.workerId = w.id)
     AND NOT EXISTS (SELECT 1 FROM "Availability"  x WHERE x.workerId = w.id)
     AND NOT EXISTS (SELECT 1 FROM "TimeEntry"     x WHERE x.workerId = w.id)
     AND NOT EXISTS (SELECT 1 FROM "PaymentRecord" x WHERE x.workerId = w.id)`

async function orgFor(req: Request, gate: { role: string; orgId: string | null }, fromBody?: unknown) {
  if (gate.role !== 'admin') return gate.orgId ?? ''
  return String(fromBody ?? new URL(req.url).searchParams.get('viewOrgId') ?? gate.orgId ?? '')
}

// GET: the empty profiles, plus how many no-contact profiles are being KEPT because
// they have history (so the panel can say why they aren't listed).
export async function GET(req: Request) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  const orgId = await orgFor(req, gate)
  const client = db()
  const scope = orgId ? ' AND w.orgId = ?' : ''
  const args = orgId ? [orgId] : []
  const empty = await client.execute({ sql: EMPTY_SQL + scope + ' ORDER BY w.name', args })
  const noContact = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM "Worker" w WHERE (w.email IS NULL OR trim(w.email) = '')
            AND length(replace(replace(replace(replace(replace(replace(coalesce(w.phone,''),' ',''),'-',''),'(',''),')',''),'.',''),'+','')) < 7` + scope,
    args,
  })
  const total = Number((noContact.rows[0] as any)?.n ?? 0)
  return NextResponse.json({
    profiles: empty.rows.map((r: any) => ({ id: String(r.id), name: String(r.name ?? ''), role: String(r.defaultRole ?? ''), createdAt: String(r.createdAt ?? '') })),
    keptWithHistory: Math.max(0, total - empty.rows.length),
  })
}

// POST {ids, viewOrgId?}: delete those ids that are still empty profiles in this org.
export async function POST(req: Request) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  let body: { ids?: unknown; viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : []
  if (!ids.length) return NextResponse.json({ error: 'No profiles given' }, { status: 400 })
  const orgId = await orgFor(req, gate, body.viewOrgId)
  const client = db()
  const scope = orgId ? ' AND w.orgId = ?' : ''
  const still = await client.execute({ sql: EMPTY_SQL + scope + ` AND w.id IN (${ids.map(() => '?').join(',')})`, args: [...(orgId ? [orgId] : []), ...ids] })
  const ok = still.rows.map((r: any) => String(r.id))
  for (const id of ok) await client.execute({ sql: `DELETE FROM "Worker" WHERE id = ?`, args: [id] })
  return NextResponse.json({ deleted: ok.length, skipped: ids.length - ok.length })
}
