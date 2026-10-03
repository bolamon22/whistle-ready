// THE ORGANIZER'S OTHER EVENTS A CLUB COULD BRING ITS TEAMS TO.
//
// Feeds "Register for another event" in the club portal. A club already in one
// event was signing up for the next one through the public form, typing every
// team again (Bo, Oct 3 2026). Listed: the same organizer's upcoming events that
// are taking team registrations and that this club is not already in, each with
// its divisions (and which are marked full) and its price list, so the portal can
// show the total before they commit.
//
// Same organizer only: club names are not unique across organizers, and a club
// portal must never become a way into another organizer's event.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewAs } from '@/lib/clubDirectorView'
import { nameKey } from '@/lib/names'
import { tournamentOrgId } from '@/lib/org'
import { todayET } from '@/lib/publicView'
import { parsePricing } from '@/lib/regPricing'
import { divisionBadge } from '@/lib/regStatus'
import { eventInfo, divisionFull } from '@/lib/clubPortal'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const as = viewAs(session, req.nextUrl.searchParams.get('userId'))
  if (!as.ok) return as.res
  const tournamentId = String(req.nextUrl.searchParams.get('tournamentId') || '')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 })

  const links = await prisma.clubDirectorLink.findMany({ where: { userId: as.userId, tournamentId } })
  if (!links.length) return NextResponse.json({ events: [] })
  const clubs = new Set(links.map(l => nameKey(l.clubName)))
  const orgId = await tournamentOrgId(tournamentId)
  if (!orgId) return NextResponse.json({ events: [] })

  const today = todayET()
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, name, startDate, endDate FROM "Tournament" WHERE orgId = ? AND id != ? ORDER BY startDate`, orgId, tournamentId)
  const upcoming = rows.filter(t => String(t.name || '').trim() && String(t.endDate || t.startDate || '') >= today)

  const events = []
  for (const row of upcoming) {
    const info = await eventInfo(String(row.id))
    if (!info || !info.teamRegEnabled) continue
    // Already registered there (and not deleted): nothing to offer.
    const regs = await prisma.teamRegistration.findMany({
      where: { tournamentId: info.id, deletedAt: null }, select: { clubName: true },
    })
    if (regs.some(r => clubs.has(nameKey(r.clubName)))) continue
    events.push({
      id: info.id, name: info.name, startDate: info.startDate, endDate: info.endDate, location: info.location,
      divisions: info.divisions.map(name => {
        const badge = divisionBadge(name, info.site)
        return { name, full: divisionFull(info, name), label: badge?.suffix || '' }
      }),
      pricing: parsePricing(info.pricingRaw),
    })
  }
  return NextResponse.json({ events })
}
