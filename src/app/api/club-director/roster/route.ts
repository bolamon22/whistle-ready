// A CLUB DIRECTOR PUTTING ONE OF THEIR OWN PLAYERS ON ONE OF THEIR OWN TEAMS.
//
// The waivers page already told them to "ask the organizer to re-tag them", which put a
// ten-second fix on the organizer's desk, four times over, on the week of an event
// (Bo, Sep 18 2026). This is that fix, done by the person who actually knows which team
// the kid plays for.
//
// WHAT MAKES THIS SAFE IS WHAT THE DIRECTOR CAN SEE. /api/club-director/data returns
// waivers whose CLUB matches one of their ClubDirectorLink rows and nothing else --
// deliberately, because team names like "HS Select" collide across clubs and a bare
// team match would hand one club another club's minors. The same rule gates this: the
// waiver must already be attributed to their club, and the destination must be a team
// their club registered for this tournament. The team tag is rebuilt here from their own
// registration rather than taken from the request, so a director cannot write another
// club's name into it even by hand.
//
// TWO ACTIONS, ONE LOCK (see src/lib/rosterLock.ts):
//   place  -- the waiver is on no registered team. Allowed always, including mid-event.
//             Players keep registering after the first whistle and some of them mistype
//             the team; making that wait for the organizer helps nobody.
//   move   -- the waiver is already on one of their teams. Allowed until the event's
//             first game, then refused. This is the roster-shifting the lock exists for.
//
// Staff are not affected by any of it; the staff waivers page moves anyone at any time.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewAs } from '@/lib/clubDirectorView'
import { orgForTournament } from '@/lib/org'
import { getSubmission, updateSubmissionData } from '@/lib/formSubmissions'
import { rosterLock } from '@/lib/rosterLock'

const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '')
const SEP = /\s+[—–]\s+|\s+-\s+/

/** "LaxManiax — HS Select" -> the team half. No separator means the whole thing is the team. */
function teamOf(tag: string): string {
  const t = String(tag || '').trim()
  const m = SEP.exec(t)
  return m ? t.slice(m.index + m[0].length).trim() : t
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as any
  const tournamentId = String(body?.tournamentId || '').trim()
  const waiverId = String(body?.waiverId || '').trim()
  const wantTeam = String(body?.teamName || '').trim()
  if (!tournamentId || !waiverId || !wantTeam) {
    return NextResponse.json({ error: 'tournamentId, waiverId and teamName are required' }, { status: 400 })
  }

  const as = viewAs(session, req.nextUrl.searchParams.get('userId'))
  if (!as.ok) return as.res

  // Which clubs is this person the director of, for THIS event?
  const links = await prisma.clubDirectorLink.findMany({ where: { userId: as.userId, tournamentId } })
  if (!links.length) return NextResponse.json({ error: 'You are not linked to a club for this event' }, { status: 403 })
  const clubNames = links.map(l => l.clubName)
  const mine = new Set(clubNames.map(norm))

  // Their registered teams are the only legal destinations.
  const regs = await prisma.teamRegistration.findMany({
    where: { tournamentId, clubName: { in: clubNames }, deletedAt: null },
    select: { clubName: true, teams: { select: { teamName: true, division: true } } },
  })
  const targets = regs.flatMap(r => r.teams.map(t => ({
    club: String(r.clubName || ''),
    team: String(t.teamName || ''),
    division: String(t.division || ''),
  }))).filter(t => t.team)

  const target = targets.find(t => norm(t.team) === norm(teamOf(wantTeam)) || norm(`${t.club} ${t.team}`) === norm(wantTeam))
  if (!target) {
    return NextResponse.json({ error: 'That is not one of your registered teams for this event' }, { status: 403 })
  }

  const org = await orgForTournament(tournamentId)
  if (!org?.id) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const sub = await getSubmission(org.id, waiverId)
  if (!sub || sub.formType !== 'player' || String(sub.data?.tournamentId || '') !== tournamentId) {
    return NextResponse.json({ error: 'Waiver not found' }, { status: 404 })
  }

  // The waiver has to already belong to one of their clubs. Same rule that decides what
  // they can SEE, so this can never reach a player they were not already shown.
  const curTag = String(sub.data?.teamName || '')
  const curClub = String(sub.data?.clubName || '') || (SEP.test(curTag) ? curTag.split(SEP)[0] : '')
  if (!mine.has(norm(curClub))) {
    return NextResponse.json({ error: 'That player is not on your club' }, { status: 403 })
  }

  // PLACE or MOVE? Only a move is locked.
  const onOneOfMine = targets.some(t => norm(t.team) === norm(teamOf(curTag)))
  if (onOneOfMine) {
    const lock = await rosterLock(tournamentId)
    if (lock.locked) return NextResponse.json({ error: lock.why, locked: true }, { status: 403 })
  }

  const tag = `${target.club} — ${target.team}`
  if (tag === curTag) return NextResponse.json({ ok: true, unchanged: true })

  const changes: Record<string, string> = { teamName: tag, clubName: target.club }
  if (target.division) changes.division = target.division

  const who = String(session.user?.name || session.user?.email || as.userId || 'club director')
  const updated = await updateSubmissionData(org.id, waiverId, changes, who)
  if (!updated) return NextResponse.json({ error: 'Could not update that waiver' }, { status: 500 })

  return NextResponse.json({ ok: true, teamName: tag, action: onOneOfMine ? 'moved' : 'placed' })
}
