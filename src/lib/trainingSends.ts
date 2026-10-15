import { prisma } from '@/lib/db'

// Every training-video email, one row per person per send, failures included (Bo, Oct 15
// 2026: "I would like a record of it, so I don't keep resending it to her if she's not
// opening them or getting them"). Their profile on the Staff Pool and the Staff roster
// lists these. The library's Sent tab keeps reading AppSetting `trainingSends`, which
// holds only the last 50 sends as a whole. "Sent" means our email service (SendGrid)
// took the message; delivery and opens are in SendGrid's Activity feed.
//
// Raw table, made on first use; TEXT columns except the 0/1 `ok` (CLAUDE.md, raw-query
// column types). Server only: never import this from a client component.

export type TrainingEmail = { at: string; by: string; videoIds: string[]; ok: boolean; error: string }

let ready = false
async function ensure() {
  if (ready) return
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "TrainingEmail" (
    "id" TEXT NOT NULL PRIMARY KEY, "sentAt" TEXT NOT NULL, "email" TEXT NOT NULL, "workerId" TEXT,
    "byName" TEXT, "byUserId" TEXT, "videoIds" TEXT NOT NULL, "ok" INTEGER NOT NULL DEFAULT 0, "error" TEXT)`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TrainingEmail_email" ON "TrainingEmail" ("email")`)
  ready = true
}

/** Record one send: a row per recipient (the sender's own copy is not a recipient). */
export async function recordTrainingEmails(
  rows: { email: string; workerId?: string | null; ok: boolean; error?: string }[],
  meta: { at: string; by: string; byUserId: string; videoIds: string[] },
): Promise<void> {
  if (!rows.length) return
  await ensure()
  for (const r of rows) {
    const email = String(r.email || '').trim().toLowerCase()
    if (!email) continue
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TrainingEmail" ("id", "sentAt", "email", "workerId", "byName", "byUserId", "videoIds", "ok", "error") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), meta.at, email, r.workerId || null, meta.by || '', meta.byUserId || '', JSON.stringify(meta.videoIds), r.ok ? 1 : 0, r.ok ? null : String(r.error || 'Not sent').slice(0, 300))
  }
}

/** The training emails sent to this address, newest first. `byUserId` narrows to one
 *  sender's (assigners and field directors see only their own, as in the Sent tab). */
export async function trainingEmailsTo(email: string, byUserId?: string, limit = 25): Promise<TrainingEmail[]> {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return []
  await ensure()
  const n = Math.max(1, Math.min(200, Math.floor(limit)))
  const rows = byUserId
    ? await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "sentAt", "byName", "videoIds", "ok", "error" FROM "TrainingEmail" WHERE "email" = ? AND "byUserId" = ? ORDER BY "sentAt" DESC LIMIT ${n}`, e, byUserId)
    : await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT "sentAt", "byName", "videoIds", "ok", "error" FROM "TrainingEmail" WHERE "email" = ? ORDER BY "sentAt" DESC LIMIT ${n}`, e)
  return rows.map(r => {
    let videoIds: string[] = []
    try { const v = JSON.parse(String(r.videoIds || '[]')); if (Array.isArray(v)) videoIds = v.map(String) } catch { /* bad JSON: none */ }
    return { at: String(r.sentAt || ''), by: String(r.byName || ''), videoIds, ok: Number(r.ok) === 1, error: String(r.error || '') }
  })
}

/** A merged Staff Pool record's rows follow the kept one. */
export async function moveTrainingEmails(fromWorkerId: string, toWorkerId: string): Promise<void> {
  await ensure()
  await prisma.$executeRawUnsafe(`UPDATE "TrainingEmail" SET "workerId" = ? WHERE "workerId" = ?`, toWorkerId, fromWorkerId)
}
