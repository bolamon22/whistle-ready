import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { CREWS, crewsOf, isCrew, type Crew } from '@/lib/staffRelease'
import { getRelease, setRelease } from '@/lib/staffReleaseStore'
import { eventSideOf } from '@/lib/eventTeamsStore'

// The Assigner's "Staff portal" switches (lib/staffRelease): whether refs and
// scorekeepers can see their games yet, per crew.
//
// GET  -> { crews: [{ crew, shown, shownAt, shownBy, officials, games }], saved }
// POST { crews: Crew[], visible: boolean } -> the same, after the change.
// Hiding never deletes anything; it only takes the games off the staff portal.

const MANAGERS = ['admin', 'director', 'assigner']

async function state(tournamentId: string) {
  const [rel, games, side] = await Promise.all([
    getRelease(tournamentId),
    prisma.game.findMany({
      where: { tournamentId, isCanceled: false },
      select: { division: true, startTime: true, location: true, assignments: { select: { role: true, workerId: true } } },
    }),
    eventSideOf(tournamentId),   // a division that says neither: the event's teams
  ])
  const people: Record<Crew, Set<string>> = { boys: new Set(), girls: new Set(), scorekeepers: new Set() }
  const slots: Record<Crew, number> = { boys: 0, girls: 0, scorekeepers: 0 }
  for (const g of games) {
    if (!g.startTime || !g.location) continue
    for (const a of g.assignments) for (const c of crewsOf(a.role, g.division, side)) { people[c].add(a.workerId); slots[c]++ }
  }
  return {
    saved: rel.saved,
    crews: CREWS.map(c => ({ crew: c, shown: !!rel[c], shownAt: rel[c]?.at || '', shownBy: rel[c]?.by || '', officials: people[c].size, games: slots[c] })),
  }
}

async function gateFor(id: string) {
  const gate = await requireStaff(); if (!gate.ok) return { res: gate.res }
  if (!MANAGERS.includes(gate.role)) return { res: NextResponse.json({ error: 'Only assigners and directors can change this.' }, { status: 403 }) }
  if (gate.role !== 'admin' && gate.orgId) {
    const org = await tournamentOrgId(id)
    if (org && org !== gate.orgId) return { res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { gate }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const g = await gateFor(params.id); if ('res' in g) return g.res
  return NextResponse.json(await state(params.id), { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const g = await gateFor(params.id); if ('res' in g) return g.res
  const b = await req.json().catch(() => ({}))
  const crews = Array.isArray(b.crews) ? Array.from(new Set((b.crews as unknown[]).filter(isCrew))) : []
  if (!crews.length || typeof b.visible !== 'boolean') return NextResponse.json({ error: 'crews and visible required' }, { status: 400 })
  const who = String(g.gate.session?.user?.name || g.gate.session?.user?.email || '')
  await setRelease(params.id, crews, b.visible, who)
  return NextResponse.json(await state(params.id))
}
