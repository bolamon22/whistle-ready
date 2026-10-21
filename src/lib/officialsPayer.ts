// Who pays the officials at an event (Bo, Oct 21 2026): "James or the head official is not
// always the one that pays the refs. Oftentimes the tournament sends checks or pays by
// Zelle, Venmo ... the majority of the time." So on the Assigner plan each event says who
// pays them, the tournament director (the default there) or the organization itself, and
// each staff pay record says who paid it:
//   - AppSetting `officialsPaidBy:{tournamentId}` = { by: 'td' | 'org', who, at }. No
//     record: 'td' on the Assigner plan, 'org' on every other plan (Sunshine pays its own).
//   - PaymentRecord.payer (raw column, TEXT, NULL allowed): 'td' or 'org' when someone
//     picked a payer for that one payment; NULL follows the event's setting, so changing
//     the event moves every payment that never had its own pick. A tournament director
//     marking someone paid in their own area always writes 'td'.
// Used by: the 1099 export (who files the 1099), Staff pay and the tournament director's
// Staff pay (who paid each person), and what the tournament director owes the head
// assigner (lib/assigningFee: staff pay the organization paid for them, plus his fee).
// Server only.

import prisma from '@/lib/db'
import { tournamentOrgId } from '@/lib/org'
import { readOrgPlan } from '@/lib/orgPlanStore'

export type Payer = 'td' | 'org'
export const isPayer = (v: unknown): v is Payer => v === 'td' || v === 'org'
const key = (tournamentId: string) => 'officialsPaidBy:' + tournamentId

/** What an event says when nobody has set it: the tournament director on the Assigner plan. */
export async function defaultPayer(tournamentId: string): Promise<Payer> {
  const orgId = await tournamentOrgId(tournamentId)
  if (!orgId) return 'org'
  try { return (await readOrgPlan(orgId)).plan === 'assigner' ? 'td' : 'org' } catch { return 'org' }
}

export async function officialsPaidByOf(tournamentId: string): Promise<Payer> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: key(tournamentId) } })
    const v = row?.value ? JSON.parse(row.value)?.by : null
    if (isPayer(v)) return v
  } catch { /* fall through */ }
  return defaultPayer(tournamentId)
}

/** Several events at once (the 1099 export, What tournament directors owe). */
export async function officialsPaidByMany(tournamentIds: string[]): Promise<Record<string, Payer>> {
  const out: Record<string, Payer> = {}
  await Promise.all(tournamentIds.map(async id => { out[id] = await officialsPaidByOf(id) }))
  return out
}

export async function saveOfficialsPaidBy(tournamentId: string, by: Payer, who: string): Promise<Payer> {
  const value = JSON.stringify({ by, who: String(who || '').slice(0, 120), at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: key(tournamentId) }, create: { key: key(tournamentId), value }, update: { value } })
  return by
}

let ready = false
/** PaymentRecord.payer: TEXT and nullable on purpose (a NOT NULL DEFAULT '' column
 *  broke every insert that sent NULL once, Worker.association, Oct 20 2026). */
export async function ensurePayerColumn(): Promise<void> {
  if (ready) return
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "PaymentRecord" ADD COLUMN "payer" TEXT`) } catch { /* exists */ }
  ready = true
}

/** One payment's own pick (null = follow the event). */
export async function setRecordPayer(recordId: string, payer: Payer | null): Promise<void> {
  await ensurePayerColumn()
  await prisma.$executeRawUnsafe(`UPDATE "PaymentRecord" SET "payer" = ? WHERE id = ?`, payer, recordId)
}

/** Each record's own pick, by record id ('' = none). */
export async function recordPayers(recordIds: string[]): Promise<Map<string, Payer | null>> {
  const out = new Map<string, Payer | null>()
  if (!recordIds.length) return out
  await ensurePayerColumn()
  for (let i = 0; i < recordIds.length; i += 400) {
    const ids = recordIds.slice(i, i + 400)
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(`SELECT id, payer FROM "PaymentRecord" WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
      for (const r of rows) out.set(String(r.id), isPayer(r.payer) ? r.payer : null)
    } catch { /* treat as no picks */ }
  }
  return out
}

/** Who paid each record: its own pick, else its event's setting. */
export async function effectivePayers(records: { id: string; tournamentId: string }[]): Promise<Map<string, Payer>> {
  const [own, events] = await Promise.all([
    recordPayers(records.map(r => r.id)),
    officialsPaidByMany(Array.from(new Set(records.map(r => r.tournamentId)))),
  ])
  return new Map(records.map(r => [r.id, own.get(r.id) ?? events[r.tournamentId] ?? 'org']))
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Staff pay the organization itself paid at each event: on the Assigner plan, money the
 *  tournament director owes the head assigner back (Bo, Oct 21 2026). Always 0 on other
 *  plans, where the organization is the tournament and pays its own staff. */
export async function orgPaidStaffMany(tournamentIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const id of tournamentIds) out[id] = 0
  const assigner = (await Promise.all(tournamentIds.map(async id => ((await defaultPayer(id)) === 'td' ? id : '')))).filter(Boolean)
  if (!assigner.length) return out
  const records = await prisma.paymentRecord.findMany({ where: { tournamentId: { in: assigner } }, select: { id: true, tournamentId: true, amount: true } })
  const payers = await effectivePayers(records)
  for (const r of records) if (payers.get(r.id) === 'org') out[r.tournamentId] = round2(out[r.tournamentId] + r.amount)
  return out
}
