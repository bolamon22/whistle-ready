// Players linked as siblings at an event (Bo, Oct 18 2026: "sibling themed cards Brothers,
// sisters, sister and brother ... separate cards but tie them in together"). Staff link
// them on the social scheduler; each sibling's "Siblings" post then names the others.
//
// One AppSetting row per player, `siblings:{submissionId}` = { ids, rel }, written for
// every member, so the public post renderer (/pass/<token>/post/siblings.png) finds the
// group from the one player it is drawing. rel: '' = from the waivers' genders, or
// 'brothers' | 'sisters' | 'mixed' when staff set it.
import { prisma } from '@/lib/db'
import { getSubmission } from '@/lib/formSubmissions'
import { siblingTitle } from '@/lib/socialPosts'

export type SiblingGroup = { ids: string[]; rel: string }
const key = (id: string) => `siblings:${id}`
const REL = new Set(['', 'brothers', 'sisters', 'mixed'])

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}
function parse(v: string | undefined | null): SiblingGroup | null {
  try { const j = JSON.parse(String(v || '')); const ids = (Array.isArray(j?.ids) ? j.ids : []).map(String).filter(Boolean); return ids.length > 1 ? { ids, rel: REL.has(j.rel) ? j.rel : '' } : null } catch { return null }
}

/** Boys/girls from the waiver's gender answer, else from the division or team name. */
export function genderOf(d: any, division: string): 'boys' | 'girls' | '' {
  const g = String(d?.gender || '').trim().toLowerCase()
  if (/^(f|female|girl)/.test(g)) return 'girls'
  if (/^(m|male|boy)/.test(g)) return 'boys'
  const text = `${division} ${d?.teamName || ''}`.toLowerCase()
  if (/\b(girls?|women'?s?|womens|lady|ladies)\b/.test(text)) return 'girls'
  if (/\b(boys?|men'?s?|mens)\b/.test(text)) return 'boys'
  return ''
}

export async function getSiblingGroup(id: string): Promise<SiblingGroup | null> {
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: key(id) } }).catch(() => null)
  return parse(row?.value)
}
export async function getSiblingGroupsMany(ids: string[]): Promise<Record<string, SiblingGroup>> {
  const out: Record<string, SiblingGroup> = {}
  if (!ids.length) return out
  await ensureTable()
  for (let i = 0; i < ids.length; i += 400) {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: ids.slice(i, i + 400).map(key) } } }).catch(() => [] as { key: string; value: string }[])
    for (const r of rows) { const g = parse(r.value); if (g) out[r.key.slice('siblings:'.length)] = g }
  }
  return out
}

/** Link 2–4 players as siblings (replacing any group they were in). */
export async function linkSiblings(ids: string[], rel = '') {
  await ensureTable()
  const clean = Array.from(new Set(ids.map(String).filter(x => /^[\w-]{4,64}$/.test(x)))).slice(0, 4)
  if (clean.length < 2) throw new Error('Pick 2 to 4 players')
  for (const id of clean) await unlinkSibling(id)   // leave any old group cleanly
  const value = JSON.stringify({ ids: clean, rel: REL.has(rel) ? rel : '' })
  for (const id of clean) await prisma.appSetting.upsert({ where: { key: key(id) }, update: { value }, create: { key: key(id), value } })
  return clean
}

/** Take one player out of their group; a group left with one player goes away. */
export async function unlinkSibling(id: string) {
  const g = await getSiblingGroup(id)
  await prisma.appSetting.deleteMany({ where: { key: key(id) } }).catch(() => {})
  if (!g) return
  const rest = g.ids.filter(x => x !== id)
  if (rest.length < 2) { await prisma.appSetting.deleteMany({ where: { key: { in: rest.map(key) } } }).catch(() => {}); return }
  const value = JSON.stringify({ ids: rest, rel: g.rel })
  for (const x of rest) await prisma.appSetting.upsert({ where: { key: key(x) }, update: { value }, create: { key: key(x), value } })
}

/** For the Siblings post: everyone's first name in order, which one this is, and the title. */
export async function siblingCard(orgId: string, id: string): Promise<{ names: string[]; index: number; title: string } | null> {
  const g = await getSiblingGroup(id)
  if (!g) return null
  const subs = await Promise.all(g.ids.map(x => getSubmission(orgId, x).catch(() => null)))
  // Only siblings whose family said yes to posting are named (this card's player always is).
  const people = g.ids.map((x, i) => ({ id: x, d: subs[i]?.data || null })).filter(p => p.d && (p.id === id || String(p.d.photoOk || '') === 'yes'))
  if (people.length < 2) return null
  const first = (n: string) => String(n || '').trim().split(/\s+/)[0] || 'Player'
  return {
    names: people.map(p => first(p.d.playerName)),
    index: Math.max(0, people.findIndex(p => p.id === id)),
    title: siblingTitle(people.map(p => genderOf(p.d, String(p.d.division || ''))), g.rel),
  }
}
