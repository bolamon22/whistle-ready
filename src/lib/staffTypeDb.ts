import { prisma } from '@/lib/db'
import { staffTypeOf, type StaffType } from '@/lib/staffType'

// Worker.staffType (lib/staffType): a raw TEXT column, NOT NULL DEFAULT '' ('' = paid).
// Not in the Prisma schema, so it's read with raw SQL (the Staff Pool's SELECT * already
// returns it once the column exists) and written here. Never write NULL to it. Server only.

let ready = false
export async function ensureStaffTypeColumn(): Promise<void> {
  if (ready) return
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Worker" ADD COLUMN "staffType" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  ready = true
}

/** Set one Staff Pool record's type; anything unknown makes them paid. */
export async function setStaffType(workerId: string, type: unknown): Promise<StaffType> {
  await ensureStaffTypeColumn()
  const t = staffTypeOf(type)
  await prisma.$executeRawUnsafe(`UPDATE "Worker" SET "staffType" = ? WHERE id = ?`, t, workerId)
  return t
}

/** Types for these Staff Pool records (only the unpaid ones are in the map). */
export async function staffTypesFor(ids: string[]): Promise<Map<string, StaffType>> {
  const out = new Map<string, StaffType>()
  const uniq = Array.from(new Set(ids.filter(Boolean).map(String)))
  if (!uniq.length) return out
  await ensureStaffTypeColumn()
  for (let i = 0; i < uniq.length; i += 400) {
    const part = uniq.slice(i, i + 400)
    const rows = await prisma.$queryRawUnsafe<{ id: string; staffType: string | null }[]>(
      `SELECT id, "staffType" FROM "Worker" WHERE id IN (${part.map(() => '?').join(', ')}) AND "staffType" != ''`, ...part)
    for (const r of rows) { const t = staffTypeOf(r.staffType); if (t) out.set(String(r.id), t) }
  }
  return out
}

/** The unpaid people among these. */
export async function unpaidIds(ids: string[]): Promise<Set<string>> {
  return new Set((await staffTypesFor(ids)).keys())
}

export async function staffTypeOfWorker(id: string): Promise<StaffType> {
  return (await staffTypesFor([id])).get(String(id)) ?? ''
}
