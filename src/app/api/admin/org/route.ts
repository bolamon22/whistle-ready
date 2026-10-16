import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'
import { readOrgPlan } from '@/lib/orgPlanStore'

function getClient() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// GET also answers the organization's plan key (`plan`, lib/orgPlans), so the app can
// call its director by the plan's name for them (Head Assigner on the Assigner plan).
const withPlan = async (row: Record<string, unknown> | undefined) => row ? { ...row, plan: (await readOrgPlan(String(row.id))).plan } : null

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role
  const client = getClient()
  try {
    // Admin can pass ?view=orgId to get a specific org (for preview mode)
    if (role === 'admin') {
      const url = new URL(req.url)
      const viewId = url.searchParams.get('view')
      if (viewId) {
        const res = await client.execute({ sql: `SELECT * FROM "Organization" WHERE id = ? LIMIT 1`, args: [viewId] })
        return NextResponse.json(await withPlan(res.rows[0]))
      }
      return NextResponse.json(null) // admin with no preview = platform view, no org brand
    }
    // Regular user: the organization they're working in (the session's: with more than
    // one, the one picked in the switcher, lib/orgMembers), and only what the app shows
    // them (the brand, and the payment instructions on the registration form), not the
    // whole row.
    const orgId = (session.user as any).orgId as string | null
    if (!orgId) return NextResponse.json(null)
    const res = await client.execute({
      sql: `SELECT id, name, slug, logoUrl, contactEmail, contactPhone, website, zelleHandle, paypalEmail, checkPayableTo, checkAddress FROM "Organization" WHERE id = ? LIMIT 1`,
      args: [orgId],
    })
    return NextResponse.json(await withPlan(res.rows[0]))
  } catch { return NextResponse.json(null) }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const userId = (session.user as any).id
  const body = await req.json()
  const client = getClient()

  const fields = ['name','logoUrl','contactEmail','contactPhone','website',
    'achBankName','achRoutingNumber','achAccountNumber',
    'paypalEmail','zelleHandle','checkPayableTo','checkAddress','subscriptionTier']

  const updates = fields.filter(f => body[f] !== undefined)
  if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const setClause = updates.map(f => `"${f}" = ?`).join(', ')
  const args = [...updates.map(f => body[f]), userId]

  await client.execute({
    sql: `UPDATE "Organization" SET ${setClause}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = (SELECT "orgId" FROM "User" WHERE id = ? LIMIT 1)`,
    args,
  })
  return NextResponse.json({ ok: true })
}
