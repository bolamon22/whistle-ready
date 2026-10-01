import { prisma } from '@/lib/db'
import { cleanName, nameKey, teamRefKey } from '@/lib/names'
import { sendToSubscriptions } from '@/lib/push'
import { isRealTeam } from '@/lib/autoSchedule'

// Following a team, and the phone that follows it.
//
// A follow is "this device wants to hear about this team at this event". It is
// keyed by a device id the browser makes up once and keeps in localStorage --
// no account, one tap -- so the same id is what a push subscription hangs off.
// That is the whole reason the two live together here: delivery is a join from
// the follow table to FollowerDevice, nothing more.
//
// A team is a (division, name) pair. The first version keyed follows by name
// alone, and the same club fields "Miami Reign" in Boys HS A, Boys HS B and
// Boys U14 B: one tap followed all three, the count showed on all three, and a
// final in one division would have buzzed the parents of the other two (Bo,
// Oct 1). Every lookup here now takes the division too, matched loosely on
// both parts (divKey / teamKey are nameKey() of each), and the day-one rows
// are carried over by `migrateNameOnlyFollows` -- a name that exists in several
// divisions is copied into each, which is exactly what the follower saw.
//
// Raw SQL, like ClubDirectorLink and Organization: created lazily on first use,
// kept out of schema.prisma, so a deploy needs no migration step and prisma
// generate is not on the path. Every write here is best-effort from the
// caller's point of view -- a follow that fails to save must never break the
// page, and a push that fails must never break a Publish.
//
// "TeamFollow2" is the division-aware table; the original "TeamFollow" (name
// only) is left in place, untouched, as the backup of day one. Rebuilding it in
// place was the alternative, and two serverless instances racing a
// CREATE/INSERT/DROP/RENAME sequence can drop each other's copy.

export type TeamRef = { division: string; team: string }

let ready: Promise<void> | null = null
export function ensureFollowTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TeamFollow2" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "tournamentId" TEXT NOT NULL,
        "division" TEXT NOT NULL DEFAULT '',
        "teamName" TEXT NOT NULL,
        "divKey" TEXT NOT NULL DEFAULT '',
        "teamKey" TEXT NOT NULL DEFAULT '',
        "deviceId" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE("deviceId","tournamentId","divKey","teamKey")
      )`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TeamFollow2_team" ON "TeamFollow2"("tournamentId","divKey","teamKey")`)
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
      try { await migrateNameOnlyFollows() } catch (e) { console.error('[follows] carrying over name-only follows failed (will retry next cold start):', e) }
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

/**
 * Copy the day-one, name-only follows into the division-aware table, once.
 * Runs only while the new table is empty and the old one exists. A name that
 * plays in several divisions becomes one follow per division -- that is what
 * the follower was seeing, and one tap per extra team puts it right. Ids are
 * derived from the old ids and inserted OR IGNORE, so two instances running
 * this at once, or a retry, cannot double anything.
 */
async function migrateNameOnlyFollows(): Promise<number> {
  const old = (await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'TeamFollow'`)) as { name: string }[]
  if (!old.length) return 0
  const have = (await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM "TeamFollow2"`)) as { n: number | bigint }[]
  if (Number(have[0]?.n ?? 0) > 0) return 0
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "id", "tournamentId", "teamName", "deviceId", "createdAt" FROM "TeamFollow"`,
  )) as { id: string; tournamentId: string; teamName: string; deviceId: string; createdAt: string }[]
  if (!rows.length) return 0
  const rosters = new Map<string, TeamRef[]>()
  let copied = 0
  for (const r of rows) {
    if (!rosters.has(r.tournamentId)) rosters.set(r.tournamentId, await teamDivisions(r.tournamentId))
    const want = nameKey(r.teamName)
    const matches = rosters.get(r.tournamentId)!.filter(t => nameKey(t.team) === want)
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i]
      await prisma.$executeRawUnsafe(
        `INSERT OR IGNORE INTO "TeamFollow2" ("id","tournamentId","division","teamName","divKey","teamKey","deviceId","createdAt") VALUES (?,?,?,?,?,?,?,?)`,
        i === 0 ? r.id : `${r.id}~${i}`, r.tournamentId, m.division, m.team, nameKey(m.division), nameKey(m.team), r.deviceId, r.createdAt,
      )
      copied++
    }
  }
  if (copied) console.log(`[follows] carried ${copied} follow(s) over from ${rows.length} name-only row(s)`)
  return copied
}

/** The id the browser minted: 8-64 chars of [A-Za-z0-9_-]. Anything else is not one. */
export const isDeviceId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(v)

/** Nobody follows this many teams at one event. Bounds what one scripted device
 *  can do to the counts; a real parent never gets near it. */
export const MAX_FOLLOWS_PER_EVENT = 40

const newId = () => `tf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

