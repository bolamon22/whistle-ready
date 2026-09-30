import { prisma } from '@/lib/db'
import { cleanName, nameKey } from '@/lib/names'
import { sendToSubscriptions } from '@/lib/push'

// Following a team, and the phone that follows it.
//
// A follow is "this device wants to hear about this team at this event". It is
// keyed by a device id the browser makes up once and keeps in localStorage --
// no account, one tap -- so the same id is what a push subscription hangs off.
// That is the whole reason the two live together here: delivery is a join from
// TeamFollow to FollowerDevice, nothing more.
//
// Before this, Follow on the public page saved only to the visitor's own browser.
// Nothing knew who followed what, so nothing could be counted and nothing could
// be sent. "Get Notified" stored an email address in the same place and told
// the parent they were all set; nobody was.
//
// Raw SQL, like ClubDirectorLink and Organization: created lazily on first use,
// kept out of schema.prisma, so a deploy needs no migration step and prisma
// generate is not on the path. Every write here is best-effort from the
// caller's point of view -- a follow that fails to save must never break the
// page, and a push that fails must never break a Publish.

let ready: Promise<void> | null = null
export function ensureFollowTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TeamFollow" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tournamentId" TEXT NOT NULL,
        "teamName" TEXT NOT NULL,
        "deviceId" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("deviceId","tournamentId","teamName")
      )`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TeamFollow_team" ON "TeamFollow"("tournamentId","teamName")`)
      // One row per browser. The push subscription is optional: a device can
      // follow without ever turning alerts on, and still counts as a follower.
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "FollowerDevice" (
        "deviceId" TEXT NOT NULL PRIMARY KEY,
        "endpoint" TEXT NOT NULL DEFAULT '',
        "p256dh" TEXT NOT NULL DEFAULT '',
        "auth" TEXT NOT NULL DEFAULT '',
        "label" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

/** The id the browser minted: 8-64 chars of [A-Za-z0-9_-]. Anything else is not one. */
export const isDeviceId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v)

/** Nobody follows this many teams at one event. Bounds what one scripted device
 *  can do to the counts; a real parent never gets near it. */
export const MAX_FOLLOWS_PER_EVENT = 40

