import { prisma } from '@/lib/db'
import type { SmsConsentSource, SmsConsentRow } from '@/lib/smsConsent'

// Storage for staff SMS permission. Server only — the wording that people
// actually tick lives in src/lib/smsConsent.ts, which the /join page imports in
// the browser and which must never reach the database.
//
// House pattern: guarded ALTERs on Worker, not in prisma/schema.prisma (same as
// the housing columns on TeamRegistration). Reading these through the typed
// Prisma client silently yields undefined — always go through this file.

export async function ensureSmsConsentCols() {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "smsConsent" INTEGER NOT NULL DEFAULT 0`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "smsConsentAt" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  // Where the yes came from, because a verification reviewer can ask: 'join'
  // (the signup form), 'profile' (they turned it on later), 'staff' (the office
  // recorded a verbal yes).
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "smsConsentSource" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
}

/** Record a yes or a no. A no clears the date rather than keeping a stale one,
 *  so "when did they agree" can never answer for somebody who has since said no. */
export async function setSmsConsent(workerId: string, consent: boolean, source: SmsConsentSource) {
  if (!workerId) return
  await ensureSmsConsentCols()
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "Worker" SET "smsConsent" = ?, "smsConsentAt" = ?, "smsConsentSource" = ? WHERE id = ?`,
      consent ? 1 : 0,
      consent ? new Date().toISOString() : '',
      consent ? source : '',
      workerId,
    )
  } catch { /* column not migrated yet — the next ensure call fixes it */ }
}

/** Who may be texted, by worker id. Anyone missing from the map has NOT agreed —
 *  callers must treat absent as no, never as unknown-so-send. */
export async function smsConsentFor(workerIds: string[]): Promise<Map<string, SmsConsentRow>> {
  const out = new Map<string, SmsConsentRow>()
  const ids = workerIds.filter(Boolean)
  if (!ids.length) return out
  await ensureSmsConsentCols()
  try {
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT id, "smsConsent", "smsConsentAt", "smsConsentSource" FROM "Worker" WHERE id IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    )
    for (const r of rows || []) {
      if (Number(r.smsConsent) !== 1) continue
      out.set(String(r.id), {
        consent: true,
        at: String(r.smsConsentAt || ''),
        source: String(r.smsConsentSource || ''),
      })
    }
  } catch { /* not migrated — nobody has agreed yet, which is the safe answer */ }
  return out
}
