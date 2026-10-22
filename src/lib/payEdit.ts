// A game's pay set by hand on Staff pay (Bo, Oct 22 2026: "we should be able to just
// manually edit it in the pay sheet if needed ... Sometimes there might be a situation
// where someone should be paid differently for a game"). The pay itself stays on
// Assignment.payRate, so every total, Mark paid, the 1099 export and the tournament
// director's Staff pay read it as before. Raw column Assignment.payEdit (TEXT, NULL when
// the game is priced by the rates) holds who set it, when, a note, what it was, and the
// person it was set for: if someone else is put on that game, the edit no longer counts.
// lib/repricePay leaves a game with a standing edit alone. Server only.

import prisma from '@/lib/db'

export type PayEdit = { workerId: string; by: string; at: string; note: string; was: number }

let ready = false
export async function ensurePayEditColumn(): Promise<void> {
  if (ready) return
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "Assignment" ADD COLUMN "payEdit" TEXT`) } catch { /* exists */ }
  ready = true
}

const parse = (v: unknown): PayEdit | null => {
  try { const o = v ? JSON.parse(String(v)) : null; return o && typeof o.workerId === 'string' ? o : null } catch { return null }
}

/** The standing edits of these assignments: only those set for the person on the game now. */
export async function payEditsFor(assignments: { id: string; workerId: string }[]): Promise<Map<string, PayEdit>> {
  const out = new Map<string, PayEdit>()
  if (!assignments.length) return out
  await ensurePayEditColumn()
  const who = new Map(assignments.map(a => [a.id, a.workerId]))
  const ids = assignments.map(a => a.id)
  for (let i = 0; i < ids.length; i += 400) {
    const part = ids.slice(i, i + 400)
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(`SELECT id, "payEdit" FROM "Assignment" WHERE "payEdit" IS NOT NULL AND id IN (${part.map(() => '?').join(',')})`, ...part)
      for (const r of rows) { const e = parse(r.payEdit); if (e && e.workerId === who.get(String(r.id))) out.set(String(r.id), e) }
    } catch { /* none */ }
  }
  return out
}

export async function setPayEdit(assignmentId: string, edit: PayEdit | null): Promise<void> {
  await ensurePayEditColumn()
  await prisma.$executeRawUnsafe(`UPDATE "Assignment" SET "payEdit" = ? WHERE id = ?`, edit ? JSON.stringify(edit) : null, assignmentId)
}
