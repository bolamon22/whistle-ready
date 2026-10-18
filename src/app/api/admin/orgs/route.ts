import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'
import { addToOrg } from '@/lib/orgMembers'
import { orgPlans, writeOrgPlan } from '@/lib/orgPlanStore'
import { isPlanKey, planDefaults, planSummary } from '@/lib/orgPlans'
import { ensureArchiveCols } from '@/lib/orgArchive'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const client = db()
  await ensureArchiveCols()   // archivedAt: lib/orgArchive
  const res = await client.execute(
    'SELECT id, name, slug, contactEmail, subscriptionTier, subscriptionStatus, createdAt, archivedAt FROM "Organization" ORDER BY createdAt DESC'
  )
  // Each organization's plan (lib/orgPlans), for the list.
  const plans = await orgPlans(res.rows.map(r => String(r.id)))
  return NextResponse.json(res.rows.map(r => ({ ...r, plan: plans[String(r.id)]?.plan ?? 'tournament', planLabel: planSummary(plans[String(r.id)] ?? planDefaults('tournament')) })))
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { name, slug, contactEmail, tier, ownerEmail, plan } = await req.json()
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
    if (isPlanKey(plan)) await writeOrgPlan(id, planDefaults(plan), String(session?.user?.email || ''))
    // The owner runs the new organization as its director. This used to move their
    // login into it (UPDATE "User" SET orgId), taking them out of their own
    // organization; now they keep it and the new one is added (lib/orgMembers). An
    // admin login is never changed.
    let owner: string | undefined
    if (ownerEmail) {
      const u = await client.execute({ sql: 'SELECT id FROM "User" WHERE lower(email) = ? LIMIT 1', args: [String(ownerEmail).trim().toLowerCase()] })
      const userId = u.rows[0]?.id ? String(u.rows[0].id) : ''
      if (!userId) owner = 'No login has that email yet. Add the owner on the organization page once they have one.'
      else {
        const r = await addToOrg(userId, id, 'director', String(session?.user?.email || ''))
        if (r.ok) {
          try { await client.execute(`ALTER TABLE "Organization" ADD COLUMN "ownerUserId" TEXT`) } catch { /* exists */ }
          await client.execute({ sql: 'UPDATE "Organization" SET ownerUserId = ? WHERE id = ?', args: [userId, id] })
        } else owner = r.error
      }
    }
    return NextResponse.json({ id, name, slug, ...(owner ? { ownerWarning: owner } : {}) }, { status: 201 })
  } catch (err: any) {
    if (String(err).includes('UNIQUE')) {
      return NextResponse.json({ error: 'Slug already taken' }, { status: 409 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}