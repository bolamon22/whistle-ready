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
import { nameKey } from '@/lib/names'

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

// ---------------------------------------------------------------------------
// WHO GETS A CLUB'S MAIL
//
// A registration holds exactly one contactEmail, so every club letter -- pay
// reminders, confirmations, the lot -- went to one person. Jupiter Revolution
// registered twice for Monster Mash under two directors, Nick O'Hara and David
// Spennacchio, and merging those rows keeps one contact and drops the other
// (Bo, Sep 30 2026: "I would like to keep them both involved... they both will
// handle things like player waivers, and reviewing schedules").
//
// Access is already keyed on (user, tournament, club) and has always allowed
// several directors. The two functions below make the MAILING list agree with
// the ACCESS list, rather than adding a second contact field that would then
// need keeping in step with it. Neither throws: a club letter must not fail
// because the extra lookup did.
// ---------------------------------------------------------------------------

/**
 * Every club's director emails for one event, keyed by loose club name.
 *
 * Two queries for the whole batch rather than two per club: a club send walks every
 * registration, and the links table is small enough to read once.
 *
 * Keyed on nameKey() -- the same loose key the portal's own ownership checks use --
 * so "Jupiter Revolution" and "Jupiter  Revolution" are one club, not two.
 */
export async function clubDirectorEmailMap(tournamentId: string): Promise<Map<string, string[]>> {
  const byClub = new Map<string, string[]>()
  if (!tournamentId) return byClub
  try {
    const links = await prisma.clubDirectorLink.findMany({
      where: { tournamentId }, select: { userId: true, clubName: true },
    })
    if (!links.length) return byClub
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(links.map(l => l.userId))] } },
      select: { id: true, email: true },
    })
    const emailFor = new Map(users.map(u => [u.id, String(u.email ?? '').trim().toLowerCase()]))
    for (const l of links) {
      const key = nameKey(l.clubName)
      const email = emailFor.get(l.userId)
      if (!key || !email) continue
      const list = byClub.get(key) ?? []
      if (!list.includes(email)) list.push(email)
      byClub.set(key, list)
    }
  } catch { /* an empty map just means the contact alone gets the letter */ }
  return byClub
}

/**
 * Merge one club's registration contact with its linked directors.
 *
 * The contact stays FIRST so a send receipt still names the person the club put on
 * the form. Deduped and lowercased; anything that isn't an address is dropped rather
 * than handed to SendGrid, which rejects the whole send over one bad recipient.
 */
export function clubRecipients(
  clubName: string,
  contactEmail: string | null | undefined,
  directors?: Map<string, string[]> | null,
): string[] {
  const out: string[] = []
  const add = (e: unknown) => {
    const v = String(e ?? '').trim().toLowerCase()
    if (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !out.includes(v)) out.push(v)
  }
  add(contactEmail)
  for (const e of directors?.get(nameKey(clubName)) ?? []) add(e)
  return out
}
