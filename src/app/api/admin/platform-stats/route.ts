import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const client = db()

  const [orgsRes, tournamentsRes, workersRes, usersRes, recentTournamentsRes] = await Promise.all([
    client.execute(`
      SELECT
        o.id, o.name, o.slug, o.logoUrl, o.subscriptionTier, o.subscriptionStatus, o.createdAt,
        COUNT(DISTINCT t.id) as tournamentCount,
        COUNT(DISTINCT w.id) as workerCount,
        COUNT(DISTINCT u.id) as userCount
      FROM "Organization" o
      LEFT JOIN "Tournament" t ON t.orgId = o.id
      LEFT JOIN "Worker" w ON w.orgId = o.id
      LEFT JOIN "User" u ON u.orgId = o.id
      GROUP BY o.id
      ORDER BY o.createdAt DESC
    `),
    client.execute(`SELECT COUNT(*) as total FROM "Tournament"`),
    client.execute(`SELECT COUNT(*) as total FROM "Worker"`),
    client.execute(`SELECT COUNT(*) as total FROM "User"`),
    client.execute(`
      SELECT t.id, t.name, t.sport, t.startDate, t.orgId, o.name as orgName, o.logoUrl as orgLogoUrl
      FROM "Tournament" t
      LEFT JOIN "Organization" o ON o.id = t.orgId
      ORDER BY t.createdAt DESC LIMIT 8
    `),
  ])

  return NextResponse.json({
    orgCount: orgsRes.rows.length,
    tournamentTotal: Number(tournamentsRes.rows[0]?.total ?? 0),
    workerTotal: Number(workersRes.rows[0]?.total ?? 0),
    userTotal: Number(usersRes.rows[0]?.total ?? 0),
    orgs: orgsRes.rows,
    recentTournaments: recentTournamentsRes.rows,
  })
}
