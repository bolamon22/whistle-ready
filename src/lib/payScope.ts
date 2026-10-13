// Which staff pay the signed-in viewer sees (the groups are in lib/payGroups).
// Admins and directors see all of it. An assigner sees the groups set for them on
// Users (admin) or Your team (director), kept in AppSetting
// `assignerPay:{userId}` = { groups, by, at }; with nothing saved they get
// DEFAULT_ASSIGNER_GROUPS (refs, no scorekeepers or hourly staff). Other roles
// see none. Server only: it reads the database.

import prisma from '@/lib/db'
import { canSeeMoney, canSeeStaffPay } from '@/lib/roleScope'
import {
  type PayGroup, type PayScope, DEFAULT_ASSIGNER_GROUPS, FULL_PAY_SCOPE, NO_PAY_SCOPE,
  cleanPayGroups, payScopeOf, seesPay, assignmentPayGroups, timeEntryPayGroups, workerPayGroups, entryHours,
} from '@/lib/payGroups'

const PREFIX = 'assignerPay:'

export interface AssignerPaySetting { groups: PayGroup[]; custom: boolean; by?: string; at?: string }

function parseSetting(value: string | null | undefined): AssignerPaySetting | null {
  if (!value) return null
  try {
    const v = JSON.parse(value)
    if (v && Array.isArray(v.groups)) return { groups: cleanPayGroups(v.groups), custom: true, by: v.by ? String(v.by) : undefined, at: v.at ? String(v.at) : undefined }
  } catch { /* unreadable: treat as not set */ }
  return null
}

const unset = (): AssignerPaySetting => ({ groups: [...DEFAULT_ASSIGNER_GROUPS], custom: false })

export async function assignerPaySetting(userId: string | null | undefined): Promise<AssignerPaySetting> {
  if (!userId) return unset()
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: PREFIX + userId } })
    return parseSetting(row?.value) ?? unset()
  } catch { return unset() }
}

export async function assignerPaySettings(userIds: string[]): Promise<Record<string, AssignerPaySetting>> {
  const out: Record<string, AssignerPaySetting> = {}
  for (const id of userIds) out[id] = unset()
  if (!userIds.length) return out
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: userIds.map(id => PREFIX + id) } } })
    for (const r of rows) { const s = parseSetting(r.value); if (s) out[r.key.slice(PREFIX.length)] = s }
  } catch { /* defaults stand */ }
  return out
}

export async function saveAssignerPay(userId: string, groups: unknown, by: string): Promise<PayGroup[]> {
  const g = cleanPayGroups(groups)
  const value = JSON.stringify({ groups: g, by, at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: PREFIX + userId }, create: { key: PREFIX + userId, value }, update: { value } })
  return g
}

/** The staff pay this viewer sees. "View as" an assigner gets the default groups,
 *  since the admin's own account has none saved. */
export async function payScopeFor(role: string, userId: string | null | undefined): Promise<PayScope> {
  if (canSeeMoney(role)) return FULL_PAY_SCOPE
  if (!canSeeStaffPay(role)) return NO_PAY_SCOPE
  return payScopeOf((await assignerPaySetting(userId)).groups)
}

export type PayAccess = 'none' | 'partial' | 'full'
export const payKey = (workerId: string, tournamentId: string) => `${workerId}|${tournamentId}`

/** For each (staff member, event): does this viewer see none, part or all of that
 *  person's pay there, and what the part they see adds up to. A pay record is one
 *  per person per event, so its amount, Mark Paid and Unpay all need 'full'. A
 *  person with no games or hours left at that event goes by their roles. */
export async function payAccess(scope: PayScope, pairs: { workerId: string; tournamentId: string }[]): Promise<Map<string, { access: PayAccess; total: number }>> {
  const out = new Map<string, { access: PayAccess; total: number }>()
  if (!pairs.length) return out
  const workerIds = Array.from(new Set(pairs.map(p => p.workerId)))
  const tids = Array.from(new Set(pairs.map(p => p.tournamentId)))
  const [assignments, entries, workers] = await Promise.all([
    prisma.assignment.findMany({
      where: { workerId: { in: workerIds }, game: { tournamentId: { in: tids } } },
      select: { workerId: true, role: true, payRate: true, game: { select: { tournamentId: true, division: true } } },
    }),
    prisma.timeEntry.findMany({ where: { workerId: { in: workerIds }, tournamentId: { in: tids } } }),
    prisma.worker.findMany({ where: { id: { in: workerIds } }, select: { id: true, roles: true, defaultRole: true, gender: true, hourlyRate: true } }),
  ])
  const byId = new Map(workers.map(w => [w.id, w]))
  const tally = new Map<string, { seen: number; hidden: number; total: number }>()
  const at = (k: string) => { let t = tally.get(k); if (!t) { t = { seen: 0, hidden: 0, total: 0 }; tally.set(k, t) } return t }
  for (const a of assignments) {
    const t = at(payKey(a.workerId, a.game.tournamentId))
    if (seesPay(scope, assignmentPayGroups(a.role, a.game.division, byId.get(a.workerId)?.gender))) { t.seen++; t.total += a.payRate } else t.hidden++
  }
  for (const e of entries) {
    const w = byId.get(e.workerId), t = at(payKey(e.workerId, e.tournamentId))
    if (seesPay(scope, timeEntryPayGroups(w))) { t.seen++; t.total += entryHours(e) * (w?.hourlyRate ?? 0) } else t.hidden++
  }
  for (const p of pairs) {
    const k = payKey(p.workerId, p.tournamentId), t = tally.get(k)
    let access: PayAccess
    if (scope.all) access = 'full'
    else if (t && (t.seen || t.hidden)) access = !t.seen ? 'none' : t.hidden ? 'partial' : 'full'
    else {
      const g = workerPayGroups(byId.get(p.workerId))
      const n = g.filter(x => scope.groups.includes(x)).length
      access = !n ? 'none' : n === g.length ? 'full' : 'partial'
    }
    out.set(k, { access, total: Math.round((t?.total ?? 0) * 100) / 100 })
  }
  return out
}
