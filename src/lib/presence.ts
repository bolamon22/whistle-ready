import { createClient } from '@libsql/client'

// Who's on, and when people last logged in. Sessions are JWTs (nothing stored
// server-side), so there was no record of either. Two raw columns on "User"
// (guarded ALTER, like the other raw columns): lastLoginAt is set by a
// successful password sign-in, lastSeenAt by the app's heartbeat
// (components/PresencePing) every couple of minutes while a tab is visible.

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

let ensured = false
export async function ensurePresenceColumns(client = db()): Promise<void> {
  if (ensured) return
  for (const col of ['lastLoginAt', 'lastSeenAt']) {
    try { await client.execute(`ALTER TABLE "User" ADD COLUMN "${col}" TEXT`) } catch { /* exists */ }
  }
  ensured = true
}

/** Best-effort: never let presence bookkeeping block a sign-in. */
export async function markLogin(userId: string): Promise<void> {
  try {
    const client = db()
    await ensurePresenceColumns(client)
    await client.execute({ sql: `UPDATE "User" SET lastLoginAt = datetime('now'), lastSeenAt = datetime('now') WHERE id = ?`, args: [userId] })
  } catch { /* ignore */ }
}

/** Heartbeat. Throttled in SQL so a burst of tabs costs one write a minute. */
export async function markSeen(userId: string): Promise<void> {
  try {
    const client = db()
    await ensurePresenceColumns(client)
    await client.execute({
      sql: `UPDATE "User" SET lastSeenAt = datetime('now') WHERE id = ? AND (lastSeenAt IS NULL OR lastSeenAt < datetime('now', '-60 seconds'))`,
      args: [userId],
    })
  } catch { /* ignore */ }
}

export interface PresenceRow { id: string; name: string; role: string; lastSeenAt: string | null; lastLoginAt: string | null }

/** Everyone seen in the last `minutes`. orgId null = every org (platform admin). */
export async function recentlySeen(orgId: string | null, minutes = 5): Promise<PresenceRow[]> {
  const client = db()
  await ensurePresenceColumns(client)
  const since = `-${Math.max(1, Math.floor(minutes))} minutes`
  const res = orgId
    ? await client.execute({ sql: `SELECT id, name, role, lastSeenAt, lastLoginAt FROM "User" WHERE lastSeenAt >= datetime('now', ?) AND orgId = ? ORDER BY lastSeenAt DESC`, args: [since, orgId] })
    : await client.execute({ sql: `SELECT id, name, role, lastSeenAt, lastLoginAt FROM "User" WHERE lastSeenAt >= datetime('now', ?) ORDER BY lastSeenAt DESC`, args: [since] })
  return (res.rows as Array<Record<string, unknown>>).map(r => ({
    id: String(r.id), name: String(r.name ?? ''), role: String(r.role ?? ''),
    lastSeenAt: r.lastSeenAt ? String(r.lastSeenAt) : null, lastLoginAt: r.lastLoginAt ? String(r.lastLoginAt) : null,
  }))
}

/** Login times keyed by lower-cased email, for matching Workers (no FK; email is the link). */
export async function presenceByEmail(client = db()): Promise<Map<string, { lastSeenAt: string | null; lastLoginAt: string | null }>> {
  const out = new Map<string, { lastSeenAt: string | null; lastLoginAt: string | null }>()
  try {
    await ensurePresenceColumns(client)
    const res = await client.execute(`SELECT lower(email) AS email, lastSeenAt, lastLoginAt FROM "User" WHERE email IS NOT NULL AND email != ''`)
    for (const r of res.rows as Array<Record<string, unknown>>) {
      out.set(String(r.email), { lastSeenAt: r.lastSeenAt ? String(r.lastSeenAt) : null, lastLoginAt: r.lastLoginAt ? String(r.lastLoginAt) : null })
    }
  } catch { /* columns missing: everyone reads as never seen */ }
  return out
}

// Who may see presence lives in the client-safe module so the nav can use it too.
export { PRESENCE_VIEWER_ROLES, canSeePresence } from '@/lib/presenceTime'
