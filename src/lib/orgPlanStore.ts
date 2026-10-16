import { prisma } from '@/lib/db'
import { type GroupKey, type OrgPlan, normalizePlan, offGroups } from '@/lib/orgPlans'

// Where each organization's plan is kept (lib/orgPlans has the why): AppSetting
// `orgPlan:<orgId>` = { plan, features: { <group>: true|false }, by, at }. No record
// means Whistle Ready Tournament with everything on, so an organization nobody has
// set up works exactly as it did before plans existed.
// Server only: never import this from a client component.

const KEY = (orgId: string) => `orgPlan:${orgId}`
export type SavedPlan = OrgPlan & { by: string; at: string }

function parse(value: string | null | undefined): SavedPlan {
  let v: Record<string, unknown> = {}
  try { v = value ? JSON.parse(value) || {} : {} } catch { /* unreadable: the default */ }
  return { ...normalizePlan(v), by: String(v.by || ''), at: String(v.at || '') }
}

export async function readOrgPlan(orgId: string): Promise<SavedPlan> {
  try {
    const r = await prisma.appSetting.findUnique({ where: { key: KEY(orgId) } })
    return parse(r?.value)
  } catch { return parse(null) }
}

export async function writeOrgPlan(orgId: string, p: OrgPlan, by: string): Promise<SavedPlan> {
  const clean = normalizePlan(p)
  const value = JSON.stringify({ ...clean, by: String(by || '').slice(0, 120), at: new Date().toISOString() })
  await prisma.appSetting.upsert({ where: { key: KEY(orgId) }, create: { key: KEY(orgId), value }, update: { value } })
  return parse(value)
}

/** The groups switched off for an organization, for the login token. Never throws:
 *  a failed read leaves everything on rather than locking people out. */
export async function planOffFor(orgId: string | null | undefined): Promise<GroupKey[]> {
  if (!orgId) return []
  return offGroups(await readOrgPlan(orgId))
}

/** Several organizations' plans at once (Admin → Organizations). */
export async function orgPlans(orgIds: string[]): Promise<Record<string, SavedPlan>> {
  const out: Record<string, SavedPlan> = {}
  for (const id of orgIds) out[id] = parse(null)
  if (!orgIds.length) return out
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: orgIds.map(KEY) } } })
    for (const r of rows) out[r.key.slice('orgPlan:'.length)] = parse(r.value)
  } catch { /* none saved yet */ }
  return out
}
