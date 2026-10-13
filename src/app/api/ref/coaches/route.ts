import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { teamRefKey } from '@/lib/names'

// Coach names for each team at an event, for the staff home page's game cards (Bo,
// Oct 13 2026: "if they have a coach assigned, we would just put that coach's name
// on there"). Names only -- a ref doesn't need the coach's phone or email.
//
// GET ?t=<tournamentId> -> { coaches: { [teamRefKey(division, team)]: "Coach Name" } }
// Keyed by division too: one club can have the same team name in two age groups.
export async function GET(req: NextRequest) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const tid = String(req.nextUrl.searchParams.get('t') || '')
  if (!tid) return NextResponse.json({ coaches: {} })
  if (gate.role !== 'admin' && gate.orgId && (await tournamentOrgId(tid)) !== gate.orgId) return NextResponse.json({ coaches: {} })
  const teams = await prisma.registeredTeam.findMany({
    where: { registration: { tournamentId: tid, deletedAt: null }, waitlisted: false },
    select: { teamName: true, division: true, coachName: true },
  })
  const coaches: Record<string, string> = {}
  for (const t of teams) {
    const name = String(t.coachName || '').trim()
    if (name) coaches[teamRefKey(t.division, t.teamName)] = name
  }
  return NextResponse.json({ coaches }, { headers: { 'Cache-Control': 'private, no-store' } })
}
