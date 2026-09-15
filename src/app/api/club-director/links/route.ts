import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewAs } from '@/lib/clubDirectorView'

// GET - fetch club director's linked clubs
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const as = viewAs(session, req.nextUrl.searchParams.get('userId'))
  if (!as.ok) return as.res
  const userId = as.userId

  const links = await prisma.clubDirectorLink.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

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

// POST - create a link (admin only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, tournamentId, clubName } = await req.json()
  const link = await prisma.clubDirectorLink.upsert({
    where: { userId_tournamentId_clubName: { userId, tournamentId, clubName } },
    update: {},
    create: { userId, tournamentId, clubName },
  })
  return NextResponse.json(link)
}

// DELETE - remove a link (admin only)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, tournamentId, clubName } = await req.json()
  await prisma.clubDirectorLink.deleteMany({ where: { userId, tournamentId, clubName } })
  return NextResponse.json({ ok: true })
}