const newId = () => `tf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

/**
 * The team's canonical name in this tournament, or null if no such team.
 *
 * Follows are only accepted for teams that exist -- registered, in a pool, or
 * on the schedule (CSV-import events have games and pools but no registration
 * rows). Matched loosely, stored as the app spells it, so "ghost" and "Ghost "
 * count toward one team rather than three.
 */
export async function canonicalTeamName(tournamentId: string, name: string): Promise<string | null> {
  const want = nameKey(name)
  if (!want) return null
  try {
    const reg = await prisma.registeredTeam.findMany({
      where: { registration: { tournamentId, deletedAt: null } },
      select: { teamName: true },
    })
    const hit = reg.find((t: { teamName: string }) => nameKey(t.teamName) === want)
    if (hit) return cleanName(hit.teamName)
  } catch { /* fall through */ }
  try {
    const pools = await prisma.pool.findMany({ where: { tournamentId }, select: { teamNames: true } })
    for (const p of pools) {
      let names: string[] = []
      try { names = JSON.parse(p.teamNames || '[]') } catch { continue }
      const hit = Array.isArray(names) ? names.find(n => typeof n === 'string' && nameKey(n) === want) : undefined
      if (hit) return cleanName(hit)
    }
  } catch { /* fall through */ }
  try {
    const games = await prisma.game.findMany({ where: { tournamentId }, select: { team1: true, team2: true } })
    for (const g of games) {
      if (nameKey(g.team1) === want) return cleanName(g.team1)
      if (nameKey(g.team2) === want) return cleanName(g.team2)
    }
  } catch { /* fall through */ }
  return null
}

export type SetFollowResult =
  | { ok: true; following: string[]; count: number; teamName: string }
  | { ok: false; error: 'unknown_team' | 'too_many' | 'bad_request' }

/** Follow or unfollow. Idempotent: following twice is one follow, unfollowing
 *  something never followed is fine. Returns the device's full list afterwards
 *  so the page never has to guess at its own state. */
export async function setFollow(tournamentId: string, deviceId: string, rawName: string, follow: boolean): Promise<SetFollowResult> {
  if (!isDeviceId(deviceId) || !tournamentId) return { ok: false, error: 'bad_request' }
  await ensureFollowTables()
  const teamName = await canonicalTeamName(tournamentId, rawName)
  if (!teamName) return { ok: false, error: 'unknown_team' }

  if (follow) {
    const have = await listFollowing(tournamentId, deviceId)
    if (!have.includes(teamName) && have.length >= MAX_FOLLOWS_PER_EVENT) return { ok: false, error: 'too_many' }
    // The UNIQUE constraint makes this the check-and-insert in one step; two
    // taps racing each other cannot make two rows.
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "TeamFollow" ("id","tournamentId","teamName","deviceId") VALUES (?,?,?,?)`,
      newId(), tournamentId, teamName, deviceId,
    )
  } else {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "TeamFollow" WHERE "deviceId" = ? AND "tournamentId" = ? AND "teamName" = ?`,
      deviceId, tournamentId, teamName,
    )
  }
  const [following, count] = await Promise.all([listFollowing(tournamentId, deviceId), followerCount(tournamentId, teamName)])
  return { ok: true, following, count, teamName }
}

export async function listFollowing(tournamentId: string, deviceId: string): Promise<string[]> {
  if (!isDeviceId(deviceId)) return []
  await ensureFollowTables()
  const rows = (await prisma.$queryRawUnsafe(
    // rowid breaks the tie: CURRENT_TIMESTAMP is whole seconds, and two follows
    // in the same second came back in either order.
    `SELECT "teamName" FROM "TeamFollow" WHERE "deviceId" = ? AND "tournamentId" = ? ORDER BY "createdAt", rowid`,
    deviceId, tournamentId,
  )) as { teamName: string }[]
  return rows.map(r => r.teamName)
}

export async function followerCount(tournamentId: string, teamName: string): Promise<number> {
  await ensureFollowTables()
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM "TeamFollow" WHERE "tournamentId" = ? AND "teamName" = ?`, tournamentId, teamName,
  )) as { n: number | bigint }[]
  return Number(rows[0]?.n ?? 0)
}