// ---- which teams exist ------------------------------------------------------------

/**
 * Every team at this event and the division it plays in, from three sources:
 * registered teams, pool lists, and the schedule (CSV-import events have only
 * the last two). Bracket placeholders ("Seed 1", "W-B3") are not teams and are
 * left out. One entry per (division, name); registered spelling wins over pool
 * spelling over schedule spelling, matched loosely so "ghost" and "Ghost " are
 * one team -- but "Ghost" in HS A and "Ghost" in U14 are two.
 */
export async function teamDivisions(tournamentId: string): Promise<TeamRef[]> {
  const out = new Map<string, TeamRef>()
  const add = (team: unknown, division: unknown) => {
    const t = cleanName(team), d = cleanName(division)
    if (!nameKey(t) || !isRealTeam(t)) return
    const k = teamRefKey(d, t)
    if (!out.has(k)) out.set(k, { team: t, division: d })
  }
  try {
    const reg = await prisma.registeredTeam.findMany({
      where: { registration: { tournamentId, deletedAt: null } },
      select: { teamName: true, division: true },
    })
    reg.forEach((r: { teamName: string; division: string }) => add(r.teamName, r.division))
  } catch { /* fall through */ }
  try {
    const pools = await prisma.pool.findMany({ where: { tournamentId }, select: { division: true, teamNames: true } })
    for (const p of pools) {
      let names: unknown[] = []
      try { names = JSON.parse(p.teamNames || '[]') } catch { continue }
      if (Array.isArray(names)) names.forEach(n => add(n, p.division))
    }
  } catch { /* fall through */ }
  try {
    const games = await prisma.game.findMany({ where: { tournamentId }, select: { team1: true, team2: true, division: true } })
    for (const g of games) { add(g.team1, g.division); add(g.team2, g.division) }
  } catch { /* fall through */ }
  return Array.from(out.values())
}

/** The teams playing in `division` at this event (see teamDivisions). */
export async function teamsInDivision(tournamentId: string, division: string): Promise<TeamRef[]> {
  const want = nameKey(division)
  return (await teamDivisions(tournamentId)).filter(t => nameKey(t.division) === want)
}

/**
 * The team as the app spells it, or null if no such team plays in that
 * division here. Follows are only accepted for teams that exist. A division
 * that is blank or unknown matches nothing: a name alone is not a team.
 */
export async function canonicalTeam(tournamentId: string, division: string, name: string): Promise<TeamRef | null> {
  const want = teamRefKey(division, name)
  if (!nameKey(division) || !nameKey(name)) return null
  return (await teamDivisions(tournamentId)).find(t => teamRefKey(t.division, t.team) === want) ?? null
}

// ---- following -----------------------------------------------------------------------

export type SetFollowResult =
  | { ok: true; following: TeamRef[]; count: number; team: TeamRef }
  | { ok: false; error: 'unknown_team' | 'too_many' | 'bad_request' }

/** Follow or unfollow one team in one division. Idempotent: following twice is
 *  one follow, unfollowing something never followed is fine. Returns the
 *  device's full list afterwards so the page never has to guess at its own state. */
export async function setFollow(tournamentId: string, deviceId: string, division: string, rawName: string, follow: boolean): Promise<SetFollowResult> {
  if (!isDeviceId(deviceId) || !tournamentId) return { ok: false, error: 'bad_request' }
  await ensureFollowTables()
  const team = await canonicalTeam(tournamentId, division, rawName)
  if (!team) return { ok: false, error: 'unknown_team' }
  const divKey = nameKey(team.division), teamKey = nameKey(team.team)

  if (follow) {
    const have = await listFollowing(tournamentId, deviceId)
    const already = have.some(t => teamRefKey(t.division, t.team) === teamRefKey(team.division, team.team))
    if (!already && have.length >= MAX_FOLLOWS_PER_EVENT) return { ok: false, error: 'too_many' }
    // The UNIQUE constraint makes this the check-and-insert in one step; two
    // taps racing each other cannot make two rows.
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "TeamFollow2" ("id","tournamentId","division","teamName","divKey","teamKey","deviceId") VALUES (?,?,?,?,?,?,?)`,
      newId(), tournamentId, team.division, team.team, divKey, teamKey, deviceId,
    )
  } else {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "TeamFollow2" WHERE "deviceId" = ? AND "tournamentId" = ? AND "divKey" = ? AND "teamKey" = ?`,
      deviceId, tournamentId, divKey, teamKey,
    )
  }
  const [following, count] = await Promise.all([listFollowing(tournamentId, deviceId), followerCount(tournamentId, team)])
  return { ok: true, following, count, team }
}

