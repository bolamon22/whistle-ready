import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { createClient } from '@libsql/client'
import { authOptions } from '@/lib/auth'
import { giveStaffAccess } from '@/lib/staffLogin'

// Put a login in the Staff Pool from Logins (admin only). Logins and Staff Pool
// records are matched by email, and changing someone's role to Staff never made the
// record, so they stayed off every staff list (Steve Newell, Oct 14 2026). Two ways:
//   link   an existing record gets this login's email (they're already in the pool
//          under another address, or none)
//   create a new record with this login's name and email, for one job
// Either way the login is raised to Staff when its role can't open staff pages, and
// takes the record's organization when it has none (lib/staffLogin).

const JOBS = new Set(['ref', 'scorekeeper', 'athletic_trainer', 'field_ops'])
const GENDERS = new Set(['boys', 'girls', 'both'])

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

async function admin() {
  const session = await getServerSession(authOptions)
  return !!session && session.user.role === 'admin'
}

const low = (v: unknown) => String(v ?? '').trim().toLowerCase()

function jobsOf(w: Record<string, unknown>): string[] {
  try { const r = JSON.parse(String(w.roles ?? '[]')); if (Array.isArray(r) && r.length) return r.map(String) } catch { /* bad JSON */ }
  return w.defaultRole ? [String(w.defaultRole)] : []
}

async function loginRow(client: ReturnType<typeof db>, userId: string) {
  let r
  try { r = await client.execute({ sql: `SELECT id, name, email, role, orgId FROM "User" WHERE id = ?`, args: [userId] }) }
  catch { r = await client.execute({ sql: `SELECT id, name, email, role, NULL AS orgId FROM "User" WHERE id = ?`, args: [userId] }) }
  const u = r.rows[0] as Record<string, unknown> | undefined
  return u ? { id: String(u.id), name: String(u.name ?? ''), email: low(u.email), role: String(u.role ?? ''), orgId: u.orgId ? String(u.orgId) : null } : null
}

// GET ?userId= : the login, the record it already matches (if any), every Staff
// Pool record to search, and the organizations a new record can go in.
export async function GET(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = req.nextUrl.searchParams.get('userId') || ''
  const client = db()
  const login = await loginRow(client, userId)
  if (!login) return NextResponse.json({ error: 'Login not found' }, { status: 404 })

  const [ws, orgs, users, rosters] = await Promise.all([
    client.execute(`SELECT id, name, email, roles, defaultRole, gender, orgId, createdAt FROM "Worker" ORDER BY createdAt ASC`),
    client.execute(`SELECT id, name FROM "Organization" ORDER BY name`).catch(() => ({ rows: [] as unknown[] })),
    client.execute(`SELECT lower(email) AS email, name, role FROM "User" WHERE email IS NOT NULL AND email != ''`),
    client.execute(`SELECT workerId, COUNT(*) AS n FROM "RosterEntry" GROUP BY workerId`).catch(() => ({ rows: [] as unknown[] })),
  ])
  const loginByEmail = new Map((users.rows as Record<string, unknown>[]).map(u => [String(u.email), { name: String(u.name ?? ''), role: String(u.role ?? '') }]))
  const events = new Map((rosters.rows as Record<string, unknown>[]).map(r => [String(r.workerId), Number(r.n) || 0]))
  const perOrg = new Map<string, number>()
  const workers = (ws.rows as Record<string, unknown>[]).map(w => {
    const email = low(w.email)
    const orgId = w.orgId ? String(w.orgId) : null
    if (orgId) perOrg.set(orgId, (perOrg.get(orgId) ?? 0) + 1)
    const other = email && email !== login.email ? loginByEmail.get(email) ?? null : null
    return {
      id: String(w.id), name: String(w.name ?? ''), email, jobs: jobsOf(w), gender: String(w.gender || 'both'),
      orgId, events: events.get(String(w.id)) ?? 0,
      login: other,   // another login already signs in with this record's email
    }
  })
  const linked = workers.find(w => w.email && w.email === login.email) ?? null
  const orgList = (orgs.rows as Record<string, unknown>[]).map(o => ({ id: String(o.id), name: String(o.name ?? ''), staff: perOrg.get(String(o.id)) ?? 0 }))
  const busiest = [...orgList].sort((a, b) => b.staff - a.staff)[0]
  const defaultOrgId = (login.orgId && orgList.some(o => o.id === login.orgId) ? login.orgId : null) ?? busiest?.id ?? null
  return NextResponse.json({ login, linked, workers: workers.sort((a, b) => a.name.localeCompare(b.name)), orgs: orgList, defaultOrgId })
}

