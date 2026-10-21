// Checkpoints of who was on each game (Bo, Oct 21 2026; pure half in lib/checkpointDiff).
// Raw table "AssignCheckpoint" (every column TEXT, written with every value, so no NULL
// ever meets a NOT NULL column): id, tournamentId, at (ISO), by, reason ('auto' |
// 'manual' | 'import'), games (count, as text), sig (lib/checkpointDiff assignSig) and
// data (JSON CpGame[]). The last 40 per event are kept.
//
// Automatic: lib/db calls checkpointBeforeGameWrite before every Game write that changes
// the schedule (isScheduleWrite), outside transactions. It saves the event's games and
// officials as they are just before the change, unless the newest checkpoint already
// holds the same officials and is under 12 hours old (a burst of moves gets one
// checkpoint, taken before the first), and only when someone is assigned. Never throws:
// a checkpoint must never stop a schedule change.
//
// Every function takes the Prisma client: lib/db imports this file, so it can't import
// lib/db back.

import { assignSig, cpGame, isScheduleWrite, type CpGame } from '@/lib/checkpointDiff'

type Client = any
export type CheckpointMeta = { id: string; at: string; by: string; reason: string; games: number }
const KEEP = 40
const SAME_WINDOW_MS = 12 * 60 * 60 * 1000

let ready = false
export async function ensureCheckpointTable(client: Client): Promise<void> {
  if (ready) return
  await client.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AssignCheckpoint" ("id" TEXT NOT NULL PRIMARY KEY, "tournamentId" TEXT NOT NULL, "at" TEXT NOT NULL, "by" TEXT NOT NULL DEFAULT '', "reason" TEXT NOT NULL DEFAULT '', "games" TEXT NOT NULL DEFAULT '0', "sig" TEXT NOT NULL DEFAULT '', "data" TEXT NOT NULL DEFAULT '[]')`)
  await client.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AssignCheckpoint_event" ON "AssignCheckpoint" ("tournamentId", "at")`)
  ready = true
}

/** The event's games and officials right now. */
export async function currentGames(client: Client, tournamentId: string): Promise<CpGame[]> {
  const rows = await client.game.findMany({
    where: { tournamentId },
    select: { id: true, gameNumber: true, date: true, startTime: true, location: true, division: true, team1: true, team2: true, isCanceled: true, assignments: { select: { role: true, workerId: true, worker: { select: { name: true } } } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { location: 'asc' }],
  })
  return rows.map(cpGame)
}

const newId = () => 'cp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export async function saveCheckpoint(client: Client, tournamentId: string, reason: string, by: string, games?: CpGame[]): Promise<CheckpointMeta> {
  await ensureCheckpointTable(client)
  const list = games ?? await currentGames(client, tournamentId)
  const meta = { id: newId(), at: new Date().toISOString(), by: String(by || '').slice(0, 120), reason: String(reason || 'manual').slice(0, 40), games: list.length }
  await client.$executeRawUnsafe(`INSERT INTO "AssignCheckpoint" ("id", "tournamentId", "at", "by", "reason", "games", "sig", "data") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    meta.id, tournamentId, meta.at, meta.by, meta.reason, String(meta.games), assignSig(list), JSON.stringify(list))
  // Keep the newest KEEP.
  const old: any[] = await client.$queryRawUnsafe(`SELECT id FROM "AssignCheckpoint" WHERE "tournamentId" = ? ORDER BY "at" DESC LIMIT -1 OFFSET ${KEEP}`, tournamentId)
  for (const r of old) await client.$executeRawUnsafe(`DELETE FROM "AssignCheckpoint" WHERE id = ?`, String(r.id))
  return meta
}

export async function listCheckpoints(client: Client, tournamentId: string): Promise<CheckpointMeta[]> {
  await ensureCheckpointTable(client)
  const rows: any[] = await client.$queryRawUnsafe(`SELECT id, at, "by", reason, games FROM "AssignCheckpoint" WHERE "tournamentId" = ? ORDER BY "at" DESC`, tournamentId)
  return rows.map(r => ({ id: String(r.id), at: String(r.at), by: String(r.by || ''), reason: String(r.reason || ''), games: Number(r.games) || 0 }))
}

/** One checkpoint of this event (null when it isn't this event's). */
export async function getCheckpoint(client: Client, tournamentId: string, id: string): Promise<(CheckpointMeta & { data: CpGame[] }) | null> {
  await ensureCheckpointTable(client)
  const rows: any[] = await client.$queryRawUnsafe(`SELECT id, at, "by", reason, games, data FROM "AssignCheckpoint" WHERE id = ? AND "tournamentId" = ?`, id, tournamentId)
  const r = rows[0]
  if (!r) return null
  let data: CpGame[] = []
  try { data = JSON.parse(String(r.data || '[]')) } catch { /* empty */ }
  return { id: String(r.id), at: String(r.at), by: String(r.by || ''), reason: String(r.reason || ''), games: Number(r.games) || 0, data }
}

// Per server instance: an event checked in the last two minutes isn't checked again, so
// a burst of moves costs one look, not one per game.
const recent = new Map<string, number>()

/** Which event a Game write is about, if it can tell. */
async function eventOf(client: Client, args: any): Promise<string> {
  const w = args?.where || {}
  if (typeof w.tournamentId === 'string') return w.tournamentId
  if (typeof w.id === 'string') {
    const g = await client.game.findUnique({ where: { id: w.id }, select: { tournamentId: true } })
    return g?.tournamentId || ''
  }
  if (w.id && Array.isArray(w.id.in) && typeof w.id.in[0] === 'string') {
    const g = await client.game.findUnique({ where: { id: w.id.in[0] }, select: { tournamentId: true } })
    return g?.tournamentId || ''
  }
  return ''
}

/** Called by lib/db before a Game write. Never throws. */
export async function checkpointBeforeGameWrite(client: Client, action: string, args: any): Promise<void> {
  try {
    if (!isScheduleWrite(action, args)) return
    const tid = await eventOf(client, args)
    if (!tid) return
    const now = Date.now()
    if (now - (recent.get(tid) || 0) < 2 * 60 * 1000) return
    recent.set(tid, now)
    if (recent.size > 500) recent.clear()
    const games = await currentGames(client, tid)
    if (!games.some(g => g.officials.length)) return
    await ensureCheckpointTable(client)
    const last: any[] = await client.$queryRawUnsafe(`SELECT at, sig FROM "AssignCheckpoint" WHERE "tournamentId" = ? ORDER BY "at" DESC LIMIT 1`, tid)
    if (last[0] && String(last[0].sig) === assignSig(games) && now - Date.parse(String(last[0].at)) < SAME_WINDOW_MS) return
    await saveCheckpoint(client, tid, 'auto', '', games)
  } catch (e) {
    console.error('checkpoint before game write:', e)
  }
}

/** Test hook: forget the two-minute memory. */
export function forgetRecentCheckpoints() { recent.clear() }
