import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

// Admin-only: list/assign the users that belong to an organization, and designate
// the org's primary owner. orgId + ownerUserId live as raw columns (not in the
// Prisma schema), so we use the libsql client directly.

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}
async function requireAdmin() {
  const s = await getServerSession(authOptions)
  return (s?.user as any)?.role === 'admin'
}
async function ensureOwnerColumn(client: any) {
  try { await client.execute(`ALTER TABLE "Organization" ADD COLUMN "ownerUserId" TEXT`) } catch { /* exists */ }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const client = db()
    await ensureOwnerColumn(client)
    const users = await client.execute({ sql: `SELECT id, name, email, role FROM "User" WHERE orgId = ? ORDER BY name COLLATE NOCASE`, args: [params.id] })
    const org = await client.execute({ sql: `SELECT ownerUserId FROM "Organization" WHERE id = ? LIMIT 1`, args: [params.id] })
    return NextResponse.json({ users: users.rows, ownerUserId: org.rows[0]?.ownerUserId ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// Assign an existing user (by email) to this org; optionally set their role and/or
// make them the primary owner (owner is given the director role).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const client = db()
    await ensureOwnerColumn(client)
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const role = body.role ? String(body.role) : undefined
    const makeOwner = !!body.makeOwner
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    const u = await client.execute({ sql: `SELECT id FROM "User" WHERE lower(email) = ? LIMIT 1`, args: [email] })
    const userId = u.rows[0]?.id as string | undefined
    if (!userId) return NextResponse.json({ error: 'No account exists with that email yet. They need to sign up (or be invited) first.' }, { status: 404 })

    await client.execute({ sql: `UPDATE "User" SET orgId = ? WHERE id = ?`, args: [params.id, userId] })
    if (makeOwner) {
      await client.execute({ sql: `UPDATE "Organization" SET ownerUserId = ? WHERE id = ?`, args: [userId, params.id] })
      await client.execute({ sql: `UPDATE "User" SET role = 'director' WHERE id = ?`, args: [userId] })
    } else if (role) {
      await client.execute({ sql: `UPDATE "User" SET role = ? WHERE id = ?`, args: [role, userId] })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// Remove a user from this org (clears orgId; clears owner if they were it).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const client = db()
    await ensureOwnerColumn(client)
    const userId = req.nextUrl.searchParams.get('userId')
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
    await client.execute({ sql: `UPDATE "User" SET orgId = NULL WHERE id = ? AND orgId = ?`, args: [userId, params.id] })
    await client.execute({ sql: `UPDATE "Organization" SET ownerUserId = NULL WHERE id = ? AND ownerUserId = ?`, args: [params.id, userId] })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
