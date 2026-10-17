import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGate, requireDirector } from '@/lib/apiAuth'
import { clientEvents, clientsOfEvent, saveClientEvents } from '@/lib/clientEvents'
import { inviteClient } from '@/lib/clientInvite'
import { eventClientOf, normalizeEventClient, pendingInvitesFor, saveEventClient } from '@/lib/eventClient'
import { tournamentOrgId } from '@/lib/org'
import { membershipsOf } from '@/lib/orgMembers'

// One event's tournament director (Bo, Oct 17 2026: "where I can add them to an
// existing tournament ... We should be able to just add their name in at least"),
// for the head assigner (the director) and admins.
//
// GET    -> { contact, logins, pending }: their name, email and phone (lib/eventClient),
//           who can see this event in Whistle Ready (lib/clientEvents), invites waiting.
// PUT    { name, email, phone } -> saves them; an empty name clears them.
// POST   -> invites them (their saved email) to see this event (lib/clientInvite).
// DELETE ?userId= -> stops sharing this event with that login.

async function answer(id: string) {
  const [contact, ids, pending] = await Promise.all([eventClientOf(id), clientsOfEvent(id), pendingInvitesFor(id)])
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : []
  return { contact, logins: users.map(u => ({ id: u.id, name: u.name, email: u.email })), pending: pending.map(p => ({ email: p.email, createdAt: p.createdAt, url: `/invite/${p.token}` })) }
}

async function gateFor(id: string) {
  const gate = await requireDirector(); if (!gate.ok) return { res: gate.res }
  const away = await orgGate(gate, id); if (away) return { res: away }
  const t = await prisma.tournament.findUnique({ where: { id }, select: { id: true } })
  if (!t) return { res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { gate, by: String(gate.session?.user?.name || gate.session?.user?.email || '') }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const g = await gateFor(params.id); if ('res' in g) return g.res
  return NextResponse.json(await answer(params.id))
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await gateFor(params.id); if ('res' in g) return g.res
  const c = normalizeEventClient(await req.json().catch(() => ({})))
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) return NextResponse.json({ error: 'That email doesn’t look right.' }, { status: 400 })
  await saveEventClient(params.id, c, g.by)
  return NextResponse.json(await answer(params.id))
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const g = await gateFor(params.id); if ('res' in g) return g.res
  const contact = await eventClientOf(params.id)
  if (!contact?.email) return NextResponse.json({ error: 'Add their email first.' }, { status: 400 })
  const orgId = await tournamentOrgId(params.id)
  if (!orgId) return NextResponse.json({ error: 'This event has no organization.' }, { status: 400 })
  const r = await inviteClient({ email: contact.email, name: contact.name, orgId, by: g.by, events: [params.id], keepRole: true })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ...(await answer(params.id)), ...(r.assigned ? { assigned: true } : { inviteUrl: r.inviteUrl }) })
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const g = await gateFor(params.id); if ('res' in g) return g.res
  const userId = new URL(req.url).searchParams.get('userId') || ''
  const orgId = await tournamentOrgId(params.id)
  const isTheirs = userId && orgId && (await membershipsOf(userId)).some(m => m.role === 'client' && m.orgId === orgId)
  if (!isTheirs) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await saveClientEvents(userId, (await clientEvents(userId)).filter(e => e !== params.id), g.by)
  return NextResponse.json(await answer(params.id))
}
