import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireClientHome } from '@/lib/apiAuth'
import { clientEvents } from '@/lib/clientEvents'
import { clientSections } from '@/lib/clientView'
import { orgById } from '@/lib/org'
import { orgPeople } from '@/lib/orgMembers'
import { planOffFor } from '@/lib/orgPlanStore'

// The tournament director's home (/dashboard/client, lib/clientEvents): their events in
// the organization they're working in, how far along each one's officials are, and who
// to call at the head assigner's. An admin's View as of a tournament director sees every
// event of the viewed organization; a head assigner sees their own organization's, to
// check what a tournament director sees. Tournament.orgId is a raw column.

type Row = Record<string, unknown>

export async function GET() {
  const gate = await requireClientHome(); if (!gate.ok) return gate.res
  const realAdmin = (gate.session?.user as { role?: string } | undefined)?.role === 'admin'
  const as = gate.role === 'client' && !realAdmin ? 'client' : realAdmin ? 'admin' : 'director'
  const orgId = gate.orgId
  if (!orgId) return NextResponse.json({ as, org: null, assigners: [], sections: clientSections([]), events: [] })
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, startDate, endDate, location, logoUrl FROM "Tournament" WHERE orgId = ?`, orgId).catch(() => [] as Row[])
  const mine = as === 'client' ? new Set(await clientEvents(gate.userId)) : null
  const list = rows.filter(t => !mine || mine.has(String(t.id)))
  const ids = list.map(t => String(t.id))
  const games = ids.length
    ? await prisma.game.findMany({ where: { tournamentId: { in: ids } }, select: { tournamentId: true, refCount: true, isCanceled: true, assignments: { select: { role: true } } } })
    : []
  // Games, games with every referee slot filled, and referee slots still open.
  const per = new Map<string, { games: number; staffed: number; open: number }>()
  for (const g of games) {
    if (g.isCanceled) continue
    const e = per.get(g.tournamentId) ?? { games: 0, staffed: 0, open: 0 }
    const refs = g.assignments.filter(a => /^ref/.test(a.role)).length
    e.games++
    if (refs >= g.refCount) e.staffed++
    e.open += Math.max(0, g.refCount - refs)
    per.set(g.tournamentId, e)
  }
  const [org, people, planOff] = await Promise.all([orgById(orgId), orgPeople(orgId).catch(() => []), planOffFor(orgId)])
  const events = list
    .map(t => ({ id: String(t.id), name: String(t.name || ''), startDate: String(t.startDate || ''), endDate: String(t.endDate || ''), location: String(t.location || ''), logoUrl: String(t.logoUrl || ''), ...(per.get(String(t.id)) ?? { games: 0, staffed: 0, open: 0 }) }))
    .sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999'))
  return NextResponse.json({
    as,
    org: org ? { name: org.name, logoUrl: org.logoUrl || '', contactEmail: org.contactEmail || '', contactPhone: org.contactPhone || '', website: org.website || '' } : null,
    assigners: people.filter(p => p.role === 'director').map(p => ({ name: p.name, email: p.email })),
    sections: clientSections(planOff),
    events,
  })
}
