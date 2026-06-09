import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

async function resolveOrgId(req: Request): Promise<{ orgId: string | null; isAdmin: boolean }> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const sessionOrgId = (session?.user as any)?.orgId ?? null

  if (role === 'admin') {
    const url = new URL(req.url)
    const viewOrgId = url.searchParams.get('viewOrgId')
    return { orgId: viewOrgId ?? null, isAdmin: true }
  }

  return { orgId: sessionOrgId, isAdmin: false }
}

export async function GET(req: Request) {
  const { orgId, isAdmin } = await resolveOrgId(req)
  const client = db()

  if (isAdmin && !orgId) {
    // Platform view — all workers
    const res = await client.execute(`SELECT * FROM "Worker" ORDER BY name ASC`)
    return NextResponse.json(res.rows)
  }

  if (orgId) {
    try {
      const res = await client.execute({
        sql: `SELECT * FROM "Worker" WHERE orgId = ? ORDER BY name ASC`,
        args: [orgId],
      })
      return NextResponse.json(res.rows)
    } catch {
      // orgId column not yet migrated — return empty until migration is run
      return NextResponse.json([])
    }
  }

  return NextResponse.json([])
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const sessionOrgId = (session?.user as any)?.orgId ?? null

  const body = await req.json()
  // Admin can specify any orgId; org users use their session org; public join passes orgId in body
  const orgId = role === 'admin' ? (body.orgId ?? null) : (sessionOrgId ?? body.orgId ?? null)

  const client = db()

  if (Array.isArray(body.bulk)) {
    let count = 0
    for (const s of body.bulk) {
      const id = crypto.randomUUID()
      await client.execute({
        sql: `INSERT INTO "Worker" (id, name, email, phone, certLevel, defaultRole, roles, isAssigner, gender, payRateOverride, hourlyRate, payMethod, payHandle, orgId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [id, String(s.name), s.email ?? null, s.phone ?? null, String(s.certLevel ?? 'youth'), String(s.defaultRole ?? 'ref'), JSON.stringify(s.roles ?? [s.defaultRole ?? 'ref']), s.isAssigner ? 1 : 0, String(s.gender ?? 'both'), s.payRateOverride != null ? Number(s.payRateOverride) : null, s.hourlyRate != null ? Number(s.hourlyRate) : null, String(s.payMethod ?? 'check'), s.payHandle ?? null, orgId],
      })
      count++
    }
    return NextResponse.json({ created: count }, { status: 201 })
  }

  const { name, email, phone, certLevel, defaultRole, roles, isAssigner, gender, payRateOverride, hourlyRate, payMethod, payHandle, notes } = body
  const id = crypto.randomUUID()

  await client.execute({
    sql: `INSERT INTO "Worker" (id, name, email, phone, certLevel, defaultRole, roles, isAssigner, gender, payRateOverride, hourlyRate, payMethod, payHandle, notes, orgId, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [id, name, email ?? null, phone ?? null, certLevel ?? 'youth', defaultRole ?? 'ref', JSON.stringify(roles ?? [defaultRole ?? 'ref']), isAssigner ? 1 : 0, gender ?? 'both', payRateOverride ?? null, hourlyRate ?? null, payMethod ?? 'check', payHandle ?? null, notes ?? null, orgId],
  })

  const created = await client.execute({ sql: `SELECT * FROM "Worker" WHERE id = ?`, args: [id] })
  return NextResponse.json(created.rows[0], { status: 201 })
}
