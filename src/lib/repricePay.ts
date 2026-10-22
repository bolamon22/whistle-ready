// Keep each assigned game's pay in step with the rates (James Vacco, head assigner, Oct 22
// 2026: "Override didn't seem to be working. Why is this guy's pay different?"). A game's
// pay is saved on the Assignment when someone is put on it: their Pay Rate Override, else
// the event's rate for their certification and role. Changing the override, the
// certification or the event's Pay rates afterwards changed nothing already assigned, so
// a $123 override typed once and cleared stayed on that one game.
//
// Now, after such a change, every assigned game whose person isn't marked paid at that
// event yet is priced again by the same rule as assigning (api/assignments). A person
// marked paid keeps what they were paid. A person's change reaches only events that
// haven't ended more than 60 days ago, so old history isn't rewritten. Server only.

import prisma from '@/lib/db'
import { getPayRate, parsePayRates } from '@/lib/utils'

const round2 = (n: number) => Math.round(n * 100) / 100
const WINDOW_DAYS = 60

/** What assigning would pay this person in this role at an event with these rates. */
export function payFor(w: { payRateOverride: number | null; certLevel: string }, role: string, payRates: ReturnType<typeof parsePayRates>): number {
  return round2(w.payRateOverride ?? getPayRate(w.certLevel, role, payRates))
}

async function reprice(where: object): Promise<number> {
  const rows = await prisma.assignment.findMany({
    where,
    select: { id: true, role: true, payRate: true, workerId: true, worker: { select: { payRateOverride: true, certLevel: true } }, game: { select: { tournamentId: true } } },
  })
  if (!rows.length) return 0
  const tids = Array.from(new Set(rows.map(r => r.game.tournamentId)))
  const [events, paid] = await Promise.all([
    prisma.tournament.findMany({ where: { id: { in: tids } }, select: { id: true, payRates: true } }),
    prisma.paymentRecord.findMany({ where: { tournamentId: { in: tids }, workerId: { in: Array.from(new Set(rows.map(r => r.workerId))) } }, select: { workerId: true, tournamentId: true } }),
  ])
  const rates = new Map(events.map(e => [e.id, parsePayRates(e.payRates)]))
  const isPaid = new Set(paid.map(p => p.workerId + '|' + p.tournamentId))
  let changed = 0
  for (const r of rows) {
    if (isPaid.has(r.workerId + '|' + r.game.tournamentId)) continue
    const pr = rates.get(r.game.tournamentId)
    if (!pr) continue
    const want = payFor(r.worker, r.role, pr)
    if (Math.abs(want - r.payRate) < 0.005) continue
    await prisma.assignment.update({ where: { id: r.id }, data: { payRate: want } })
    changed++
  }
  return changed
}

/** After a person's Pay Rate Override or certification changes. */
export async function repriceWorker(workerId: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10)
  const events = await prisma.tournament.findMany({ where: { OR: [{ endDate: { gte: since } }, { endDate: '', startDate: { gte: since } }] }, select: { id: true } })
  if (!events.length) return 0
  return reprice({ workerId, game: { tournamentId: { in: events.map(e => e.id) } } })
}

/** After an event's Pay rates change. */
export async function repriceEvent(tournamentId: string): Promise<number> {
  return reprice({ game: { tournamentId } })
}
