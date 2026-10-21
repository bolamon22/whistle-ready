// Staff pay for one event as its tournament director sees it (Bo, Oct 17 2026: "The
// tournament directors actually are the one that pays the staff. Normally."). The same
// numbers as the Staff pay page shows its director (api/tournaments/[id]/pay-summary):
// each game's stored pay, plus hours times the hourly rate, every assignment and time
// entry of the event. Also who has been paid (PaymentRecord, shared with Staff pay), and
// how each person wants to be paid. A person is paid once there is a record for them
// at the event, and the header's Paid is every record's amount, exactly as on Staff
// pay, so the head assigner and the tournament director never see different numbers.
// Server only.

import prisma from '@/lib/db'
import { entryHours } from '@/lib/payGroups'
import { roleLabel } from '@/lib/utils'
import { byLastName } from '@/lib/personName'
import { effectivePayers, type Payer } from '@/lib/officialsPayer'

const round2 = (n: number) => Math.round(n * 100) / 100

export type ClientPayGame = { gameNumber: string; date: string; startTime: string; division: string; location: string; role: string; pay: number }
export type ClientPayHours = { date: string; clockIn: string | null; clockOut: string | null; hours: number; pay: number }
// payer: who paid it (lib/officialsPayer), the tournament director or the head assigner's organization.
export type ClientPayRecord = { id: string; amount: number; method: string; paidAt: string; paidBy: string | null; payer: Payer }
export type ClientPayPerson = {
  workerId: string; name: string; phone: string; payMethod: string; payHandle: string
  games: ClientPayGame[]; hours: ClientPayHours[]; total: number; isPaid: boolean; records: ClientPayRecord[]
}

/** Everyone with games or hours at the event, by name, with what they earned and were paid. */
export async function clientPay(tournamentId: string): Promise<{ people: ClientPayPerson[]; total: number; paid: number; owed: number; paidByOrg: number }> {
  const [assignments, entries, records] = await Promise.all([
    prisma.assignment.findMany({
      where: { game: { tournamentId } },
      include: { worker: { select: { id: true, name: true, phone: true, payMethod: true, payHandle: true, hourlyRate: true } }, game: { select: { gameNumber: true, date: true, startTime: true, division: true, location: true } } },
      orderBy: [{ game: { date: 'asc' } }, { game: { startTime: 'asc' } }],
    }),
    prisma.timeEntry.findMany({ where: { tournamentId }, include: { worker: { select: { id: true, name: true, phone: true, payMethod: true, payHandle: true, hourlyRate: true } } }, orderBy: [{ date: 'asc' }, { clockIn: 'asc' }] }),
    prisma.paymentRecord.findMany({ where: { tournamentId }, orderBy: { paidAt: 'asc' } }),
  ])
  const payers = await effectivePayers(records)
  const map = new Map<string, ClientPayPerson>()
  const ensure = (w: { id: string; name: string; phone: string | null; payMethod: string; payHandle: string | null }) => {
    let e = map.get(w.id)
    if (!e) { e = { workerId: w.id, name: w.name, phone: w.phone || '', payMethod: w.payMethod || 'check', payHandle: w.payHandle || '', games: [], hours: [], total: 0, isPaid: false, records: [] }; map.set(w.id, e) }
    return e
  }
  for (const a of assignments) {
    const e = ensure(a.worker)
    e.games.push({ gameNumber: a.game.gameNumber, date: a.game.date, startTime: a.game.startTime, division: a.game.division, location: a.game.location, role: roleLabel(a.role), pay: a.payRate })
    e.total += a.payRate
  }
  for (const te of entries) {
    const e = ensure(te.worker)
    const hours = entryHours(te)
    const pay = hours * (te.worker.hourlyRate ?? 0)
    e.hours.push({ date: te.date, clockIn: te.clockIn, clockOut: te.clockOut, hours, pay: round2(pay) })
    e.total += pay
  }
  for (const r of records) {
    const e = map.get(r.workerId)
    if (!e) continue   // nothing left to pay them here; the amount still counts in Paid below
    e.isPaid = true
    e.records.push({ id: r.id, amount: r.amount, method: r.method, paidAt: r.paidAt.toISOString(), paidBy: r.paidBy, payer: payers.get(r.id) ?? 'org' })
  }
  const working = Array.from(map.values()).filter(e => e.games.length || e.hours.length)
  const total = round2(working.reduce((n, p) => n + p.total, 0))   // summed before rounding, as Staff pay does
  const people = working.map(e => ({ ...e, total: round2(e.total) })).sort((a, b) => byLastName(a.name, b.name))
  const paid = round2(records.reduce((n, r) => n + r.amount, 0))
  const paidByOrg = round2(records.filter(r => payers.get(r.id) === 'org').reduce((n, r) => n + r.amount, 0))
  return { people, total, paid, owed: round2(total - paid), paidByOrg }
}

/** Games that have at least one official and aren't canceled: what a per-game assigning fee counts. */
export async function staffedGames(tournamentId: string): Promise<number> {
  return prisma.game.count({ where: { tournamentId, isCanceled: false, assignments: { some: {} } } })
}
