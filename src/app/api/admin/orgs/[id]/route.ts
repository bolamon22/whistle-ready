import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

function adminOnly(session: any) {
  return (session?.user as any)?.role === 'admin'
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!adminOnly(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const res = await db().execute({ sql: 'SELECT * FROM "Organization" WHERE id = ?', args: [params.id] })
  if (!res.rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(res.rows[0])
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!adminOnly(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const fields = [
    'name', 'slug', 'logoUrl', 'contactEmail', 'contactPhone', 'website',
    'achBankName', 'achRoutingNumber', 'achAccountNumber',
    'paypalEmail', 'zelleHandle', 'checkPayableTo', 'checkAddress',
    'subscriptionTier', 'subscriptionStatus',
  ]
  const updates = fields.filter(f => body[f] !== undefined)
  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const setClause = updates.map(f => `"${f}" = ?`).join(', ')
  const args = [...updates.map(f => body[f]), params.id]

  try {
    await db().execute({
      sql: `UPDATE "Organization" SET ${setClause}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
      args,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (String(err).includes('UNIQUE')) return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
