import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireClientEvent } from '@/lib/apiAuth'
import { assigningFeeOf, feeTotal } from '@/lib/assigningFee'
import { clientPay, staffedGames } from '@/lib/clientPay'
import { clientSections } from '@/lib/clientView'
import { orgById, tournamentOrgId } from '@/lib/org'
import { orgPeople } from '@/lib/orgMembers'
import { planOffFor } from '@/lib/orgPlanStore'
import { roleLabel } from '@/lib/utils'

// One event in the tournament director's area (lib/clientEvents): the schedule with who
// is on each game and their phone numbers (Bo's pick, Oct 17 2026), Staff pay (they
// normally pay the staff), the head assigner's assigning fee, and whatever the head
// assigner's add-ons share (lib/clientView: final scores when Scores is on).

const ROLE_ORDER = ['ref1', 'ref2', 'ref3', 'scorekeeper']

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireClientEvent(params.id); if (!gate.ok) return gate.res
  const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: { id: true, name: true, startDate: true, endDate: true, location: true, logoUrl: true } })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const orgId = await tournamentOrgId(params.id)
  const [org, people, planOff, fee, staffed, pay, games] = await Promise.all([
    orgById(orgId), orgId ? orgPeople(orgId).catch(() => []) : Promise.resolve([]), planOffFor(orgId), assigningFeeOf(params.id), staffedGames(params.id), clientPay(params.id),
    prisma.game.findMany({
      where: { tournamentId: params.id },
      include: { assignments: { include: { worker: { select: { name: true, phone: true } } } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { location: 'asc' }],
    }),
  ])
  const sections = clientSections(planOff)
  const scores = sections.includes('scores')
  const rank = (r: string) => { const i = ROLE_ORDER.indexOf(r); return i < 0 ? 99 : i }
  const schedule = games.map(g => ({
    id: g.id, gameNumber: g.gameNumber, date: g.date, startTime: g.startTime, division: g.division, location: g.location,
    team1: g.team1, team2: g.team2, refCount: g.refCount, isChampionship: g.isChampionship, isCanceled: g.isCanceled,
    ...(scores ? { score1: g.score1, score2: g.score2 } : {}),
    officials: [...g.assignments].sort((a, b) => rank(a.role) - rank(b.role))
      .map(a => ({ role: a.role, label: roleLabel(a.role), name: a.worker.name, phone: a.worker.phone || '' })),
  }))
  return NextResponse.json({
    as: gate.as,
    tournament: { id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, location: t.location, logoUrl: t.logoUrl || '' },
    org: org ? { name: org.name, logoUrl: org.logoUrl || '', contactEmail: org.contactEmail || '', contactPhone: org.contactPhone || '', zelleHandle: org.zelleHandle || '' } : null,
    assigners: people.filter(p => p.role === 'director').map(p => ({ name: p.name, email: p.email })),
    sections,
    schedule,
    pay,
    fee: { ...fee, games: staffed, total: feeTotal(fee, staffed) },
  })
}
