import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireDirector } from '@/lib/apiAuth'
import { clientEvents, clientEventsMany, saveClientEvents } from '@/lib/clientEvents'
import { membershipsOf, orgPeople } from '@/lib/orgMembers'

// Which events each tournament director sees (lib/clientEvents), the same way
// /api/field-director-events works for field directors: the admin sets it for anyone,
// the head assigner for the tournament directors in their own organization on Your
// team. A login can be a tournament director for more than one head assigner: one
// list holds all their events, and each head assigner sees and changes only theirs.
//
// GET -> { clients: { [userId]: { orgId, events } }, events: [{ id, name, startDate, endDate, orgId }] }
//        events = the organization's current and upcoming events (ended within the
//        last 30 days or later), plus any already picked.
// PUT { userId, events } -> { ok, events }

type Row = Record<string, unknown>

export async function GET() {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const admin = gate.role === 'admin'
  if (!admin && !gate.orgId) return NextResponse.json({ clients: {}, events: [] })
  const users: Row[] = admin
    ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, orgId FROM "User" WHERE role = 'client'`).catch(() => [] as Row[])
    : (await orgPeople(String(gate.orgId)).catch(() => [])).filter(p => p.role === 'client').map(p => ({ id: p.id, orgId: gate.orgId }))
  const picked = await clientEventsMany(users.map(u => String(u.id)))
  const clients: Record<string, { orgId: string | null; events: string[] }> = {}
  for (const u of users) clients[String(u.id)] = { orgId: u.orgId ? String(u.orgId) : null, events: picked[String(u.id)] || [] }
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  const want = new Set(Object.values(picked).flat())
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    admin ? `SELECT id, name, startDate, endDate, orgId FROM "Tournament"` : `SELECT id, name, startDate, endDate, orgId FROM "Tournament" WHERE orgId = ?`,
    ...(admin ? [] : [gate.orgId])).catch(() => [] as Row[])
  if (!admin) {
    // Only this organization's events: what they see of another head assigner's is not this one's.
    const here = new Set(rows.map(t => String(t.id)))
    for (const id of Object.keys(clients)) clients[id].events = clients[id].events.filter(e => here.has(e))
  }
  const events = rows
    .filter(t => want.has(String(t.id)) || !String(t.startDate || '') || String(t.endDate || t.startDate || '') >= cutoff)
    .map(t => ({ id: String(t.id), name: String(t.name || ''), startDate: String(t.startDate || ''), endDate: String(t.endDate || ''), orgId: t.orgId ? String(t.orgId) : null }))
    .sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'))
  return NextResponse.json({ clients, events })
}

export async function PUT(req: Request) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const userId = String(b.userId || '')
  if (!userId || !Array.isArray(b.events)) return NextResponse.json({ error: 'userId and events are required' }, { status: 400 })
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!target) return NextResponse.json({ error: 'No such user' }, { status: 404 })
  // The organizations where they are a tournament director (none: not one yet).
  const clientOrgs = (await membershipsOf(userId)).filter(m => m.role === 'client').map(m => m.orgId)
  if (!clientOrgs.length) return NextResponse.json({ error: 'Make them a Tournament Director first.' }, { status: 400 })
  const admin = gate.role === 'admin'
  if (!admin && (!gate.orgId || !clientOrgs.includes(gate.orgId))) {
    return NextResponse.json({ error: 'You can set this only for people in your organization.' }, { status: 403 })
  }
  // Events of the organization(s) this caller decides for: an admin, every one where
  // they're a tournament director; a head assigner, their own.
  const scope = admin ? clientOrgs : [gate.orgId as string]
  const inScope = (t: Row) => scope.includes(String(t.orgId || ''))
  const orgsOf = async (list: string[]) => list.length
    ? prisma.$queryRawUnsafe<Row[]>(`SELECT id, orgId FROM "Tournament" WHERE id IN (${list.map(() => '?').join(', ')})`, ...list)
    : [] as Row[]
  const ids = Array.from(new Set((b.events as unknown[]).map(String).filter(Boolean))).slice(0, 200)
  const ok = (await orgsOf(ids)).filter(inScope).map(t => String(t.id))
  // What they see of other organizations stays (a head assigner can't see those).
  const keep = (await orgsOf(await clientEvents(userId))).filter(t => !inScope(t)).map(t => String(t.id))
  const by = String(gate.session?.user?.name || gate.session?.user?.email || '')
  await saveClientEvents(userId, [...keep, ...ok], by)
  return NextResponse.json({ ok: true, events: ok })
}
