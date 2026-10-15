import { prisma } from '@/lib/db'
import { refLevelOf } from '@/lib/refLevel'

// Worker.refLevel (lib/refLevel): a raw INTEGER column, 1 to 3 or NULL. Not in the
// Prisma schema, so it's read with raw SQL (the Staff Pool's SELECT * already returns
// it) and written here. Server only.

let ready = false
export async function ensureRefLevelColumn(): Promise<void> {
  if (ready) return
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "refLevel" INTEGER`) } catch { /* exists */ }
  ready = true
}

/** Set one Staff Pool record's level; anything but 1-3 clears it. */
export async function setRefLevel(workerId: string, level: unknown): Promise<void> {
  await ensureRefLevelColumn()
  await prisma.$executeRawUnsafe(`UPDATE "Worker" SET "refLevel" = ? WHERE id = ?`, refLevelOf(level), workerId)
}

/** Levels for these Staff Pool records (only the ranked ones). */
export async function refLevelsFor(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!ids.length) return out
  await ensureRefLevelColumn()
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400)
    const rows = await prisma.$queryRawUnsafe<{ id: string; refLevel: number | null }[]>(
      `SELECT id, "refLevel" FROM "Worker" WHERE id IN (${part.map(() => '?').join(', ')}) AND "refLevel" IS NOT NULL`, ...part)
    for (const r of rows) { const l = refLevelOf(r.refLevel); if (l) out.set(String(r.id), l) }
  }
  return out
}
