import { prisma } from '@/lib/db'

// Where each vendor sets up at one event ("by Field 3", "lot B, near the gate"), so a
// field director can walk a vendor in and find them when something goes wrong (Bo,
// Oct 14 2026: field directors handle "vendor location ... basically anything that
// needs attention"). Kept apart from the vendor's own form answers: it's ours, set by
// the director or field director, and an edit never touches what the vendor sent.
// AppSetting `vendorSpots:<tournamentId>` = { [submissionId]: { spot, by, at } }.

export type VendorSpot = { spot: string; by: string; at: string }
const key = (tid: string) => `vendorSpots:${tid}`

async function ensure() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch { /* exists */ }
}

export async function vendorSpots(tid: string): Promise<Record<string, VendorSpot>> {
  try {
    await ensure()
    const row = await prisma.appSetting.findUnique({ where: { key: key(tid) } })
    const v = row ? JSON.parse(row.value) : {}
    return v && typeof v === 'object' ? v : {}
  } catch { return {} }
}

/** Set (or clear, with an empty spot) one vendor's spot. Returns the new map. */
export async function setVendorSpot(tid: string, subId: string, spot: string, by: string): Promise<Record<string, VendorSpot>> {
  await ensure()
  const all = await vendorSpots(tid)
  const clean = String(spot || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (clean) all[subId] = { spot: clean, by, at: new Date().toISOString() }
  else delete all[subId]
  const value = JSON.stringify(all)
  await prisma.appSetting.upsert({ where: { key: key(tid) }, create: { key: key(tid), value }, update: { value } })
  return all
}
