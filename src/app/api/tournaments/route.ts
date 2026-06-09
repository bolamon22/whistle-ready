import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@libsql/client'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

const INCLUDE = {
  _count: { select: { games: true, teamRegistrations: true, playerRegistrations: true } },
  teamRegistrations: { select: { numTeams: true } },
}

function shape(t: any) {
  return {
    ...t,
    _count: { ...t._count, registeredTeams: t.teamRegistrations.reduce((s: number, r: any) => s + r.numTeams, 0) },
    teamRegistrations: undefined,
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const orgId = (session?.user as any)?.orgId

  // Platform admin sees all tournaments
  if (role === 'admin') {
    const all = await prisma.tournament.findMany({ orderBy: { startDate: 'desc' }, include: INCLUDE })
    return NextResponse.json(all.map(shape))
  }

  // Org user: scope to their org
  if (orgId) {
    const client = db()
    const res = await client.execute({ sql: 'SELECT id FROM "Tournament" WHERE orgId = ?', args: [orgId] })
    const ids = res.rows.map((r: any) => r.id as string)
    if (ids.length === 0) return NextResponse.json([])
    const tournaments = await prisma.tournament.findMany({
      where: { id: { in: ids } },
      orderBy: { startDate: 'desc' },
      include: INCLUDE,
    })
    return NextResponse.json(tournaments.map(shape))
  }

  // No session / no orgId — return all (temporary until all users are org-assigned)
  const all = await prisma.tournament.findMany({ orderBy: { startDate: 'desc' }, include: INCLUDE })
  return NextResponse.json(all.map(shape))
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const orgId = (session?.user as any)?.orgId
  const { name, sport, startDate, endDate, location, scheduleIncrement, registrationDivisions } = await req.json()
  const tournament = await prisma.tournament.create({
    data: {
      name,
      sport: sport ?? '',
      startDate: startDate ?? '',
      endDate: endDate ?? '',
      location: location ?? '',
      scheduleIncrement: scheduleIncrement ?? 50,
      ...(registrationDivisions ? { registrationDivisions } : {}),
    },
  })
  // Set orgId via raw SQL (column exists but not in Prisma schema)
  if (orgId) {
    try {
      await db().execute({ sql: 'UPDATE "Tournament" SET orgId = ? WHERE id = ?', args: [orgId, tournament.id] })
    } catch { /* non-fatal */ }
  }
  return NextResponse.json(tournament, { status: 201 })
}