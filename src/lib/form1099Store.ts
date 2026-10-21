// Reads the 1099 export's rows (lib/form1099) for one organization and year. Server only.

import prisma from '@/lib/db'
import { clientsOfEvent } from '@/lib/clientEvents'
import { eventClientOf } from '@/lib/eventClient'
import { orgById } from '@/lib/org'
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
    select: { workerId: true, tournamentId: true, amount: true, paidBy: true },
  })
  const workerIds = Array.from(new Set(records.map(r => r.workerId)))
  const [workers, w9, org] = await Promise.all([
    workerIds.length ? prisma.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, name: true, email: true, phone: true, payMethod: true } }) : Promise.resolve([]),
    w9Flags(workerIds),
    orgById(orgId),
  ])
  const people = new Map<string, Person1099>(workers.map(w => [w.id, { id: w.id, name: w.name, email: w.email || '', phone: w.phone || '', payMethod: w.payMethod || 'check', w9OnFile: w9.has(w.id) }]))

  // Each event's tournament director: who they are (the event's record, lib/eventClient)
  // and the names and emails their logins mark payments with (lib/clientEvents).
  const paidEvents = Array.from(new Set(records.map(r => r.tournamentId)))
  const tds = new Map<string, { name: string; marks: Set<string> }>()
  await Promise.all(paidEvents.map(async tid => {
    const [ids, contact] = await Promise.all([clientsOfEvent(tid), eventClientOf(tid)])
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { name: true, email: true } }) : []
    const marks = new Set<string>()
    for (const u of users) { if (norm(u.name)) marks.add(norm(u.name)); if (norm(u.email)) marks.add(norm(u.email)) }
    tds.set(tid, { name: contact?.name || users[0]?.name || users[0]?.email || 'Tournament director', marks })
  }))
  const own: Payer1099 = { key: 'org', name: org?.name || 'Your organization', kind: 'org' }
  const payerOf = (r: Rec1099): Payer1099 => {
    const td = tds.get(r.tournamentId)
    if (td && r.paidBy && td.marks.has(norm(r.paidBy))) return { key: 'td:' + norm(td.name), name: td.name, kind: 'td' }
    return own
  }
  const rows = build1099(records.map(r => ({ workerId: r.workerId, tournamentId: r.tournamentId, amount: r.amount, paidBy: r.paidBy })), people, payerOf, year)
  const payers = Array.from(new Map(rows.map(r => [r.payerKey, { key: r.payerKey, name: r.payer, kind: r.payerKind }])).values())
  return { rows, payers }
}