// POST { userId, action: 'link', workerId } or { userId, action: 'create', job, gender, orgId }
export async function POST(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const client = db()
  const login = await loginRow(client, String(body.userId ?? ''))
  if (!login) return NextResponse.json({ error: 'Login not found' }, { status: 404 })
  if (!login.email) return NextResponse.json({ error: 'This login has no email to match a Staff Pool record.' }, { status: 400 })

  const mine = await client.execute({ sql: `SELECT id, name FROM "Worker" WHERE lower(email) = ? ORDER BY createdAt ASC LIMIT 1`, args: [login.email] })
  const already = mine.rows[0] as Record<string, unknown> | undefined

  if (body.action === 'link') {
    const workerId = String(body.workerId ?? '')
    const wr = await client.execute({ sql: `SELECT id, name, email, orgId FROM "Worker" WHERE id = ?`, args: [workerId] })
    const w = wr.rows[0] as Record<string, unknown> | undefined
    if (!w) return NextResponse.json({ error: 'That Staff Pool record is gone. Refresh and try again.' }, { status: 404 })
    if (already && String(already.id) !== workerId) {
      return NextResponse.json({ error: `${String(already.name)}'s Staff Pool record already has this email. Merge the two in the Staff Pool instead.` }, { status: 409 })
    }
    if (low(w.email) !== login.email) {
      await client.execute({ sql: `UPDATE "Worker" SET email = ?, updatedAt = datetime('now') WHERE id = ?`, args: [login.email, workerId] })
    }
    const access = await giveStaffAccess(login.email, w.orgId ? String(w.orgId) : null)
    return NextResponse.json({ ok: true, workerId, name: String(w.name ?? ''), role: access?.to ?? login.role })
  }

  if (body.action === 'create') {
    if (already) return NextResponse.json({ error: `Already in the Staff Pool as ${String(already.name)}.` }, { status: 409 })
    const job = String(body.job ?? '')
    if (!JOBS.has(job)) return NextResponse.json({ error: 'Pick a job.' }, { status: 400 })
    const gender = job === 'ref' && GENDERS.has(String(body.gender)) ? String(body.gender) : 'both'
    let orgId: string | null = body.orgId ? String(body.orgId) : null
    if (orgId) {
      const o = await client.execute({ sql: `SELECT id FROM "Organization" WHERE id = ?`, args: [orgId] }).catch(() => ({ rows: [] as unknown[] }))
      if (!o.rows.length) orgId = null
    }
    const workerId = crypto.randomUUID()
    await client.execute({
      sql: `INSERT INTO "Worker" (id, name, email, certLevel, defaultRole, roles, isAssigner, gender, payMethod, orgId, createdAt, updatedAt)
            VALUES (?, ?, ?, 'youth', ?, ?, 0, ?, 'check', ?, datetime('now'), datetime('now'))`,
      args: [workerId, login.name || login.email, login.email, job, JSON.stringify([job]), gender, orgId],
    })
    const access = await giveStaffAccess(login.email, orgId)
    return NextResponse.json({ ok: true, workerId, name: login.name, role: access?.to ?? login.role }, { status: 201 })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
