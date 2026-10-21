// Reads the 1099 export's rows (lib/form1099) for one organization and year. Server only.

import prisma from '@/lib/db'
import { clientsOfEvent } from '@/lib/clientEvents'
import { eventClientOf } from '@/lib/eventClient'
import { orgById } from '@/lib/org'
import { effectivePayers } from '@/lib/officialsPayer'
import { build1099, type Payer1099, type Person1099, type Rec1099, type Row1099 } from '@/lib/form1099'

/** The organization's event ids (Tournament.orgId is raw SQL, lib/org). */
export async function orgEventIds(orgId: string): Promise<string[]> {
  try {
    const rows: any[] = await prisma.$queryRawUnsafe('SELECT id FROM "Tournament" WHERE orgId = ?', orgId)
    return rows.map(r => String(r.id))
  } catch { return [] }
}

async function w9Flags(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  try {
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT id FROM "Worker" WHERE w9OnFile = 1 AND id IN (${ids.map(() => '?').join(',')})`, ...ids)
    return new Set(rows.map(r => String(r.id)))
  } catch { return new Set() }   // the column comes with the first W-9 upload (lib/staffW9)
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()

export async function rows1099(orgId: string | null | undefined, year: number): Promise<{ rows: Row1099[]; payers: Payer1099[] }> {
  if (!orgId) return { rows: [], payers: [] }
  const events = await orgEventIds(orgId)
  if (!events.length) return { rows: [], payers: [] }
  const records = await prisma.paymentRecord.findMany({
    where: { tournamentId: { in: events }, paidAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    select: { id: true, workerId: true, tournamentId: true, amount: true, paidBy: true },
  })
  const workerIds = Array.from(new Set(records.map(r => r.workerId)))
  const [workers, w9, org] = await Promise.all([
    workerIds.length ? prisma.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, name: true, email: true, phone: true, payMethod: true } }) : Promise.resolve([]),
    w9Flags(workerIds),
    orgById(orgId),
  ])
  const people = new Map<string, Person1099>(workers.map(w => [w.id, { id: w.id, name: w.name, email: w.email || '', phone: w.phone || '', payMethod: w.payMethod || 'check', w9OnFile: w9.has(w.id) }]))

  // Who paid each payment (lib/officialsPayer: its own pick, else its event's setting;
  // the tournament director by default on the Assigner plan), and each event's
  // tournament director by name (the event's record, lib/eventClient, else a login that
  // sees it, lib/clientEvents).
  const paidBy = await effectivePayers(records)
  const tdEvents = Array.from(new Set(records.filter(r => paidBy.get(r.id) === 'td').map(r => r.tournamentId)))
  const tds = new Map<string, Payer1099>()
  const names = tdEvents.length ? await prisma.tournament.findMany({ where: { id: { in: tdEvents } }, select: { id: true, name: true } }) : []
  const eventName = new Map(names.map(t => [t.id, t.name]))
  await Promise.all(tdEvents.map(async tid => {
    const contact = await eventClientOf(tid)
    let name = contact?.name || ''
    if (!name) {
      const ids = await clientsOfEvent(tid)
      const u = ids.length ? await prisma.user.findFirst({ where: { id: { in: ids } }, select: { name: true, email: true } }) : null
      name = u?.name || u?.email || ''
    }
    // Nobody named yet: one payer per event, so two unnamed tournament directors never merge.
    tds.set(tid, name ? { key: 'td:' + norm(name), name, kind: 'td' } : { key: 'td-event:' + tid, name: `Tournament director of ${eventName.get(tid) || 'an event'} (not named yet)`, kind: 'td' })
  }))
  const own: Payer1099 = { key: 'org', name: org?.name || 'Your organization', kind: 'org' }
  const payerOf = (r: Rec1099): Payer1099 => (r.id && paidBy.get(r.id) === 'td' && tds.get(r.tournamentId)) || own
  const rows = build1099(records.map(r => ({ id: r.id, workerId: r.workerId, tournamentId: r.tournamentId, amount: r.amount, paidBy: r.paidBy })), people, payerOf, year)
  const payers = Array.from(new Map(rows.map(r => [r.payerKey, { key: r.payerKey, name: r.payer, kind: r.payerKind }])).values())
  return { rows, payers }
}
