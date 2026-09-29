// A CLUB DIRECTOR PUTTING THEIR OWN LOGO ON THEIR OWN TEAMS.
//
// Until now the only way a club's crest reached the app was emailing the file to
// Bo so he could upload it from the staff registrations page. The portal showed a
// grey letter tile and no way to change it -- Calusa Lacrosse Club registered two
// Warriors teams on Sep 28 2026 with no logo on any of the three (Bo, Sep 29).
//
// Same ownership rule as the coach and pay-method routes: the registration is
// fetched by id and its club checked against the caller's ClubDirectorLink rows
// for this tournament, so guessing an id reaches nothing and a soft-deleted
// registration is refused.
//
// APPLYING TO TEAMS ONLY FILLS BLANKS, which is what the staff page already does
// (uploadClubLogo there maps `t.logoUrl ? t : {...t, logoUrl: url}`). A club that
// took the trouble to give one team its own crest should not lose it because
// somebody later set a club-wide logo. Replacing a team's own logo stays a
// deliberate act.
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { viewAs } from '@/lib/clubDirectorView'
import { nameKey } from '@/lib/names'

// Only an inline image, never an arbitrary URL from the client. These strings are
// rendered back into <img src> for everyone who sees the club -- staff, the public
// event page, other directors -- so accepting "https://..." would let one club
// point every one of those pages at a server it controls and watch who loads it.
// data: cannot phone home.
const MAX_CHARS = 400_000   // the 512px compressor lands well under this; see lib/imageCompress
function badLogo(v: string): string | null {
  if (v === '') return null                                    // empty means remove
  if (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(v)) return 'That does not look like an image file.'
  if (v.length > MAX_CHARS) return 'That image is too large — try a smaller one.'
  return null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const tournamentId = String(body?.tournamentId || '').trim()
  const registrationId = String(body?.registrationId || '').trim()
  const logoUrl = String(body?.logoUrl ?? '').trim()
  const applyToTeams = body?.applyToTeams !== false      // default on
  if (!tournamentId || !registrationId) {
    return NextResponse.json({ error: 'tournamentId and registrationId are required' }, { status: 400 })
  }
  const bad = badLogo(logoUrl)
  if (bad) return NextResponse.json({ error: bad }, { status: 400 })

  const as = viewAs(session, req.nextUrl.searchParams.get('userId'))
  if (!as.ok) return as.res

  const links = await prisma.clubDirectorLink.findMany({ where: { userId: as.userId, tournamentId } })
  if (!links.length) return NextResponse.json({ error: 'You are not linked to a club for this event' }, { status: 403 })
  const mine = new Set(links.map(l => nameKey(l.clubName)))

  const reg = await prisma.teamRegistration.findUnique({
    where: { id: registrationId },
    select: { id: true, clubName: true, tournamentId: true, deletedAt: true, teams: { select: { id: true, logoUrl: true } } },
  })
  if (!reg || reg.tournamentId !== tournamentId || reg.deletedAt) {
    return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
  }
  if (!mine.has(nameKey(reg.clubName))) {
    return NextResponse.json({ error: 'That is not one of your registrations' }, { status: 403 })
  }

  // clubLogoUrl is one of the late raw columns, not in schema.prisma -- see
  // ensureRegistrationColumns in api/registrations. Raw SQL, same as everywhere else
  // that touches it.
  await prisma.$executeRawUnsafe(
    'UPDATE "TeamRegistration" SET "clubLogoUrl" = ? WHERE id = ?', logoUrl, reg.id)

  let applied = 0
  if (applyToTeams && logoUrl) {
    const blank = reg.teams.filter(t => !String(t.logoUrl || '').trim()).map(t => t.id)
    if (blank.length) {
      await prisma.registeredTeam.updateMany({ where: { id: { in: blank } }, data: { logoUrl } })
      applied = blank.length
    }
  }

  return NextResponse.json({ ok: true, clubName: reg.clubName, applied, teams: reg.teams.length })
}
