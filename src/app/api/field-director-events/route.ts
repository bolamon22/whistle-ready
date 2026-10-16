import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireDirector } from '@/lib/apiAuth'
import { fieldDirectorEvents, fieldDirectorEventsMany, saveFieldDirectorEvents } from '@/lib/fieldDirector'
import { membershipsOf, orgPeople } from '@/lib/orgMembers'

// Which events each field director works (lib/fieldDirector). The admin sets it for
// anyone on Logins; a director for the field directors in their own organization on
// Your team. User.orgId and Tournament.orgId are raw columns, so they are read with SQL.
// A login can be a field director in more than one organization (lib/orgMembers): one
// list holds all their events, and a director here sees and changes only the ones in
// this organization; the rest stay as they are.
//
// GET -> { fieldDirectors: { [userId]: { orgId, events } }, events: [{ id, name, startDate, endDate, orgId }] }
//        events = the organization's current and upcoming events (ended within the
//        last 30 days or later), plus any already picked.
// PUT { userId, events } -> { ok, events }

type Row = Record<string, unknown>

export async function GET() {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const admin = gate.role === 'admin'
  if (!admin && !gate.orgId) return NextResponse.json({ fieldDirectors: {}, events: [] })
  const users: Row[] = admin
    ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, orgId FROM "User" WHERE role = 'field_director'`).catch(() => [] as Row[])
    : (await orgPeople(String(gate.orgId)).catch(() => [])).filter(p => p.role === 'field_director').map(p => ({ id: p.id, orgId: gate.orgId }))
  const picked = await fieldDirectorEventsMany(users.map(u => String(u.id)))
  const fieldDirectors: Record<string, { orgId: string | null; events: string[] }> = {}
  for (const u of users) fieldDirectors[String(u.id)] = { orgId: u.orgId ? String(u.orgId) : null, events: picked[String(u.id)] || [] }
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const want = new Set(Object.values(picked).flat())
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    admin ? `SELECT id, name, startDate, endDate, orgId FROM "Tournament"` : `SELECT id, name, startDate, endDate, orgId FROM "Tournament" WHERE orgId = ?`,
    ...(admin ? [] : [gate.orgId])).catch(() => [] as Row[])
  if (!admin) {
    // Only this organization's events: what they work elsewhere is not this director's.
    const here = new Set(rows.map(t => String(t.id)))
    for (const id of Object.keys(fieldDirectors)) fieldDirectors[id].events = fieldDirectors[id].events.filter(e => here.has(e))
  }
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
  // The organizations where they are a field director (none: not one yet).
  const fdOrgs = (await membershipsOf(userId)).filter(m => m.role === 'field_director').map(m => m.orgId)
  if (!fdOrgs.length) return NextResponse.json({ error: 'Make them a Field Director first.' }, { status: 400 })
  const admin = gate.role === 'admin'
  if (!admin && (!gate.orgId || !fdOrgs.includes(gate.orgId))) {
    return NextResponse.json({ error: 'You can set this only for people in your organization.' }, { status: 403 })
  }
  // Events of the organization(s) this caller decides for: an admin, every one where
  // they're a field director (any event when they have no organization at all); a
  // director, their own.
  const scope = admin ? fdOrgs : [gate.orgId as string]
  const inScope = (t: Row) => scope.includes(null) || scope.includes(String(t.orgId || ''))
  const orgsOf = async (list: string[]) => list.length
    ? prisma.$queryRawUnsafe<Row[]>(`SELECT id, orgId FROM "Tournament" WHERE id IN (${list.map(() => '?').join(', ')})`, ...list)
    : [] as Row[]
  const ids = Array.from(new Set((b.events as unknown[]).map(String).filter(Boolean))).slice(0, 200)
  const ok = (await orgsOf(ids)).filter(inScope).map(t => String(t.id))
  // What they work in other organizations stays (a director can't see those).
  const keep = admin ? [] : (await orgsOf(await fieldDirectorEvents(userId))).filter(t => !inScope(t)).map(t => String(t.id))
  const by = String(gate.session?.user?.name || gate.session?.user?.email || '')
  await saveFieldDirectorEvents(userId, [...keep, ...ok], by)
  return NextResponse.json({ ok: true, events: ok })
}
