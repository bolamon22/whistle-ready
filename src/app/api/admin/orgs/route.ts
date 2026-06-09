import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const client = db()
  const res = await client.execute(
    'SELECT id, name, slug, contactEmail, subscriptionTier, subscriptionStatus, createdAt FROM "Organization" ORDER BY createdAt DESC'
  )
  return NextResponse.json(res.rows)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { name, slug, contactEmail, tier, ownerEmail } = await req.json()
  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug are required' }, { status: 400 })
  }
  const client = db()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  try {
    await client.execute({
      sql: 'INSERT INTO "Organization" (id, name, slug, contactEmail, subscriptionTier, subscriptionStatus, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [id, name, slug, contactEmail ?? null, tier ?? 'starter', 'active', now, now],
    })
    if (ownerEmail) {
      await client.execute({
        sql: 'UPDATE "User" SET orgId = ? WHERE email = ?',
        args: [id, ownerEmail.toLowerCase()],
      })
    }
    return NextResponse.json({ id, name, slug }, { status: 201 })
  } catch (err: any) {
    if (String(err).includes('UNIQUE')) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}