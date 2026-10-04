import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewAs } from '@/lib/clubDirectorView'
import { openableRegistrations, grantByClubName, revokeByClubName } from '@/lib/clubAccess'

// GET - the clubs and events this login can open, one entry per registration.
//
// Built from the per-registration grants (lib/clubAccess), not ClubDirectorLink:
// a link no longer opens anything by itself. Same shape as before (userId,
// tournamentId, clubName), plus registrationId.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const as = viewAs(session, req.nextUrl.searchParams.get('userId'))
  if (!as.ok) return as.res
  const userId = as.userId

  const links = (await openableRegistrations(userId)).reverse().map(r => ({
    id: r.id, userId, tournamentId: r.tournamentId, clubName: r.clubName, registrationId: r.id,
  }))

  // Who the portal belongs to, so staff viewing it can see whose screen this is
  // rather than mistaking it for their own.
  let viewing: { name: string; email: string } | null = null
  if (as.viewingOther) {
    try {
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
      if (u) viewing = { name: u.name || '', email: u.email || '' }
    } catch { /* banner falls back to "this club director" */ }
  }

  // The tournaments these links point at, returned alongside.
  //
  // WHY: the dashboard used to build its event picker from /api/tournaments,
  // which returns [] for any user without an orgId -- which is every club
  // director, since they belong to a club and not to the organizing body. So the
  // picker was empty, no event was ever selected, and Overview / Players /
  // Schedule / Billing all rendered zeros while History (which builds its own
  // list from these links) showed the real thing. Joe Frederick, LaxManiax,
  // Sep 15 2026: "When I look at the Overview screen it shows no teams."
  const ids = [...new Set(links.map(l => l.tournamentId))]
  let tournaments: any[] = []
  if (ids.length) {
    try {
      tournaments = await prisma.tournament.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, startDate: true, endDate: true, location: true, logoUrl: true },
        orderBy: { startDate: 'desc' },
      })
    } catch { /* the picker falls back to nothing rather than 500ing */ }
  }
  return NextResponse.json({ links, tournaments, viewing })
}

// POST - link a login to a club at an event (admin only): every registration of
// that club name there now. A person deciding, so matching the name is fine here.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, tournamentId, clubName } = await req.json()
  if (!userId || !tournamentId || !String(clubName || '').trim()) {
    return NextResponse.json({ error: 'userId, tournamentId and clubName are required' }, { status: 400 })
  }
  // Only registrations open anything now, so a club that hasn't registered for the
  // event yet can't be linked ahead of time: the director gets in when they register.
  const n = await grantByClubName(String(userId), String(tournamentId), String(clubName))
  if (!n) return NextResponse.json({ error: 'No registration with that club name at this event yet.' }, { status: 404 })
  return NextResponse.json({ id: `${tournamentId}:${clubName}`, userId, tournamentId, clubName, registrations: n })
}

// DELETE - unlink a login from a club at an event (admin only).
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, tournamentId, clubName } = await req.json()
  await revokeByClubName(String(userId || ''), String(tournamentId || ''), String(clubName || ''))
  return NextResponse.json({ ok: true })
}
