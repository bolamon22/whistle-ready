import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'
import { createClient } from '@libsql/client'
import { assignEventSlug, slugOf } from '@/lib/eventSlug'

function getClient() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { name, startDate, endDate, dates } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name required' }, { status: 400 })

  // Resolve orgId: prefer source tournament's orgId, fall back to preview-org cookie
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const sessionOrgId = (session?.user as any)?.orgId ?? null

  const src = await prisma.tournament.findUnique({ where: { id: params.id } })
  if (!src) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Load source venues (raw column)
  const client = getClient()
  let venuesJson = '{}'
  try {
    const r = await client.execute({ sql: 'SELECT venues FROM "Tournament" WHERE id = ?', args: [params.id] })
    venuesJson = (r.rows[0]?.venues as string) || '{}'
  } catch { /* venues column may not exist yet */ }

  // Create new tournament — copy all settings, fresh schedule data
  const newT = await prisma.tournament.create({
    data: {
      name: name.trim(),
      sport: src.sport,
      location: src.location,
      logoUrl: src.logoUrl,
      scheduleIncrement: src.scheduleIncrement,
      payRates: src.payRates,
      registrationPricing: src.registrationPricing,
      registrationDivisions: src.registrationDivisions,
      divisionRules: src.divisionRules,
      teamRegEnabled: src.teamRegEnabled,
      individualRegEnabled: src.individualRegEnabled,
      individualRegDescription: src.individualRegDescription,
      individualRegTiers: src.individualRegTiers,
      individualRegPositions: src.individualRegPositions,
      individualRegSizes: src.individualRegSizes,
      startDate: startDate ?? '',
      endDate: endDate ?? '',
      dates: dates ? JSON.stringify(dates) : '[]',
    }
  })

  // The copy's slug: same base, this event's year. Duplicating Monster Mash 2026
  // into 2027 turns monstermash26 into monstermash27 with nothing typed.
  await assignEventSlug(newT.id, { name: newT.name, startDate: newT.startDate, from: await slugOf(params.id) })

  // Stamp orgId — inherit from source, or from admin preview cookie
  const client2 = getClient()
  let targetOrgId: string | null = null
  try {
    const r = await client2.execute({ sql: 'SELECT orgId FROM "Tournament" WHERE id = ?', args: [params.id] })
    targetOrgId = (r.rows[0]?.orgId as string) ?? null
  } catch { /* column may not exist */ }
  if (!targetOrgId && role === 'admin' && !sessionOrgId) {
    const cookieHeader = req.headers.get('cookie') ?? ''
    const m = cookieHeader.match(/(?:^|; )preview-org=([^;]*)/)
    if (m) targetOrgId = decodeURIComponent(m[1])
  }
  if (!targetOrgId) targetOrgId = sessionOrgId
  if (targetOrgId) {
    try {
      await client2.execute({ sql: 'UPDATE "Tournament" SET orgId = ? WHERE id = ?', args: [targetOrgId, newT.id] })
    } catch { /* non-fatal */ }
  }

  // Copy venues to new tournament
  try {
    await client.execute(`ALTER TABLE "Tournament" ADD COLUMN "venues" TEXT NOT NULL DEFAULT '[]'`)
  } catch { /* already exists */ }
  await client.execute({
    sql: 'UPDATE "Tournament" SET venues = ? WHERE id = ?',
    args: [venuesJson, newT.id],
  })

  // Copy staff roster entries
  const rosterEntries = await prisma.rosterEntry.findMany({ where: { tournamentId: params.id } })
  if (rosterEntries.length > 0) {
    await prisma.rosterEntry.createMany({
      data: rosterEntries.map(r => ({
        workerId: r.workerId,
        tournamentId: newT.id,
        gameTarget: r.gameTarget,
        notes: r.notes ?? undefined,
      })),
      skipDuplicates: true,
    })
  }

  return NextResponse.json({ id: newT.id, name: newT.name })
}
