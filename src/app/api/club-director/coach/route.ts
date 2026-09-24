// A CLUB DIRECTOR NAMING THE ACTUAL COACH OF ONE OF THEIR OWN TEAMS.
//
// Directors put themselves down as the coach on every team to get through
// registration in one pass -- LaxManiax registered five teams with the same
// name on all five (Bo, Sep 24 2026). The real coaches then file their waivers,
// none of them match a coach named on a registration, and the portal reads
// "0 of 5 filed" while the signed waivers sit in "Also filed". The director
// could see the problem and had no way to fix it.
//
// WHAT MAKES THIS SAFE is the rule the roster route already uses: the team has
// to be one their own club registered for THIS tournament. The team is fetched
// by id and its registration's club checked against their ClubDirectorLink rows,
// so guessing an id reaches nothing -- team names like "HS Select" collide
// across clubs, and the id is never the thing trusted.
//
// NO ROSTER LOCK HERE, unlike moving a player. That lock exists for competitive
// integrity: shifting a strong player between your own teams once results exist
// (see src/lib/rosterLock.ts). Naming who stands on the sideline is not that, and
// a coach dropping out the morning of the event is exactly when a director needs
// to change it. The waiver is still signed by the coach personally; this only
// records who the club expects, which is what the waiver then matches against.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewAs } from '@/lib/clubDirectorView'
import { cleanName, nameKey } from '@/lib/names'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const tournamentId = String(body?.tournamentId || '').trim()
  const teamId = String(body?.teamId || '').trim()
  if (!tournamentId || !teamId) {
    return NextResponse.json({ error: 'tournamentId and teamId are required' }, { status: 400 })
  }

  // cleanName() rather than a bare trim, and for the same reason every staff write
  // path uses it (see api/tournaments/[id]/divisions/[division]/teams): a name pasted
  // out of a roster PDF or an email signature arrives carrying non-breaking and
  // zero-width spaces. Those survive \s+, so the stored name would never key-match the
  // waiver the coach files by hand, and the row would sit on "Not filed" forever with
  // two identical-looking names on screen.
  const coachName = cleanName(body?.coachName, 120)
  const coachEmail = cleanName(body?.coachEmail, 160).toLowerCase()
  const coachPhone = cleanName(body?.coachPhone, 40)
  if (!coachName) return NextResponse.json({ error: 'A coach name is required' }, { status: 400 })
  if (coachEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(coachEmail)) {
    return NextResponse.json({ error: 'That email address does not look right' }, { status: 400 })
  }

  const as = viewAs(session, req.nextUrl.searchParams.get('userId'))
  if (!as.ok) return as.res

  const links = await prisma.clubDirectorLink.findMany({ where: { userId: as.userId, tournamentId } })
  if (!links.length) return NextResponse.json({ error: 'You are not linked to a club for this event' }, { status: 403 })
  const mine = new Set(links.map(l => nameKey(l.clubName)))

  const team = await prisma.registeredTeam.findUnique({
    where: { id: teamId },
    select: {
      id: true, teamName: true,
      registration: { select: { clubName: true, tournamentId: true, deletedAt: true } },
    },
  })
  // A registration staff soft-deleted is not editable either -- it is on its way
  // out, and letting a director write to it would resurrect stale rows on restore.
  if (!team || team.registration.tournamentId !== tournamentId || team.registration.deletedAt) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }
  if (!mine.has(nameKey(team.registration.clubName))) {
    return NextResponse.json({ error: 'That is not one of your teams' }, { status: 403 })
  }

  await prisma.registeredTeam.update({
    where: { id: team.id },
    data: { coachName, coachEmail, coachPhone },
  })

  return NextResponse.json({ ok: true, teamName: team.teamName, coachName })
}
