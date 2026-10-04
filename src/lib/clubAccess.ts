// WHO CAN OPEN A CLUB REGISTRATION IN THE CLUB PORTAL
//
// Bo, Oct 4 2026: "I think we should just have it by email, but sometimes club
// directors change. So we want them to be able to create their own club director
// profile. Even if the club is kind of the same name."
//
// Access used to follow the club NAME. A ClubDirectorLink (login, event, club)
// opened every registration of that name at that event, and carryDirectorLinks
// handed the name's past directors every new registration of it. So anyone who
// registered under a real club's exact name could open its rosters and its
// players' waivers, and a director who had left a club kept getting its next
// events.
//
// Now access is one row per (login, registration) in ClubRegAccess. A login gets
// a row by:
//   - registering: the password on the form, or already signed in as the
//     contact (lib/claim setUpPortalLogin)
//   - the claim link in the registration letter, which proves they have the inbox
//   - registering again from the portal
//   - an invite from a director already on the registration (lib/clubInvites)
//   - staff, on the admin Users page
//   - a merge, which keeps every director of both registrations
// and never from a name match.
//
// ClubDirectorLink rows are still written next to each grant, so an older build
// (a rollback) and the pages that list a login's clubs keep working. Nothing
// reads them to decide access any more.
//
// Raw SQL, created on first use like Inquiry and RoadmapItem: it is not in
// schema.prisma, so there is no migration and no client to regenerate.
//
// THE CARRY-OVER. The first call after this shipped turns each old link into rows
// for the registrations its club name had at its event at that moment (the cutoff
// below). That is exactly what the link opened before, so nobody loses anything.
// A registration made after the cutoff is never added by name.
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { nameKey } from '@/lib/names'

const CUTOFF_KEY = 'clubAccessCutoff:v1'
const DONE_KEY = 'clubAccessCarried:v1'

export type Openable = { id: string; tournamentId: string; clubName: string }
export type Director = { userId: string; name: string; email: string; via: string; at: string }

const newId = () => crypto.randomBytes(12).toString('hex')

let ready: Promise<void> | null = null

/**
 * Create the table and carry the old links over, once per server instance.
 * Never throws: on a failure the next call tries again, and the readers below
 * treat an unreadable table as "no access".
 */
export async function ensureClubAccess(): Promise<void> {
  if (!ready) ready = setUp().catch(e => { ready = null; console.error('[clubAccess] setup failed:', e) })
  return ready
}

async function setUp(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ClubRegAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "via" TEXT NOT NULL DEFAULT '',
    "createdAt" TEXT NOT NULL DEFAULT ''
  )`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ClubRegAccess_user_reg" ON "ClubRegAccess" ("userId", "registrationId")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ClubRegAccess_reg" ON "ClubRegAccess" ("registrationId")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ClubRegAccess_user_event" ON "ClubRegAccess" ("userId", "tournamentId")`)
  await carryOverOldLinks()
}

async function insertRows(rows: [string, string, string, string][]): Promise<void> {
  const at = new Date().toISOString()
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100)
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ClubRegAccess" ("id", "userId", "registrationId", "tournamentId", "via", "createdAt") VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?)').join(', ')}`,
      ...chunk.flatMap(([userId, registrationId, tournamentId, via]) => [newId(), userId, registrationId, tournamentId, via, at]))
  }
}

