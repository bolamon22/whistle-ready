// CARRYING A CLUB DIRECTOR'S ACCESS TO THE CLUB'S NEXT EVENT.
//
// A ClubDirectorLink is (user, tournament, club). It is minted once, by the claim
// link in one tournament's registration letter, so it only ever covers the event
// that letter was about. When the same club registers for the next event nothing
// creates a second link -- so the portal's event picker still lists one event and
// the director cannot see the teams they just entered. Joe Frederick, LaxManiax,
// Sep 23 2026: five teams at Monster Mash, three at the Fall Classic, one link.
//
// So: when a registration is created, any director already trusted with that club
// name is given the same access to the new event.
//
// SCOPED BY ORG, DELIBERATELY. Club names are not unique across organizers -- two
// of them can each run a "Stealth" -- and a link granted by one organizer must
// never open another organizer's event. The match is the exact club name AND a
// prior link on a tournament the same org owns.
//
// Still an explicit row, not a rule applied at read time: access stays visible in
// the admin list and revocable with the existing DELETE.
import { prisma } from '@/lib/db'
import { tournamentOrgId } from '@/lib/org'

/**
 * Give every director already linked to `clubName` (within this tournament's org)
 * a link to `tournamentId` too. Idempotent. Never throws -- a registration must
 * not fail because access could not be widened.
 *
 * Returns the number of links created or refreshed, for logging.
 */
export async function carryDirectorLinks(tournamentId: string, clubName: string): Promise<number> {
  const club = String(clubName || '').trim()
  if (!tournamentId || !club) return 0
  try {
    const orgId = await tournamentOrgId(tournamentId)
    if (!orgId) return 0

    const prior = await prisma.clubDirectorLink.findMany({ where: { clubName: club } })
    const candidates = prior.filter(l => l.tournamentId !== tournamentId)
    if (!candidates.length) return 0

    // Keep only the directors whose existing link sits on one of this org's events.
    const sameOrg = new Set<string>()
    for (const id of [...new Set(candidates.map(l => l.tournamentId))]) {
      if (await tournamentOrgId(id) === orgId) sameOrg.add(id)
    }
    const userIds = [...new Set(candidates.filter(l => sameOrg.has(l.tournamentId)).map(l => l.userId))]

    let n = 0
    for (const userId of userIds) {
      await prisma.clubDirectorLink.upsert({
        where: { userId_tournamentId_clubName: { userId, tournamentId, clubName: club } },
        update: {},
        create: { userId, tournamentId, clubName: club },
      })
      n++
    }
    return n
  } catch {
    return 0
  }
}
