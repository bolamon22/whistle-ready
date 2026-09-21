import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// Lightweight teamName -> logoUrl map for a tournament (used by the public results page).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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