export async function listFollowing(tournamentId: string, deviceId: string): Promise<TeamRef[]> {
  if (!isDeviceId(deviceId)) return []
  await ensureFollowTables()
  // rowid breaks ties: CURRENT_TIMESTAMP is whole seconds, and two taps in one
  // second must still come back in the order they were made.
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "division", "teamName" FROM "TeamFollow2" WHERE "tournamentId" = ? AND "deviceId" = ? ORDER BY "createdAt", rowid`, tournamentId, deviceId,
  )) as { division: string; teamName: string }[]
  return rows.map(r => ({ division: r.division, team: r.teamName }))
}

export async function followerCount(tournamentId: string, team: TeamRef): Promise<number> {
  await ensureFollowTables()
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM "TeamFollow2" WHERE "tournamentId" = ? AND "divKey" = ? AND "teamKey" = ?`,
    tournamentId, nameKey(team.division), nameKey(team.team),
  )) as { n: number | bigint }[]
  return Number(rows[0]?.n ?? 0)
}

/** Every team's follower count for the event, in one query, keyed by teamRefKey(division, team). */
export async function followerCounts(tournamentId: string): Promise<Record<string, number>> {
  await ensureFollowTables()
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT "divKey", "teamKey", COUNT(*) AS n FROM "TeamFollow2" WHERE "tournamentId" = ? GROUP BY "divKey", "teamKey"`, tournamentId,
  )) as { divKey: string; teamKey: string; n: number | bigint }[]
  const out: Record<string, number> = {}
  for (const r of rows) out[`${r.divKey}|${r.teamKey}`] = Number(r.n)
  return out
}

/** Per team, how many following phones actually have alerts on, keyed like
 *  followerCounts. The dialog shows this beside the follower count: a follow
 *  with alerts off hears nothing, and "41 followers" would overstate who a
 *  Publish reaches. */
export async function followerPhoneCounts(tournamentId: string): Promise<Record<string, number>> {
  await ensureFollowTables()
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT f."divKey", f."teamKey", COUNT(DISTINCT d."deviceId") AS n
       FROM "TeamFollow2" f JOIN "FollowerDevice" d ON d."deviceId" = f."deviceId"
      WHERE f."tournamentId" = ? AND d."endpoint" <> '' GROUP BY f."divKey", f."teamKey"`, tournamentId,
  )) as { divKey: string; teamKey: string; n: number | bigint }[]
  const out: Record<string, number> = {}
  for (const r of rows) out[`${r.divKey}|${r.teamKey}`] = Number(r.n)
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

// ---- who a message would reach ---------------------------------------------------

export type Reach = { follows: number; phones: number }

/**
 * How many people a message would reach: distinct devices following any team
 * in the audience, and how many of those have alerts on. Counted per device,
 * not per follow -- a parent following two of the teams is one person and one
 * phone. Returned per team (keyed by teamRefKey), per division and for the
 * whole event in one pass, so the Broadcast page can show the reach of
 * whatever audience is picked without a round trip per click.
 */