/** Every team's follower count for the event, in one query. */
export async function followerCounts(tournamentId: string): Promise<Record<string, number>> {
  await ensureFollowTables()
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "teamName", COUNT(*) AS n FROM "TeamFollow" WHERE "tournamentId" = ? GROUP BY "teamName"`, tournamentId,
  )) as { teamName: string; n: number | bigint }[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.teamName] = Number(r.n)
  return out
}

// ---- the device's phone -----------------------------------------------------

export type PushKeys = { endpoint: string; keys: { p256dh: string; auth: string } }

/** Save (or replace) the push subscription for a device. */
export async function saveDevicePush(deviceId: string, sub: PushKeys, label = ''): Promise<boolean> {
  if (!isDeviceId(deviceId)) return false
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return false
  await ensureFollowTables()
  await prisma.$executeRawUnsafe(
    `INSERT INTO "FollowerDevice" ("deviceId","endpoint","p256dh","auth","label") VALUES (?,?,?,?,?)
     ON CONFLICT("deviceId") DO UPDATE SET "endpoint"=excluded."endpoint", "p256dh"=excluded."p256dh", "auth"=excluded."auth", "label"=excluded."label", "updatedAt"=CURRENT_TIMESTAMP`,
    deviceId, sub.endpoint, sub.keys.p256dh, sub.keys.auth, String(label).slice(0, 80),
  )
  return true
}

/** Alerts off for this device. The follows stay -- they still count, and the
 *  page still shows them as followed; only the phone stops hearing. */
export async function clearDevicePush(deviceId: string): Promise<void> {
  if (!isDeviceId(deviceId)) return
  await ensureFollowTables()
  await prisma.$executeRawUnsafe(`UPDATE "FollowerDevice" SET "endpoint"='', "p256dh"='', "auth"='', "updatedAt"=CURRENT_TIMESTAMP WHERE "deviceId" = ?`, deviceId)
}

export async function deviceHasPush(deviceId: string): Promise<boolean> {
  if (!isDeviceId(deviceId)) return false
  await ensureFollowTables()
  const rows = (await prisma.$queryRawUnsafe(`SELECT "endpoint" FROM "FollowerDevice" WHERE "deviceId" = ?`, deviceId)) as { endpoint: string }[]
  return !!rows[0]?.endpoint
}

// ---- delivery (steps 2-4 call this) ---------------------------------------------

/** The phones following any of these teams at this event, one per device even
 *  if it follows several of them -- a parent with two kids on two of the teams
 *  gets one message, not two. */
export async function followerDevices(tournamentId: string, teamNames: string[]): Promise<PushKeys[]> {
  // Not `.map(cleanName)`: its second parameter is a max length, and map would
  // pass the index -- cleanName('Ghost', 0) is '', and nobody gets the alert.
  const names = Array.from(new Set(teamNames.map(n => cleanName(n)).filter(Boolean)))
  if (!names.length) return []
  await ensureFollowTables()
  const marks = names.map(() => '?').join(',')
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT DISTINCT d."endpoint", d."p256dh", d."auth"
       FROM "TeamFollow" f JOIN "FollowerDevice" d ON d."deviceId" = f."deviceId"
      WHERE f."tournamentId" = ? AND f."teamName" IN (${marks}) AND d."endpoint" <> ''`,
    tournamentId, ...names,
  )) as { endpoint: string; p256dh: string; auth: string }[]
  return rows.map(r => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }))
}

/**
 * Push one message to everyone following any of `teamNames`. Never throws.
 * Subscriptions the push service reports gone (404/410) are cleared, so a
 * phone that uninstalled stops costing a send.
 */
export async function sendPushToFollowers(
  tournamentId: string,
  teamNames: string[],
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ sent: number; failed: number }> {
  try {
    const devices = await followerDevices(tournamentId, teamNames)
    if (!devices.length) return { sent: 0, failed: 0 }
    const { sent, failed, gone: dead } = await sendToSubscriptions(devices, payload)
    if (dead.length) {
      const marks = dead.map(() => '?').join(',')
      await prisma.$executeRawUnsafe(`UPDATE "FollowerDevice" SET "endpoint"='', "p256dh"='', "auth"='' WHERE "endpoint" IN (${marks})`, ...dead)
    }
    return { sent, failed }
  } catch (e) {
    console.error('[follows] sendPushToFollowers failed (non-blocking):', e)
    return { sent: 0, failed: 0 }
  }
}

// ---- keeping the name key in step with the rest of the app ----------------------

export async function renameFollowRefs(tournamentId: string, oldName: string, newName: string): Promise<number> {
  await ensureFollowTables()
  // A device already following the new name would collide on the UNIQUE; drop
  // its old row rather than fail the rename.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "TeamFollow" WHERE "tournamentId" = ? AND "teamName" = ? AND "deviceId" IN (SELECT "deviceId" FROM "TeamFollow" WHERE "tournamentId" = ? AND "teamName" = ?)`,
    tournamentId, oldName, tournamentId, newName,
  )
  const n = await prisma.$executeRawUnsafe(`UPDATE "TeamFollow" SET "teamName" = ? WHERE "tournamentId" = ? AND "teamName" = ?`, newName, tournamentId, oldName)
  return Number(n) || 0
}

export async function removeFollowRefs(tournamentId: string, teamName: string): Promise<number> {
  await ensureFollowTables()
  const n = await prisma.$executeRawUnsafe(`DELETE FROM "TeamFollow" WHERE "tournamentId" = ? AND "teamName" = ?`, tournamentId, teamName)
  return Number(n) || 0
}
