import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import { requireStaff } from '@/lib/apiAuth'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// POST /api/workers/merge {keepId, removeId} — merge two duplicate Workers.
// Repoints roster entries, availability, assignments, time entries, and pay records to
// keepId (dropping rows that would collide on a unique constraint), fills keep's empty
// fields from remove, unions their roles, then deletes remove. Destructive — the Staff
// Pool UI confirms before calling.
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res

  let body: { keepId?: unknown; removeId?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const keepId = String(body.keepId ?? '')
  const removeId = String(body.removeId ?? '')
  if (!keepId || !removeId || keepId === removeId) {
    return NextResponse.json({ error: 'keepId and removeId are required and must differ' }, { status: 400 })
  }

  const client = db()
  const kRes = await client.execute({ sql: `SELECT * FROM "Worker" WHERE id = ?`, args: [keepId] })
  const rRes = await client.execute({ sql: `SELECT * FROM "Worker" WHERE id = ?`, args: [removeId] })
  const keep = kRes.rows[0] as Record<string, unknown> | undefined
  const rem = rRes.rows[0] as Record<string, unknown> | undefined
  if (!keep || !rem) return NextResponse.json({ error: 'Worker not found' }, { status: 404 })

  // Org scoping: non-admins may only merge within their own org
  if (gate.role !== 'admin') {
    const kOrg = (keep.orgId as string | null) ?? null
    const rOrg = (rem.orgId as string | null) ?? null
    if ((kOrg && kOrg !== gate.orgId) || (rOrg && rOrg !== gate.orgId)) {
      return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    }
  }

  // Repoint relations, dropping rows that would collide on a unique constraint.
  await client.execute({ sql: `DELETE FROM "RosterEntry" WHERE workerId = ? AND tournamentId IN (SELECT tournamentId FROM "RosterEntry" WHERE workerId = ?)`, args: [removeId, keepId] })
  await client.execute({ sql: `UPDATE "RosterEntry" SET workerId = ? WHERE workerId = ?`, args: [keepId, removeId] })
  await client.execute({ sql: `DELETE FROM "Availability" WHERE workerId = ? AND (tournamentId || '|' || date) IN (SELECT tournamentId || '|' || date FROM "Availability" WHERE workerId = ?)`, args: [removeId, keepId] })
  await client.execute({ sql: `UPDATE "Availability" SET workerId = ? WHERE workerId = ?`, args: [keepId, removeId] })
  await client.execute({ sql: `UPDATE "Assignment" SET workerId = ? WHERE workerId = ?`, args: [keepId, removeId] })
  await client.execute({ sql: `UPDATE "TimeEntry" SET workerId = ? WHERE workerId = ?`, args: [keepId, removeId] })
  await client.execute({ sql: `UPDATE "PaymentRecord" SET workerId = ? WHERE workerId = ?`, args: [keepId, removeId] })
  try { await client.execute({ sql: `UPDATE "StaffInvite" SET workerId = ? WHERE workerId = ?`, args: [keepId, removeId] }) } catch { /* raw column may not exist */ }

  // Fill keep's empty fields from remove; union roles; keep the stronger flags.
  const pick = (a: unknown, b: unknown) => (a !== null && a !== undefined && String(a).trim() !== '') ? a : ((b as string | null) ?? null)

  // Columns that are NOT NULL with a default read as "set" even when nobody chose them,
  // so a plain empty-check would keep the default and throw away the real answer the
  // other record has. certLevel/payMethod/gender all ship a default, and the imported
  // half of a pair is usually the one carrying the real cert while the fresh signup
  // carries the real pay details -- treat the untouched default as a gap to fill.
  const pickNonDefault = (a: unknown, b: unknown, dflt: string) => {
    const av = String(a ?? '').trim(), bv = String(b ?? '').trim()
    if (av && av !== dflt) return av
    if (bv && bv !== dflt) return bv
    return av || bv || dflt
  }
  let roles: string[] = []
  try {
    const ka = JSON.parse(String(keep.roles ?? '[]')), rb = JSON.parse(String(rem.roles ?? '[]'))
    roles = [...new Set([...(Array.isArray(ka) ? ka : []), ...(Array.isArray(rb) ? rb : [])])].map(String).filter(Boolean)
  } catch { /* fall back below */ }
  if (!roles.length) roles = [String(keep.defaultRole ?? 'ref')]

  await client.execute({
    sql: `UPDATE "Worker" SET email = ?, phone = ?, association = ?, payHandle = ?, payMethod = ?, certLevel = ?, gender = ?, notes = ?, photoUrl = ?, payRateOverride = ?, hourlyRate = ?, roles = ?, isAssigner = ?, updatedAt = datetime('now') WHERE id = ?`,
    args: [
      pick(keep.email, rem.email), pick(keep.phone, rem.phone), pick(keep.association, rem.association),
      pick(keep.payHandle, rem.payHandle),
      pickNonDefault(keep.payMethod, rem.payMethod, 'check'),
      pickNonDefault(keep.certLevel, rem.certLevel, 'youth'),
      pickNonDefault(keep.gender, rem.gender, 'both'),
      pick(keep.notes, rem.notes), pick(keep.photoUrl, rem.photoUrl),
      (keep.payRateOverride as number | null) ?? (rem.payRateOverride as number | null) ?? null,
      (keep.hourlyRate as number | null) ?? (rem.hourlyRate as number | null) ?? null,
      JSON.stringify(roles), (keep.isAssigner || rem.isAssigner) ? 1 : 0, keepId,
    ],
  })

  // THE PAY DETAILS. venmoHandle / zelleHandle / mailingAddress / w9OnFile are raw
  // columns added by guarded ALTER after this route was written (Sep 4-5 2026), and
  // nothing came back to include them -- so a merge quietly dropped exactly the fields
  // an organizer merges FOR. Someone who signs up fresh has the pay details and no
  // history; the imported record has the history and no pay details. Each column is
  // written on its own because any of them may not exist on an older database yet.
  const filled: string[] = []
  for (const col of ['venmoHandle', 'zelleHandle', 'mailingAddress', 'w9OnFile']) {
    const kv = (keep as Record<string, unknown>)[col]
    const rv = (rem as Record<string, unknown>)[col]
    const value = (kv !== null && kv !== undefined && String(kv).trim() !== '') ? kv : rv
    if (value === null || value === undefined || String(value).trim() === '') continue
    try {
      await client.execute({ sql: `UPDATE "Worker" SET "${col}" = ? WHERE id = ?`, args: [value as string, keepId] })
      filled.push(col)
    } catch { /* column not on this database yet */ }
  }

  await client.execute({ sql: `DELETE FROM "Worker" WHERE id = ?`, args: [removeId] })
  return NextResponse.json({ ok: true, keepId, filled })
}
