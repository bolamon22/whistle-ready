import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'
import { ensureArchiveCols } from '@/lib/orgArchive'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const client = db()
  await ensureArchiveCols()   // archivedAt: lib/orgArchive

  try {
    // Simple separate queries — avoids complex JOIN/GROUP BY issues in libSQL
    const [orgsRes, tournamentsRes, workersRes, usersRes, recentRes] = await Promise.all([
      client.execute(`SELECT id, name, slug, logoUrl, subscriptionTier, subscriptionStatus, createdAt, archivedAt FROM "Organization" ORDER BY createdAt DESC`),
      client.execute(`SELECT COUNT(*) as total FROM "Tournament"`),
      client.execute(`SELECT COUNT(*) as total FROM "Worker"`),
      client.execute(`SELECT COUNT(*) as total FROM "User"`),
      client.execute(`SELECT t.id, t.name, t.sport, t.startDate, t.orgId FROM "Tournament" t ORDER BY t.createdAt DESC LIMIT 8`),
    ])

    const orgs = orgsRes.rows

    // Per-org counts — Worker.orgId may not exist yet if migration hasn't run
    const orgStats = await Promise.all(
      orgs.map(async (org) => {
        const id = org.id as string
        const [tc, uc] = await Promise.all([
          client.execute({ sql: `SELECT COUNT(*) as c FROM "Tournament" WHERE orgId = ?`, args: [id] }),
          client.execute({ sql: `SELECT COUNT(*) as c FROM "User" WHERE orgId = ?`, args: [id] }),
        ])
        let workerCount = 0
        try {
          const wc = await client.execute({ sql: `SELECT COUNT(*) as c FROM "Worker" WHERE orgId = ?`, args: [id] })
          workerCount = Number(wc.rows[0]?.c ?? 0)
        } catch { /* orgId column not yet migrated */ }
        return {
          ...org,
          tournamentCount: Number(tc.rows[0]?.c ?? 0),
          workerCount,
          userCount: Number(uc.rows[0]?.c ?? 0),
        }
      })
    )

    // Build org lookup for recent tournaments
    const orgMap: Record<string, { name: string; logoUrl: string | null }> = {}
    for (const o of orgs) {
      orgMap[o.id as string] = { name: o.name as string, logoUrl: (o.logoUrl as string) ?? null }
    }

    const recentTournaments = recentRes.rows.map(t => ({
      ...t,
      orgName: t.orgId ? (orgMap[t.orgId as string]?.name ?? null) : null,
      orgLogoUrl: t.orgId ? (orgMap[t.orgId as string]?.logoUrl ?? null) : null,
    }))

    return NextResponse.json({
      orgCount: orgs.filter(o => !o.archivedAt).length,   // archived ones aren't customers now
      tournamentTotal: Number(tournamentsRes.rows[0]?.total ?? 0),
      workerTotal: Number(workersRes.rows[0]?.total ?? 0),
      userTotal: Number(usersRes.rows[0]?.total ?? 0),
      orgs: orgStats,
      recentTournaments,
    })
  } catch (e: any) {
    console.error('platform-stats error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
