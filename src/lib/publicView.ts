import { prisma } from '@/lib/db'

// What the public is allowed to see of a tournament's schedule.
//
// Two switches, stored on Tournament as raw columns (like the publish snapshot):
//   publicPools    -- teams, pool lists and standings
//   publicSchedule -- the games: matchups, times, fields and brackets
// Each is 'live' | 'hidden' | '' (never set). Staff always see everything.
//
// Once the schedule is live, the public sees the times and fields from the last
// Publish (the snapshot), not the working copy, so moving games around in the
// Scheduler stays private until the next Publish. Scores, cancellations and bracket
// advancement are always live. A game added after the last Publish stays hidden
// until the next one.

export type Vis = 'live' | 'hidden'
export interface PublicVisibility {
  pools: Vis
  schedule: Vis
  /** true when the switch was never set and the value is the automatic default */
  poolsAuto: boolean
  scheduleAuto: boolean
  publishedAt: string | null
  ended: boolean
  snapshot: Record<string, { date: string; startTime: string; location: string }> | null
}

let columnsReady: Promise<void> | null = null
export function ensureVisibilityColumns(): Promise<void> {
  if (!columnsReady) {
    columnsReady = (async () => {
      for (const sql of [
        `ALTER TABLE "Tournament" ADD COLUMN "scheduleSnapshot" TEXT NOT NULL DEFAULT '{}'`,
        `ALTER TABLE "Tournament" ADD COLUMN "schedulePublishedAt" TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE "Tournament" ADD COLUMN "publicPools" TEXT NOT NULL DEFAULT ''`,
        `ALTER TABLE "Tournament" ADD COLUMN "publicSchedule" TEXT NOT NULL DEFAULT ''`,
      ]) {
        try { await prisma.$executeRawUnsafe(sql) } catch { /* already exists */ }
      }
    })().catch(e => { columnsReady = null; throw e })
  }
  return columnsReady
}

/** Today's date, YYYY-MM-DD, in the event's time zone. Game dates are stored
 *  as plain date strings, so this is what they compare against. */
export function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function lastDay(endDate: string, datesJson: string): string {
  let days: string[] = []
  try { days = JSON.parse(datesJson || '[]') } catch { /* ignore */ }
  const all = [...days, endDate].filter(d => /^\d{4}-\d{2}-\d{2}/.test(d || '')).map(d => d.slice(0, 10)).sort()
  return all[all.length - 1] || ''
}

export async function getPublicVisibility(tournamentId: string): Promise<PublicVisibility> {
  await ensureVisibilityColumns()
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT "publicPools", "publicSchedule", "schedulePublishedAt", "scheduleSnapshot", "endDate", "dates" FROM "Tournament" WHERE id = ?`,
    tournamentId,
  )
  const r = rows[0] || {}
  const publishedAt: string | null = r.schedulePublishedAt || null
  const last = lastDay(String(r.endDate || ''), String(r.dates || '[]'))
  const ended = !!last && last < todayET()

  // Never set: an event that was never published and hasn't happened yet is still
  // being built, so it stays hidden. Anything already published, or already over
  // (the archive), stays visible as it always was.
  const autoVis: Vis = (!publishedAt && !!last && !ended) ? 'hidden' : 'live'
  const schedule: Vis = r.publicSchedule === 'live' || r.publicSchedule === 'hidden' ? r.publicSchedule : autoVis
  const pools: Vis = r.publicPools === 'live' || r.publicPools === 'hidden' ? r.publicPools : schedule

  let snapshot: PublicVisibility['snapshot'] = null
  if (publishedAt && !ended) {
    try {
      const parsed = JSON.parse(r.scheduleSnapshot || '{}')
      if (Array.isArray(parsed?.games)) {
        snapshot = {}
        for (const g of parsed.games) snapshot[g.id] = { date: g.date ?? '', startTime: g.startTime ?? '', location: g.location ?? '' }
      }
    } catch { /* bad snapshot -> fall back to live */ }
  }

  return {
    pools, schedule,
    poolsAuto: !(r.publicPools === 'live' || r.publicPools === 'hidden'),
    scheduleAuto: !(r.publicSchedule === 'live' || r.publicSchedule === 'hidden'),
    publishedAt, ended, snapshot,
  }
}

export async function setPublicVisibility(tournamentId: string, patch: { pools?: Vis; schedule?: Vis }) {
  await ensureVisibilityColumns()
  if (patch.pools) await prisma.$executeRawUnsafe(`UPDATE "Tournament" SET "publicPools" = ? WHERE id = ?`, patch.pools, tournamentId)
  if (patch.schedule) await prisma.$executeRawUnsafe(`UPDATE "Tournament" SET "publicSchedule" = ? WHERE id = ?`, patch.schedule, tournamentId)
}

type GameLike = { id: string; gameNumber?: string | null; pool?: string | null; date: string; startTime: string; location: string }

export function isBracketGame(g: { gameNumber?: string | null }): boolean {
  return String(g.gameNumber || '').startsWith('B')
}

/** Reduce a tournament's games to what the public may see. */
export function applyPublicView<T extends GameLike>(games: T[], vis: PublicVisibility): T[] {
  if (vis.schedule === 'live') {
    const snap = vis.snapshot
    if (!snap) return games
    return games.filter(g => snap[g.id]).map(g => ({ ...g, ...snap[g.id] }))
  }
  // Schedule & brackets off: no games at all, not even the pool matchups. Who
  // plays whom is the schedule too. With only Teams & pools on, this used to
  // hand out every pool game minus its time and field, and clubs read their
  // draft matchups in the club portal (Bo, Oct 4 2026). Pool lists come from
  // the Pool rows instead (/api/tournaments/[id]/pools), not from games.
  return []
}
