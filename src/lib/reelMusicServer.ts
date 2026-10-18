// Storage for each org's Reel music list (see lib/reelMusic): one AppSetting row,
// `reelMusic:{orgId}`, holding the list as JSON. The MP3s themselves are in Blob
// storage (uploaded through /api/social/music/upload).
import { prisma } from '@/lib/db'
import { customCategoryId, type OrgTrack, type MusicCategory } from '@/lib/reelMusic'

const key = (orgId: string) => `reelMusic:${orgId}`
const catKey = (orgId: string) => `reelMusicCats:${orgId}`
export const CATEGORY_ID = /^[a-z0-9-]{1,40}$/
export const MAX_TRACKS = 200
export const BLOB_HOST = /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}

function clean(raw: any): OrgTrack | null {
  if (!raw || typeof raw !== 'object') return null
  const url = String(raw.url || '')
  if (!BLOB_HOST.test(url)) return null
  // Any well-formed id: built-in or one of the org's own (an unknown one shows under Other).
  const category = CATEGORY_ID.test(String(raw.category || '')) ? String(raw.category) : 'other'
  return { id: String(raw.id || '').slice(0, 40), title: String(raw.title || 'Track').trim().slice(0, 80) || 'Track', category, url, addedAt: String(raw.addedAt || new Date().toISOString()) }
}

export async function getOrgMusic(orgId: string): Promise<OrgTrack[]> {
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: key(orgId) } }).catch(() => null)
  if (!row) return []
  try { return (JSON.parse(row.value) as any[]).map(clean).filter((t): t is OrgTrack => !!t && !!t.id) } catch { return [] }
}

export async function setOrgMusic(orgId: string, tracks: OrgTrack[]) {
  await ensureTable()
  const value = JSON.stringify(tracks.slice(0, MAX_TRACKS))
  await prisma.appSetting.upsert({ where: { key: key(orgId) }, update: { value }, create: { key: key(orgId), value } })
}

export async function getOrgCategories(orgId: string): Promise<MusicCategory[]> {
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: catKey(orgId) } }).catch(() => null)
  try { return ((row ? JSON.parse(row.value) : []) as any[]).map(c => ({ id: String(c?.id || ''), label: String(c?.label || '').slice(0, 40) })).filter(c => c.id && c.label) } catch { return [] }
}
export async function setOrgCategories(orgId: string, cats: MusicCategory[]) {
  await ensureTable()
  const value = JSON.stringify(cats.slice(0, 30))
  await prisma.appSetting.upsert({ where: { key: catKey(orgId) }, update: { value }, create: { key: catKey(orgId), value } })
}
export function newCategory(label: unknown): MusicCategory | null {
  const l = String(label || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const id = customCategoryId(l)
  return l && id.length > 2 ? { id, label: l } : null
}

export function newTrack(input: { title?: unknown; category?: unknown; url?: unknown }): OrgTrack | null {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  return clean({ id, title: input.title, category: input.category, url: input.url, addedAt: new Date().toISOString() })
}
