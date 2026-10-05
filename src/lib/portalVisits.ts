// WHO IS USING THE CLUB PORTAL, AND HOW OFTEN.
//
// Bo, Oct 5 2026: "can we time stamp club director log ins? it would be nice to
// know if they are using the portal and how often. it could go on the
// registration page."
//
// A sign-in is the wrong thing to count. A login stays signed in for weeks, so a
// director who checks the portal every day would show one sign-in a month. What
// is recorded is the portal itself being opened: a row each time a director's
// portal loads an event (api/club-director/data), at most one per login and
// registration every VISIT_GAP_MIN minutes. Reloads, tab switches and the refresh
// after every save inside one sitting count once.
//
// Never counted: staff opening a club's portal with ?userId= (that is the office
// checking, not the club using it), and staff accounts' own visits.
//
// Raw SQL, made on first use like ClubRegAccess (lib/clubAccess). Recording
// never throws: a portal that loads matters more than the count.
import crypto from 'crypto'
import { prisma } from '@/lib/db'

/** Minutes between two portal opens for them to count as separate visits. */
export const VISIT_GAP_MIN = 30
const STAFF_ROLES = new Set(['admin', 'director'])
const DAY = 86400000

export type PortalUsage = {
  /** ISO times of the most recent and the first recorded visit. */
  last: string; first: string
  /** Who opened it last (name, or email when there is no name). */
  lastBy: string
  /** Visits in the last 7 and 30 days, and in all. */
  week: number; month: number; total: number
  /** How many different logins have opened it. */
  people: number
}

const newId = () => crypto.randomBytes(12).toString('hex')

let ready: Promise<void> | null = null

/** Make the table once per server instance. A failure is retried on the next call. */
export function ensurePortalVisits(): Promise<void> {
  if (!ready) ready = setUp().catch(e => { ready = null; console.error('[portalVisits] setup failed:', e) })
  return ready
}

async function setUp(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "PortalVisit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "at" TEXT NOT NULL
  )`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PortalVisit_reg_at" ON "PortalVisit" ("registrationId", "at")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PortalVisit_user_reg_at" ON "PortalVisit" ("userId", "registrationId", "at")`)
}

/**
 * Note that this login opened its portal on these registrations. A registration
 * it already opened in the last VISIT_GAP_MIN minutes is the same visit and adds
 * nothing. `role` is the session's; staff roles are never recorded.
 */
export async function recordPortalVisit(userId: string, tournamentId: string, registrationIds: string[], role = '', now = new Date()): Promise<void> {
  const ids = [...new Set(registrationIds.filter(Boolean))]
  if (!userId || !ids.length || STAFF_ROLES.has(role)) return
  try {
    await ensurePortalVisits()
    const at = now.toISOString()
    const since = new Date(now.getTime() - VISIT_GAP_MIN * 60000).toISOString()
    // One statement per registration: insert only if this login has no visit to
    // it inside the window (30 minutes on the dot is still inside). The check and
    // the insert are one round trip.
    await Promise.all(ids.map(regId => prisma.$executeRawUnsafe(
      `INSERT INTO "PortalVisit" ("id", "userId", "registrationId", "tournamentId", "at")
       SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM "PortalVisit" WHERE "userId" = ? AND "registrationId" = ? AND "at" >= ?
       )`,
      newId(), userId, regId, String(tournamentId || ''), at, userId, regId, since)))
  } catch (e) {
    console.error('[portalVisits] record failed:', e)
  }
}

/** Portal use per registration, for the registrations page. Registrations never opened are absent. */
export async function portalUsage(registrationIds: string[], now = new Date()): Promise<Map<string, PortalUsage>> {
  const out = new Map<string, PortalUsage>()
  const ids = [...new Set(registrationIds.filter(Boolean))]
  if (!ids.length) return out
  try {
    await ensurePortalVisits()
    const week = new Date(now.getTime() - 7 * DAY).toISOString()
    const month = new Date(now.getTime() - 30 * DAY).toISOString()
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      const marks = chunk.map(() => '?').join(',')
      // COUNT and SUM come back as BigInt from libSQL; Number() before they reach JSON.
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT "registrationId" AS reg, COUNT(*) AS total, COUNT(DISTINCT "userId") AS people,
                MIN("at") AS first, MAX("at") AS last,
                SUM(CASE WHEN "at" >= ? THEN 1 ELSE 0 END) AS week,
                SUM(CASE WHEN "at" >= ? THEN 1 ELSE 0 END) AS month
         FROM "PortalVisit" WHERE "registrationId" IN (${marks}) GROUP BY "registrationId"`,
        week, month, ...chunk)
      const lasts: any[] = await prisma.$queryRawUnsafe(
        `SELECT v."registrationId" AS reg, u."name" AS name, u."email" AS email
         FROM "PortalVisit" v LEFT JOIN "User" u ON u."id" = v."userId"
         WHERE v."registrationId" IN (${marks})
           AND v."at" = (SELECT MAX(w."at") FROM "PortalVisit" w WHERE w."registrationId" = v."registrationId")`,
        ...chunk)
      const lastBy = new Map(lasts.map(l => [String(l.reg), String(l.name || l.email || '').trim()]))
      for (const r of rows) {
        out.set(String(r.reg), {
          last: String(r.last || ''), first: String(r.first || ''), lastBy: lastBy.get(String(r.reg)) || '',
          week: Number(r.week) || 0, month: Number(r.month) || 0, total: Number(r.total) || 0, people: Number(r.people) || 0,
        })
      }
    }
  } catch (e) {
    console.error('[portalVisits] read failed:', e)
  }
  return out
}
