import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { requireDirector } from '@/lib/apiAuth'

// Empty staff profiles (Oct 2026). Bo's early import left people in the pool with no
// email and no phone, and he asked to remove them. Every event before Monster Mash
// (Oct 24 2026) was a sample: assignments and "paid" marks on those are test data. But
// the app has no sample flag, and a date cutoff would quietly turn real history into
// deletable history once Monster Mash is over. So the organizer ticks which PAST events
// count as samples; a profile can go when it has no email, no phone, and every row
// attached to it (assignment, roster spot, availability, time entry, pay record) sits
// on a ticked event. Upcoming and in-progress events can never be ticked, so anyone on
// a real roster stays. The delete re-checks every id against the same rule.

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const PHONE_DIGITS = `length(replace(replace(replace(replace(replace(replace(coalesce(w.phone,''),' ',''),'-',''),'(',''),')',''),'.',''),'+',''))`
const NO_CONTACT = `(w.email IS NULL OR trim(w.email) = '') AND ${PHONE_DIGITS} < 7`

// one row per (worker, tournament) a no-contact worker has anything on
const HISTORY_SQL = (scope: string) => `
  SELECT h.workerId, h.tournamentId, COUNT(*) AS n FROM (
    SELECT a.workerId, g.tournamentId FROM "Assignment" a JOIN "Game" g ON g.id = a.gameId
    UNION ALL SELECT workerId, tournamentId FROM "RosterEntry"
    UNION ALL SELECT workerId, tournamentId FROM "Availability"
    UNION ALL SELECT workerId, tournamentId FROM "TimeEntry"
    UNION ALL SELECT workerId, tournamentId FROM "PaymentRecord"
  ) h JOIN "Worker" w ON w.id = h.workerId
  WHERE ${NO_CONTACT}${scope}
  GROUP BY h.workerId, h.tournamentId`

const today = () => new Date().toISOString().slice(0, 10)
const endOf = (t: { startDate?: unknown; endDate?: unknown }) => String(t.endDate || t.startDate || '').slice(0, 10)

async function orgFor(req: Request, gate: { role: string; orgId: string | null }, fromBody?: unknown) {
  if (gate.role !== 'admin') return gate.orgId ?? ''
  return String(fromBody ?? new URL(req.url).searchParams.get('viewOrgId') ?? gate.orgId ?? '')
}

async function load(orgId: string) {
  const client = db()
  const scope = orgId ? ' AND w.orgId = ?' : ''
  const args = orgId ? [orgId] : []
  const people = await client.execute({ sql: `SELECT w.id, w.name, w.defaultRole FROM "Worker" w WHERE ${NO_CONTACT}${scope} ORDER BY w.name`, args })
  const hist = await client.execute({ sql: HISTORY_SQL(scope), args })
  const byWorker = new Map<string, Record<string, number>>()
  const tIds = new Set<string>()
  for (const r of hist.rows as any[]) {
    const m = byWorker.get(String(r.workerId)) ?? {}
    m[String(r.tournamentId)] = Number(r.n); byWorker.set(String(r.workerId), m); tIds.add(String(r.tournamentId))
  }
  const tournaments: { id: string; name: string; startDate: string; endDate: string; past: boolean }[] = []
  if (tIds.size) {
    const ids = Array.from(tIds)
    const t = await client.execute({ sql: `SELECT id, name, startDate, endDate FROM "Tournament" WHERE id IN (${ids.map(() => '?').join(',')})`, args: ids })
    for (const r of t.rows as any[]) {
      const end = endOf(r)
      tournaments.push({ id: String(r.id), name: String(r.name ?? ''), startDate: String(r.startDate ?? ''), endDate: String(r.endDate ?? ''), past: !!end && end < today() })
    }
  }
  tournaments.sort((a, b) => a.startDate.localeCompare(b.startDate))
  const profiles = (people.rows as any[]).map(r => ({ id: String(r.id), name: String(r.name ?? ''), role: String(r.defaultRole ?? ''), history: byWorker.get(String(r.id)) ?? {} }))
  return { client, profiles, tournaments }
}

// GET: every no-contact profile with its history per event, plus those events.
export async function GET(req: Request) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  const { profiles, tournaments } = await load(await orgFor(req, gate))
  return NextResponse.json({ profiles, tournaments })
}

// POST {ids, sampleTournamentIds, viewOrgId?}: delete those ids that still have no email,
// no phone, and no history outside the given PAST events, along with that sample history.
export async function POST(req: Request) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  let body: { ids?: unknown; sampleTournamentIds?: unknown; viewOrgId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean).slice(0, 500) : []
  if (!ids.length) return NextResponse.json({ error: 'No profiles given' }, { status: 400 })
  const { client, profiles, tournaments } = await load(await orgFor(req, gate, body.viewOrgId))
  const pastIds = new Set(tournaments.filter(t => t.past).map(t => t.id))
  const sample = new Set((Array.isArray(body.sampleTournamentIds) ? body.sampleTournamentIds.map(String) : []).filter(id => pastIds.has(id)))
  const allowed = new Set(profiles.filter(p => Object.keys(p.history).every(t => sample.has(t))).map(p => p.id))
  const go = ids.filter(id => allowed.has(id))
  for (const id of go) {
    // children first, so this works whether or not the database enforces the cascades
    await client.execute({ sql: `DELETE FROM "Assignment" WHERE workerId = ?`, args: [id] })
    for (const t of ['RosterEntry', 'Availability', 'TimeEntry', 'PaymentRecord']) await client.execute({ sql: `DELETE FROM "${t}" WHERE workerId = ?`, args: [id] })
    await client.execute({ sql: `DELETE FROM "Worker" WHERE id = ?`, args: [id] })
  }
  return NextResponse.json({ deleted: go.length, skipped: ids.length - go.length })
}