async function carryOverOldLinks(): Promise<void> {
  if (await prisma.appSetting.findUnique({ where: { key: DONE_KEY } })) return
  // First writer wins, so two cold starts at once, or a retry after a failure,
  // all use the same moment.
  try { await prisma.appSetting.create({ data: { key: CUTOFF_KEY, value: new Date().toISOString() } }) } catch { /* already set */ }
  const cutRow = await prisma.appSetting.findUnique({ where: { key: CUTOFF_KEY } })
  const cutoff = new Date(cutRow?.value || 0).getTime()

  const links = await prisma.clubDirectorLink.findMany({ select: { userId: true, tournamentId: true, clubName: true } })
  const events = [...new Set(links.map(l => l.tournamentId))]
  const regs = events.length
    ? await prisma.teamRegistration.findMany({ where: { tournamentId: { in: events } }, select: { id: true, tournamentId: true, clubName: true, createdAt: true } })
    : []
  const byEventClub = new Map<string, string[]>()
  for (const r of regs) {
    if (new Date(r.createdAt).getTime() > cutoff) continue
    const k = `${r.tournamentId}|${nameKey(r.clubName)}`
    byEventClub.set(k, [...(byEventClub.get(k) || []), r.id])
  }
  const rows: [string, string, string, string][] = []
  for (const l of links) {
    for (const id of byEventClub.get(`${l.tournamentId}|${nameKey(l.clubName)}`) || []) rows.push([l.userId, id, l.tournamentId, 'carried over'])
  }
  await insertRows(rows)
  await prisma.appSetting.upsert({ where: { key: DONE_KEY }, update: { value: String(rows.length) }, create: { key: DONE_KEY, value: String(rows.length) } })
  console.log(`[clubAccess] carried ${links.length} club links over as ${rows.length} registration grants`)
}

/** Live registrations this login can open, at one event or (no tournamentId) at every event. */
export async function openableRegistrations(userId: string, tournamentId?: string): Promise<Openable[]> {
  if (!userId) return []
  await ensureClubAccess()
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT r.id AS id, r.tournamentId AS tournamentId, r.clubName AS clubName
         FROM "ClubRegAccess" a JOIN "TeamRegistration" r ON r.id = a.registrationId
        WHERE a.userId = ?${tournamentId ? ' AND r.tournamentId = ?' : ''} AND r.deletedAt IS NULL
        ORDER BY r.createdAt`,
      ...(tournamentId ? [userId, tournamentId] : [userId]))
    return rows.map(r => ({ id: String(r.id), tournamentId: String(r.tournamentId), clubName: String(r.clubName || '') }))
  } catch (e) {
    console.error('[clubAccess] read failed:', e)
    return []
  }
}

/** Can this login open this registration? (Deleted registrations: no.) */
export async function canOpen(userId: string, registrationId: string): Promise<boolean> {
  if (!userId || !registrationId) return false
  await ensureClubAccess()
  try {
    const rows: unknown[] = await prisma.$queryRawUnsafe(
      `SELECT 1 AS ok FROM "ClubRegAccess" a JOIN "TeamRegistration" r ON r.id = a.registrationId
        WHERE a.userId = ? AND a.registrationId = ? AND r.deletedAt IS NULL LIMIT 1`, userId, registrationId)
    return rows.length > 0
  } catch { return false }
}

/** Give a login one registration. Idempotent; never throws. */
export async function grantAccess(userId: string, registrationId: string, via: string): Promise<boolean> {
  if (!userId || !registrationId) return false
  await ensureClubAccess()
  try {
    const reg = await prisma.teamRegistration.findUnique({ where: { id: registrationId }, select: { tournamentId: true, clubName: true } })
    if (!reg) return false
    await insertRows([[userId, registrationId, reg.tournamentId, via]])
    try {
      await prisma.clubDirectorLink.upsert({
        where: { userId_tournamentId_clubName: { userId, tournamentId: reg.tournamentId, clubName: reg.clubName } },
        update: {},
        create: { userId, tournamentId: reg.tournamentId, clubName: reg.clubName },
      })
    } catch { /* the listing row is a convenience; the grant above is what counts */ }
    return true
  } catch (e) {
    console.error('[clubAccess] grant failed:', e)
    return false
  }
}

/**
 * Staff linking a login to a club at an event (admin Users page): every live
 * registration of that name there now. A person deciding, so a name is fine here.
 */
export async function grantByClubName(userId: string, tournamentId: string, clubName: string): Promise<number> {
  const key = nameKey(clubName)
  if (!userId || !tournamentId || !key) return 0
  const regs = await prisma.teamRegistration.findMany({ where: { tournamentId, deletedAt: null }, select: { id: true, clubName: true } })
  let n = 0
  for (const r of regs) if (nameKey(r.clubName) === key && await grantAccess(userId, r.id, 'staff')) n++
  return n
}

/** Staff removing that link: the login loses every registration of that name at that event. */
export async function revokeByClubName(userId: string, tournamentId: string, clubName: string): Promise<void> {
  const key = nameKey(clubName)
  if (!userId || !tournamentId || !key) return
  await ensureClubAccess()
  const regs = await prisma.teamRegistration.findMany({ where: { tournamentId }, select: { id: true, clubName: true } })
  const ids = regs.filter(r => nameKey(r.clubName) === key).map(r => r.id)
  if (ids.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ClubRegAccess" WHERE "userId" = ? AND "registrationId" IN (${ids.map(() => '?').join(', ')})`, userId, ...ids)
  }
  const links = await prisma.clubDirectorLink.findMany({ where: { userId, tournamentId } })
  const gone = links.filter(l => nameKey(l.clubName) === key).map(l => l.id)
  if (gone.length) await prisma.clubDirectorLink.deleteMany({ where: { id: { in: gone } } })
}

