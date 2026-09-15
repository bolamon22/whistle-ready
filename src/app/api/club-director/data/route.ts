import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tournamentId = req.nextUrl.searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })

  // Get clubs this user is linked to for this tournament
  const links = await prisma.clubDirectorLink.findMany({
    where: { userId: session.user.id, tournamentId },
  })
  if (links.length === 0) return NextResponse.json({ clubs: [] })

  const clubNames = links.map(l => l.clubName)

  // Get registrations for their clubs only
  const registrations = await prisma.teamRegistration.findMany({
    // deletedAt: null, or a registration staff removed still counts against
    // the club. LaxManiax saw $8,970 owing on an account paid in full,
    // because deleted duplicates kept their invoice while only the live
    // registration's payments were credited (Sep 15 2026).
    where: { tournamentId, clubName: { in: clubNames }, deletedAt: null },
    include: {
      teams: true,
      payments: { select: { amount: true, method: true, receivedAt: true } },
    },
  })

  // Get player registrations for their clubs
  const playerRegs = await prisma.playerRegistration.findMany({
    where: { tournamentId, teamClubName: { in: clubNames } },
    orderBy: { playerName: 'asc' },
  })

  // Get games involving their teams
  const teamNames = registrations.flatMap(r => r.teams.map(t => t.teamName)).filter(Boolean)
  const games = await prisma.game.findMany({
    where: {
      tournamentId,
      OR: [
        { team1: { in: teamNames } },
        { team2: { in: teamNames } },
      ],
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  })

  // The actual signed waivers.
  //
  // WHY THIS AND NOT playerRegs: a waiver filed on /player-waiver lands in
  // OrgFormSubmission, while PlayerRegistration is a different, largely unused
  // store -- so the Players tab was reading a table the waiver form never
  // writes to and showing an empty list to clubs whose parents had filed. Same
  // source the staff registrations page counts from (lib/waiverCounts.ts), so
  // the two can never disagree.
  //
  // Matched the same way too: the form records the team as "Club — Team", not
  // the bare team name.
  let waivers: any[] = []
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "id", "playerName", "teamName", "clubName", "jersey", "submittedAt", "data"
       FROM "OrgFormSubmission"
       WHERE "tournamentId" = ? AND "formType" = 'player' AND "archivedAt" IS NULL
       ORDER BY "playerName" ASC`, tournamentId)
    const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
    const SEP = /\s+[\u2014\u2013]\s+|\s+-\s+/
    const mine = new Set(clubNames.map(norm))
    waivers = (rows || []).map(r => {
      const tag = String(r.teamName ?? '').trim()
      const m = SEP.exec(tag)
      const club = m ? tag.slice(0, m.index) : ''
      const team = m ? tag.slice(m.index + m[0].length) : tag
      let d: any = {}
      try { d = JSON.parse(String(r.data || '{}')) } catch { /* keep the row */ }
      return {
        id: String(r.id), playerName: String(r.playerName || d.playerName || ''),
        team, club: String(r.clubName || club || ''),
        jersey: r.jersey ?? d.jerseyNumber ?? null,
        grade: d.grade || '', parentName: d.parentName || '',
        signed: !!(d.signature || d.playerName),
        submittedAt: String(r.submittedAt || ''),
      }
    })
      // Club match ONLY. A waiver we cannot confidently attribute to this club is
      // not shown to it: these are children's names, parents' names and jersey
      // numbers, and team names here are generic enough to collide across clubs
      // ("HS Select", "2031/32", "Middle School Select" are all in use). Falling
      // back to a bare team-name match would hand one club another club's minors.
      // Nothing is lost by being strict — the club is recoverable from the
      // "Club — Team" tag when the clubName column is blank, which is done above.
      .filter(w => mine.has(norm(w.club)))
  } catch { /* no waivers table yet -- the tab shows none rather than failing */ }

  return NextResponse.json({ clubs: clubNames, registrations, playerRegs, games, teamNames, waivers })
}
