import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { requireStaff } from '@/lib/apiAuth'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// Staff self-service portal (the "My events" section on /dashboard/staff).
//
// GET  → the signed-in Worker (matched by session email — never trusted from the
//        client) plus the org's current/upcoming tournaments, each flagged with
//        whether they're on its roster and how many games they're assigned.
// POST {tournamentId, action:'join'|'leave'} → put yourself on / off an event's
//        roster. RosterEntry IS the "I can work this event" signal — the same pool
//        the Staff Roster page and Assigner read. Leaving is blocked once games
//        are assigned; that's the assigner's call to unwind.

async function findWorker(client: ReturnType<typeof db>, email: string) {
  if (!email) return undefined
  const r = await client.execute({ sql: `SELECT * FROM "Worker" WHERE lower(email) = ? ORDER BY createdAt ASC LIMIT 1`, args: [email] })
  return r.rows[0] as Record<string, unknown> | undefined
}

function workerRoles(worker: Record<string, unknown>): string[] {
  try {
    const r = JSON.parse(String(worker.roles ?? '[]'))
    if (Array.isArray(r) && r.length) return r.map(String)
  } catch { /* fall through */ }
  return [String(worker.defaultRole ?? 'ref')]
}

export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const client = db()

  const email = String(gate.session?.user?.email ?? '').trim().toLowerCase()
  const worker = await findWorker(client, email)

  const orgId = (worker?.orgId as string | null) ?? gate.orgId ?? null
  const tRes = orgId
    ? await client.execute({ sql: `SELECT id, name, startDate, endDate, location, logoUrl FROM "Tournament" WHERE orgId = ? ORDER BY CASE WHEN startDate = '' THEN 1 ELSE 0 END, startDate ASC`, args: [orgId] })
    : await client.execute(`SELECT id, name, startDate, endDate, location, logoUrl FROM "Tournament" ORDER BY CASE WHEN startDate = '' THEN 1 ELSE 0 END, startDate ASC`)

  // Current + upcoming only: an event stays listed through its end date.
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = (tRes.rows as unknown as Record<string, unknown>[]).filter(t => {
    const last = String(t.endDate || '') || String(t.startDate || '')
    return !last || last >= today
  })

  const working = new Set<string>()
  const assigned = new Map<string, number>()
  if (worker) {
    const r = await client.execute({ sql: `SELECT tournamentId FROM "RosterEntry" WHERE workerId = ?`, args: [String(worker.id)] })
    for (const row of r.rows as unknown as Record<string, unknown>[]) working.add(String(row.tournamentId))
    const a = await client.execute({
      sql: `SELECT g.tournamentId AS tid, COUNT(*) AS n FROM "Assignment" x JOIN "Game" g ON g.id = x.gameId WHERE x.workerId = ? GROUP BY g.tournamentId`,
      args: [String(worker.id)],
    })
    for (const row of a.rows as unknown as Record<string, unknown>[]) assigned.set(String(row.tid), Number(row.n))
  }

  return NextResponse.json({
    worker: worker
      ? { id: String(worker.id), name: String(worker.name ?? ''), defaultRole: String(worker.defaultRole ?? 'ref'), roles: workerRoles(worker) }
      : null,
    events: upcoming.map(t => ({
      id: String(t.id), name: String(t.name ?? ''), startDate: String(t.startDate || ''), endDate: String(t.endDate || ''),
      location: String(t.location || ''), logoUrl: String(t.logoUrl || ''),
      working: working.has(String(t.id)), assignedGames: assigned.get(String(t.id)) ?? 0,
    })),
  })
}

export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const client = db()

  let body: { tournamentId?: unknown; action?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const tournamentId = String(body.tournamentId ?? '')
  const action = body.action === 'leave' ? 'leave' : 'join'
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 })

  const email = String(gate.session?.user?.email ?? '').trim().toLowerCase()
  const worker = await findWorker(client, email)
  if (!worker) return NextResponse.json({ error: 'No staff record is linked to your account — contact your coordinator.' }, { status: 400 })

  const tRes = await client.execute({ sql: `SELECT id, orgId, name FROM "Tournament" WHERE id = ?`, args: [tournamentId] })
  const t = tRes.rows[0] as Record<string, unknown> | undefined
  if (!t) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const tOrg = (t.orgId as string | null) ?? null
  const wOrg = (worker.orgId as string | null) ?? null
  if (tOrg && wOrg && tOrg !== wOrg) return NextResponse.json({ error: 'Not your organization\'s event' }, { status: 403 })

  if (action === 'join') {
    await client.execute({
      sql: `INSERT OR IGNORE INTO "RosterEntry" (id, workerId, tournamentId, gameTarget, createdAt) VALUES (?, ?, ?, 0, datetime('now'))`,
      args: [crypto.randomUUID(), String(worker.id), tournamentId],
    })
    return NextResponse.json({ ok: true, working: true })
  }

  const aRes = await client.execute({
    sql: `SELECT COUNT(*) AS n FROM "Assignment" x JOIN "Game" g ON g.id = x.gameId WHERE x.workerId = ? AND g.tournamentId = ?`,
    args: [String(worker.id), tournamentId],
  })
  const n = Number((aRes.rows[0] as Record<string, unknown> | undefined)?.n ?? 0)
  if (n > 0) return NextResponse.json({ error: `You're already assigned to ${n} game${n === 1 ? '' : 's'} at this event — ask your assigner to take you off first.` }, { status: 400 })

  await client.execute({ sql: `DELETE FROM "RosterEntry" WHERE workerId = ? AND tournamentId = ?`, args: [String(worker.id), tournamentId] })
  return NextResponse.json({ ok: true, working: false })
}
