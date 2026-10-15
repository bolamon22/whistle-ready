import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff, eventGate } from '@/lib/apiAuth'
import { AVAILABILITY_MANAGERS } from '@/lib/availability'
import { checkInsFor } from '@/lib/staffCheckIn'

// Score tables at a glance (Bo, Oct 14 2026: field directors deal with "missing score
// table people"). One day's games by time and field with the scorekeeper on each and
// whether they've checked in on their staff app (lib/staffCheckIn), with their phone,
// so an empty table is a call, not a walk. Scorekeepers only, so a field director sees
// none of the refs' details. For the people who run staff: directors, assigners,
// schedulers, field directors.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const no = eventGate(gate, params.id); if (no) return no
  if (!AVAILABILITY_MANAGERS.includes(gate.role)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  const games = await prisma.game.findMany({
    where: { tournamentId: params.id, isCanceled: false, date: { not: '' }, startTime: { not: '' } },
    select: { id: true, gameNumber: true, date: true, startTime: true, location: true, division: true, team1: true, team2: true,
      assignments: { where: { role: 'scorekeeper' }, select: { id: true, worker: { select: { name: true, phone: true } } } } },
  })
  const checks = await checkInsFor(games.flatMap(g => g.assignments.map(a => a.id)))
  const dates = Array.from(new Set(games.map(g => String(g.date).slice(0, 10)))).sort()
  return NextResponse.json({
    dates,
    games: games.map(g => {
      const a = g.assignments[0]
      return { id: g.id, gameNumber: g.gameNumber, date: String(g.date).slice(0, 10), startTime: g.startTime, location: g.location, division: g.division, team1: g.team1, team2: g.team2,
        scorekeeper: a ? { name: a.worker.name, phone: a.worker.phone || '', checkedInAt: checks.get(a.id) || null } : null }
    }),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}
