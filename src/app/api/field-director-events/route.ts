import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireDirector } from '@/lib/apiAuth'
import { fieldDirectorEventsMany, saveFieldDirectorEvents } from '@/lib/fieldDirector'

// Which events each field director works (lib/fieldDirector). The admin sets it for
// anyone on Logins; a director for the field directors in their own organization on
// Your team. User.orgId and Tournament.orgId are raw columns, so they are read with SQL.
//
// GET -> { fieldDirectors: { [userId]: { orgId, events } }, events: [{ id, name, startDate, endDate, orgId }] }
//        events = the organization's current and upcoming events (ended within the
//        last 30 days or later), plus any already picked.
// PUT { userId, events } -> { ok, events }

type Row = Record<string, unknown>

async function orgOf(userId: string): Promise<string | null> {
  try {
    const r = await prisma.$queryRawUnsafe<{ orgId: string | null }[]>('SELECT orgId FROM "User" WHERE id = ?', userId)
    return r?.[0]?.orgId ? String(r[0].orgId) : null
  } catch { return null }
}

export async function GET() {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const admin = gate.role === 'admin'
  if (!admin && !gate.orgId) return NextResponse.json({ fieldDirectors: {}, events: [] })
  const users = await prisma.$queryRawUnsafe<Row[]>(
    admin ? `SELECT id, orgId FROM "User" WHERE role = 'field_director'` : `SELECT id, orgId FROM "User" WHERE role = 'field_director' AND orgId = ?`,
    ...(admin ? [] : [gate.orgId])).catch(() => [] as Row[])
  const picked = await fieldDirectorEventsMany(users.map(u => String(u.id)))
  const fieldDirectors: Record<string, { orgId: string | null; events: string[] }> = {}
  for (const u of users) fieldDirectors[String(u.id)] = { orgId: u.orgId ? String(u.orgId) : null, events: picked[String(u.id)] || [] }
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const want = new Set(Object.values(picked).flat())
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    admin ? `SELECT id, name, startDate, endDate, orgId FROM "Tournament"` : `SELECT id, name, startDate, endDate, orgId FROM "Tournament" WHERE orgId = ?`,
    ...(admin ? [] : [gate.orgId])).catch(() => [] as Row[])
  const events = rows
    .filter(t => want.has(String(t.id)) || !String(t.startDate || '') || String(t.endDate || t.startDate || '') >= cutoff)
    .map(t => ({ id: String(t.id), name: String(t.name || ''), startDate: String(t.startDate || ''), endDate: String(t.endDate || ''), orgId: t.orgId ? String(t.orgId) : null }))
    .sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'))
  return NextResponse.json({ fieldDirectors, events })
}

export async function PUT(req: Request) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const userId = String(b.userId || '')
  if (!userId || !Array.isArray(b.events)) return NextResponse.json({ error: 'userId and events are required' }, { status: 400 })
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
  if (!target) return NextResponse.json({ error: 'No such user' }, { status: 404 })
  if (target.role !== 'field_director') return NextResponse.json({ error: 'Make them a Field Director first.' }, { status: 400 })
  const userOrg = await orgOf(userId)
  if (gate.role !== 'admin' && (!gate.orgId || userOrg !== gate.orgId)) {
    return NextResponse.json({ error: 'You can set this only for people in your organization.' }, { status: 403 })
  }
  // Only events of the field director's own organization (any event when they have none yet).
  const ids = Array.from(new Set((b.events as unknown[]).map(String).filter(Boolean))).slice(0, 200)
  let ok: string[] = []
  if (ids.length) {
    const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT id, orgId FROM "Tournament" WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids)
    ok = rows.filter(t => !userOrg || String(t.orgId || '') === userOrg).map(t => String(t.id))
  }
  const by = String(gate.session?.user?.name || gate.session?.user?.email || '')
  const events = await saveFieldDirectorEvents(userId, ok, by)
  return NextResponse.json({ ok: true, events })
}
