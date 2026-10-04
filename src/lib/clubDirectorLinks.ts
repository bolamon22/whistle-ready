// WHO GETS A CLUB'S MAIL
//
// A registration holds exactly one contactEmail, so every club letter -- pay
// reminders, confirmations, the lot -- went to one person. Jupiter Revolution
// registered twice for Monster Mash under two directors, Nick O'Hara and David
// Spennacchio, and merging those rows keeps one contact and drops the other
// (Bo, Sep 30 2026: "I would like to keep them both involved... they both will
// handle things like player waivers, and reviewing schedules").
//
// So a registration's letters go to its contact plus every login that can open
// it in the portal (lib/clubAccess), and the mailing list always agrees with the
// access list.
//
// PER REGISTRATION, NOT PER CLUB NAME (Oct 4 2026). This used to be keyed by club
// name, and carryDirectorLinks (gone) gave a club name's past directors each new
// registration of that name. Now a director gets a club's letters only for the
// registrations they can open: one who has left the club stops getting its new
// events' mail, and a second registration under the same name never sends its
// invoice to the first one's directors.
//
// Neither function throws: a club letter must not fail because the lookup did.
import { prisma } from '@/lib/db'
import { ensureClubAccess } from '@/lib/clubAccess'

/**
 * Every registration's director emails at one event, keyed by registration id.
 * One query for the whole batch: a club send walks every registration.
 */
export async function directorEmailsByRegistration(tournamentId: string): Promise<Map<string, string[]>> {
  const byReg = new Map<string, string[]>()
  if (!tournamentId) return byReg
  await ensureClubAccess()
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT a.registrationId AS rid, u.email AS email
         FROM "ClubRegAccess" a JOIN "User" u ON u.id = a.userId
        WHERE a.tournamentId = ?`, tournamentId)
    for (const r of rows) {
      const rid = String(r.rid || '')
      const email = String(r.email ?? '').trim().toLowerCase()
      if (!rid || !email) continue
      const list = byReg.get(rid) ?? []
      if (!list.includes(email)) list.push(email)
      byReg.set(rid, list)
    }
  } catch { /* an empty map just means the contact alone gets the letter */ }
  return byReg
}

/**
 * One registration's recipients: its contact, then its directors.
 *
 * The contact stays FIRST so a send receipt still names the person the club put on
 * the form. Deduped and lowercased; anything that isn't an address is dropped rather
 * than handed to SendGrid, which rejects the whole send over one bad recipient.
 */
export function registrationRecipients(
  registrationId: string,
  contactEmail: string | null | undefined,
  directors?: Map<string, string[]> | null,
): string[] {
  const out: string[] = []
  const add = (e: unknown) => {
    const v = String(e ?? '').trim().toLowerCase()
    if (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !out.includes(v)) out.push(v)
  }
  add(contactEmail)
  for (const e of directors?.get(registrationId) ?? []) add(e)
  return out
}