export async function followerReach(tournamentId: string): Promise<{
  event: Reach
  divisions: Record<string, Reach & { teams: string[] }>
  teams: Record<string, Reach>
}> {
  await ensureFollowTables()
  const [rows, roster] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT f."divKey", f."teamKey", f."deviceId", CASE WHEN d."endpoint" <> '' THEN 1 ELSE 0 END AS "hasPush"
         FROM "TeamFollow2" f LEFT JOIN "FollowerDevice" d ON d."deviceId" = f."deviceId"
        WHERE f."tournamentId" = ?`, tournamentId,
    ) as Promise<{ divKey: string; teamKey: string; deviceId: string; hasPush: number | bigint }[]>,
    teamDivisions(tournamentId),
  ])
  type Tally = { all: Set<string>; on: Set<string> }
  const tally = (): Tally => ({ all: new Set(), on: new Set() })
  const count = (t: Tally, r: { deviceId: string; hasPush: number | bigint }) => { t.all.add(r.deviceId); if (Number(r.hasPush)) t.on.add(r.deviceId) }
  const reach = (t: Tally | undefined): Reach => ({ follows: t?.all.size ?? 0, phones: t?.on.size ?? 0 })

  // The roster's spelling of each division, by key, so the page gets names it can show.
  const divisionName = new Map(roster.map(t => [nameKey(t.division), t.division]))
  const ev = tally()
  const byDiv = new Map<string, Tally>()
  const byTeam = new Map<string, Tally>()
  for (const r of rows) {
    if (!byDiv.has(r.divKey)) byDiv.set(r.divKey, tally())
    const tk = `${r.divKey}|${r.teamKey}`
    if (!byTeam.has(tk)) byTeam.set(tk, tally())
    count(ev, r); count(byDiv.get(r.divKey)!, r); count(byTeam.get(tk)!, r)
  }

  const divisions: Record<string, Reach & { teams: string[] }> = {}
  for (const t of roster) {
    const name = divisionName.get(nameKey(t.division)) ?? t.division
    if (!divisions[name]) divisions[name] = { ...reach(byDiv.get(nameKey(t.division))), teams: [] }
    divisions[name].teams.push(t.team)
  }
  for (const d of Object.values(divisions)) d.teams.sort((a, b) => a.localeCompare(b))
  const teams: Record<string, Reach> = {}
  for (const [key, t] of byTeam) teams[key] = reach(t)
  return { event: reach(ev), divisions, teams }
}

// ---- delivery (Publish, Broadcast and finals call this) --------------------------------

/** The phones following any of these teams at this event, one per device even
 *  if it follows several of them -- a parent with two kids on two of the teams
 *  gets one message, not two. `null` = every phone following any team here. */
export async function followerDevices(tournamentId: string, teams: TeamRef[] | null): Promise<PushKeys[]> {
  await ensureFollowTables()
  let where = '', args: string[] = []
  if (teams !== null) {
    const seen = new Set<string>()
    const pairs: [string, string][] = []
    for (const t of teams) {
      const dk = nameKey(t.division), tk = nameKey(t.team)
      if (!dk || !tk || seen.has(`${dk}|${tk}`)) continue
      seen.add(`${dk}|${tk}`); pairs.push([dk, tk])
    }
    if (!pairs.length) return []
    where = ` AND (${pairs.map(() => '(f."divKey" = ? AND f."teamKey" = ?)').join(' OR ')})`
    args = pairs.flat()
  }
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT DISTINCT d."endpoint", d."p256dh", d."auth"
       FROM "TeamFollow2" f JOIN "FollowerDevice" d ON d."deviceId" = f."deviceId"
      WHERE f."tournamentId" = ?${where} AND d."endpoint" <> ''`,
    tournamentId, ...args,
  )) as { endpoint: string; p256dh: string; auth: string }[]
  return rows.map(r => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }))
}

/**
 * Push one message to everyone following any of `teams` (`null` = anyone
 * following any team at this event). Never throws. Subscriptions the push
 * service reports gone (404/410) are cleared, so a phone that uninstalled
 * stops costing a send.
 */
export async function sendPushToFollowers(
  tournamentId: string,
  teams: TeamRef[] | null,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ sent: number; failed: number }> {
  try {
    const devices = await followerDevices(tournamentId, teams)
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

/** A team was renamed: move its follows with it. Scoped to one division when
 *  given (the usual case -- the caller knows which team it renamed); a blank
 *  division renames the name wherever it appears, for the admin clean-up pass. */
export async function renameFollowRefs(tournamentId: string, oldName: string, newName: string, division?: string): Promise<number> {
  await ensureFollowTables()
  const oldKey = nameKey(oldName), newKey = nameKey(newName), clean = cleanName(newName)
  if (!oldKey || !newKey || oldKey === newKey && clean === cleanName(oldName)) return 0
  const divScope = division ? ` AND o."divKey" = ?` : ''
  const scopeArgs = division ? [nameKey(division)] : []
  // A device already following the new name in that division would collide on
  // the UNIQUE; drop its old-name row rather than fail the rename.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "TeamFollow2" WHERE "id" IN (
       SELECT o."id" FROM "TeamFollow2" o JOIN "TeamFollow2" n
         ON n."deviceId" = o."deviceId" AND n."tournamentId" = o."tournamentId" AND n."divKey" = o."divKey" AND n."teamKey" = ?
      WHERE o."tournamentId" = ? AND o."teamKey" = ?${divScope})`,
    newKey, tournamentId, oldKey, ...scopeArgs,
  )
  const r = await prisma.$executeRawUnsafe(
    `UPDATE "TeamFollow2" SET "teamName" = ?, "teamKey" = ? WHERE "tournamentId" = ? AND "teamKey" = ?${division ? ' AND "divKey" = ?' : ''}`,
    clean, newKey, tournamentId, oldKey, ...scopeArgs,
  )
  return Number(r) || 0
}

/** A team left the event: its follows go with it, in that division only when given. */
export async function removeFollowRefs(tournamentId: string, teamName: string, division?: string): Promise<number> {
  await ensureFollowTables()
  const key = nameKey(teamName)
  if (!key) return 0
  const r = division
    ? await prisma.$executeRawUnsafe(`DELETE FROM "TeamFollow2" WHERE "tournamentId" = ? AND "teamKey" = ? AND "divKey" = ?`, tournamentId, key, nameKey(division))
    : await prisma.$executeRawUnsafe(`DELETE FROM "TeamFollow2" WHERE "tournamentId" = ? AND "teamKey" = ?`, tournamentId, key)
  return Number(r) || 0
}
