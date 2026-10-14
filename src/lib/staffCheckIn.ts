import { createClient } from '@libsql/client'

// Game check-in for staff ("I'm at my table/field"). The staff home page had a
// Check in button that only changed the button; nothing was saved and directors
// couldn't see who had arrived (Oct 14 2026). One raw column on "Assignment"
// (guarded ALTER, like the other raw columns, so no migration): checkedInAt is
// the ISO time the staff member tapped Check in, NULL until then.

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

let ensured = false
async function ensure(client: ReturnType<typeof db>) {
  if (ensured) return
  try { await client.execute(`ALTER TABLE "Assignment" ADD COLUMN "checkedInAt" TEXT`) } catch { /* exists */ }
  ensured = true
}

/** assignmentId -> checkedInAt, for the given assignments (missing = not checked in). */
export async function checkInsFor(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!ids.length) return out
  try {
    const client = db(); await ensure(client)
    for (let i = 0; i < ids.length; i += 400) {
      const chunk = ids.slice(i, i + 400)
      const r = await client.execute({ sql: `SELECT id, checkedInAt FROM "Assignment" WHERE checkedInAt IS NOT NULL AND id IN (${chunk.map(() => '?').join(',')})`, args: chunk })
      for (const row of r.rows) out.set(String(row.id), String(row.checkedInAt))
    }
  } catch { /* best-effort: the pages still load without check-ins */ }
  return out
}

/** Check a worker in (or undo) for every slot they hold on one game. Returns rows changed. */
export async function setCheckIn(gameId: string, workerId: string, on: boolean): Promise<{ changed: number; at: string | null }> {
  const client = db(); await ensure(client)
  const at = on ? new Date().toISOString() : null
  const r = await client.execute({ sql: `UPDATE "Assignment" SET checkedInAt = ? WHERE gameId = ? AND workerId = ?`, args: [at, gameId, workerId] })
  return { changed: r.rowsAffected, at }
}
