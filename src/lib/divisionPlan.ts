import { prisma } from '@/lib/db'
import { nameKey } from '@/lib/names'

// Divisions with no bracket: pool play only, no playoff or championship games
// (Bo, Oct 11 2026: "We need an option not to schedule bracket games ... this
// division has no playoffs or bracket games"). Set with the checkbox on the
// division's Bracket tab. What it does:
//   - Generate all (Divisions page) leaves the division's bracket out;
//   - the bracket API refuses to build one for it, from any page;
//   - the Divisions rail says "Pool play only".
// Kept per event in AppSetting `noBracket:{tournamentId}` as { [division]: { at, by } },
// keyed by the division's name like the other per-division settings; renaming the
// division carries it and deleting the division drops it (divisions route).

const key = (tid: string) => `noBracket:${tid}`
type Entry = { at: string; by?: string }

async function read(tid: string): Promise<Record<string, Entry>> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: key(tid) } })
    const v = row ? JSON.parse(row.value || '{}') : {}
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}

async function write(tid: string, v: Record<string, Entry>): Promise<void> {
  const value = JSON.stringify(v)
  await prisma.appSetting.upsert({ where: { key: key(tid) }, update: { value }, create: { key: key(tid), value } })
}

/** The divisions set to pool play only, as loose name keys (lib/names nameKey). */
export async function noBracketKeys(tid: string): Promise<Set<string>> {
  return new Set(Object.keys(await read(tid)).map(nameKey).filter(Boolean))
}

/** Is this division pool play only? Matched loosely, so "Boys U10 " is "boys u10". */
export async function isNoBracket(tid: string, division: string): Promise<boolean> {
  const want = nameKey(division)
  return !!want && (await noBracketKeys(tid)).has(want)
}

/** Turn pool play only on or off for a division. */
export async function setNoBracket(tid: string, division: string, on: boolean, by?: string): Promise<void> {
  const cur = await read(tid)
  const want = nameKey(division)
  let changed = false
  for (const d of Object.keys(cur)) if (nameKey(d) === want) { delete cur[d]; changed = true }
  if (on) { cur[division.trim()] = { at: new Date().toISOString(), by }; changed = true }
  if (changed) await write(tid, cur)
}

/** A renamed division keeps the setting. */
export async function renameNoBracket(tid: string, oldName: string, newName: string): Promise<void> {
  const cur = await read(tid)
  const want = nameKey(oldName)
  const hit = Object.keys(cur).find(d => nameKey(d) === want)
  if (!hit) return
  const entry = cur[hit]
  delete cur[hit]
  cur[newName.trim()] = entry
  await write(tid, cur)
}
