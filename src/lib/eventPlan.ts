import { prisma } from '@/lib/db'
import { round2 } from '@/lib/costTypes'
import type { PlanLine } from '@/lib/finance'

// The Budget tab's own lines for one event (Bo, Oct 5 2026: "I would like to
// be able to build a budget too" ... "can I add budgeted income too?"):
// projected income (team fees, booths, sponsorship, lines he adds) and the
// staff-pay plan. Vendor costs keep their plan on the cost line itself
// (EventCost.planned). Raw SQL created on first use, like EventCost.

let ready: Promise<void> | null = null
function ensure(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EventPlanLine" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL DEFAULT '',
        "tournamentId" TEXT NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'income',
        "key" TEXT NOT NULL,
        "name" TEXT NOT NULL DEFAULT '',
        "planned" REAL,
        "sort" INTEGER NOT NULL DEFAULT 0,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EventPlanLine_t" ON "EventPlanLine"("tournamentId")`)
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

const line = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export function cleanPlan(v: unknown): PlanLine[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  const out: PlanLine[] = []
  for (const x of v.slice(0, 80)) {
    const o = (x || {}) as Record<string, unknown>
    const kind = o.kind === 'cost' ? 'cost' : 'income'
    const key = line(o.key, 40).replace(/[^A-Za-z0-9_-]/g, '')
    if (!key || seen.has(kind + key)) continue
    seen.add(kind + key)
    const n = o.planned === null || o.planned === '' || o.planned === undefined ? null : Number(o.planned)
    out.push({ kind, key, name: line(o.name, 120), planned: n === null || !Number.isFinite(n) ? null : round2(Math.min(Math.max(n, 0), 100_000_000)) })
  }
  return out
}

export async function getPlan(tournamentId: string): Promise<PlanLine[]> {
  await ensure()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT * FROM "EventPlanLine" WHERE "tournamentId" = ? ORDER BY "sort"`, tournamentId)
  return rows.map(r => ({ kind: r.kind === 'cost' ? 'cost' : 'income', key: String(r.key), name: String(r.name || ''), planned: r.planned === null || r.planned === undefined ? null : round2(Number(r.planned)) }))
}

/** Replaces the event's plan with these lines (the page sends the whole list). */
export async function savePlan(orgId: string, tournamentId: string, lines: PlanLine[]): Promise<PlanLine[]> {
  await ensure()
  await prisma.$executeRawUnsafe(`DELETE FROM "EventPlanLine" WHERE "tournamentId" = ?`, tournamentId)
  let i = 0
  for (const l of lines) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "EventPlanLine" ("id", "orgId", "tournamentId", "kind", "key", "name", "planned", "sort") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), orgId, tournamentId, l.kind, l.key, l.name, l.planned, i++)
  }
  return getPlan(tournamentId)
}
