// Storage for each org's Reel music list (see lib/reelMusic): one AppSetting row,
// `reelMusic:{orgId}`, holding the list as JSON. The MP3s themselves are in Blob
// storage (uploaded through /api/social/music/upload).
import { prisma } from '@/lib/db'
import { MUSIC_CATEGORIES, type OrgTrack } from '@/lib/reelMusic'

const key = (orgId: string) => `reelMusic:${orgId}`
export const MAX_TRACKS = 200
export const BLOB_HOST = /^https:\/\/[a-z0-9.-]+\.blob\.vercel-storage\.com\//i

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}

function clean(raw: any): OrgTrack | null {
  if (!raw || typeof raw !== 'object') return null
  const url = String(raw.url || '')
  if (!BLOB_HOST.test(url)) return null
  const category = MUSIC_CATEGORIES.some(c => c.id === raw.category) ? String(raw.category) : 'other'
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

export function newTrack(input: { title?: unknown; category?: unknown; url?: unknown }): OrgTrack | null {
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  return clean({ id, title: input.title, category: input.category, url: input.url, addedAt: new Date().toISOString() })
}