/** A merge keeps every director of both registrations on the one that survives. */
export async function copyAccess(fromRegistrationId: string, toRegistrationId: string): Promise<void> {
  if (!fromRegistrationId || !toRegistrationId || fromRegistrationId === toRegistrationId) return
  await ensureClubAccess()
  try {
    const from: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "userId" FROM "ClubRegAccess" WHERE "registrationId" = ?`, fromRegistrationId)
    for (const r of from) await grantAccess(String(r.userId), toRegistrationId, 'merged')
  } catch (e) { console.error('[clubAccess] copy on merge failed:', e) }
}

/** Who can open each registration, with their login's name and email. */
export async function directorsOf(registrationIds: string[]): Promise<Map<string, Director[]>> {
  const out = new Map<string, Director[]>()
  const ids = [...new Set(registrationIds.filter(Boolean))]
  if (!ids.length) return out
  await ensureClubAccess()
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT a.registrationId AS rid, u.id AS uid, u.name AS name, u.email AS email, a.via AS via, a.createdAt AS at
         FROM "ClubRegAccess" a JOIN "User" u ON u.id = a.userId
        WHERE a.registrationId IN (${ids.map(() => '?').join(', ')})
        ORDER BY a.createdAt`, ...ids)
    for (const r of rows) {
      const rid = String(r.rid)
      out.set(rid, [...(out.get(rid) || []), {
        userId: String(r.uid), name: String(r.name || ''), email: String(r.email || '').trim().toLowerCase(),
        via: String(r.via || ''), at: String(r.at || ''),
      }])
    }
  } catch (e) { console.error('[clubAccess] directors read failed:', e) }
  return out
}

/**
 * The club names (nameKey) a login shares with a registration it CAN'T open at
 * the same event.
 *
 * Player and coach waivers, and player registrations, are filed under a club
 * name, not a registration. When two registrations at one event carry the same
 * name and this login holds only one of them, a waiver under that name could
 * belong to either, so none of them is shown until the office merges the two or
 * renames one. Different events are unaffected: waivers are per event.
 * On a read failure every name counts as shared: these are children's details.
 */
export async function sharedClubKeys(tournamentId: string, mine: Openable[]): Promise<Set<string>> {
  const myKeys = new Set(mine.map(r => nameKey(r.clubName)).filter(Boolean))
  const shared = new Set<string>()
  if (!myKeys.size) return shared
  const myIds = new Set(mine.map(r => r.id))
  try {
    const all = await prisma.teamRegistration.findMany({ where: { tournamentId, deletedAt: null }, select: { id: true, clubName: true } })
    for (const r of all) {
      const k = nameKey(r.clubName)
      if (myKeys.has(k) && !myIds.has(r.id)) shared.add(k)
    }
    return shared
  } catch {
    return myKeys
  }
}
