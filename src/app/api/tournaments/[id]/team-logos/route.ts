import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { isStaffRequest } from '@/lib/apiAuth'
import { getPublicVisibility } from '@/lib/publicView'

// Lightweight teamName -> logoUrl map for a tournament (used by the public results page).
//
// Keyed by team name, so it is a list of who registered: everyone but staff gets
// it once teams are public, through Teams & pools or the schedule's games, like
// the other team lists (Oct 4 2026).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await isStaffRequest())) {
    const vis = await getPublicVisibility(params.id).catch(() => null)
    if (vis?.pools !== 'live' && vis?.schedule !== 'live') return NextResponse.json({})
  }
  try {
    // Live registrations only. The map is keyed by team name, so a logo left behind by
    // a removed duplicate can overwrite the real club's crest on the public page.
    const teams = await prisma.registeredTeam.findMany({
      where: { registration: { tournamentId: params.id, deletedAt: null } },
      select: { teamName: true, logoUrl: true },
    })
    const map: Record<string, string> = {}
    for (const t of teams) if (t.teamName && t.logoUrl) map[t.teamName] = t.logoUrl
    return NextResponse.json(map)
  } catch {
    return NextResponse.json({})
  }
}
