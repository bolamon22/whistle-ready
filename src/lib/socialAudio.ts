import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/encrypt'

// Instagram's own music on scheduled Reels (Meta's Audio API — see
// SOCIAL-SCHEDULER.md). The song a post should carry is kept in AppSetting
// `postAudio:{postId}`, not a ScheduledPost column: every Prisma read of
// ScheduledPost would break on a missing column until the migration ran, and a
// song choice is only ever read for one post at a time (publish) or a page of
// posts (the calendar). Same no-migration pattern as the queue and the ideas.

export type PostAudio = {
  audioId: string; title: string; artist: string; cover: string; durationMs: number
  audioVolume: number; videoVolume: number
  /** Set at publish time when the song couldn't be attached (pulled by Instagram, etc.). */
  dropped?: string
}

const key = (postId: string) => `postAudio:${postId}`
const userTokenKey = (orgId: string) => `socialUserToken:${orgId}`

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}

const vol = (v: any, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : d }

/** Validates whatever the page sent. null = no song. */
export function cleanAudio(raw: any): PostAudio | null {
  if (!raw || typeof raw !== 'object') return null
  const audioId = String(raw.audioId || '').trim()
  if (!/^\d{5,30}$/.test(audioId)) return null
  return {
    audioId,
    title: String(raw.title || '').slice(0, 200), artist: String(raw.artist || '').slice(0, 200),
    cover: /^https:\/\//.test(String(raw.cover || '')) ? String(raw.cover).slice(0, 1000) : '',
    durationMs: Math.max(0, Math.round(Number(raw.durationMs) || 0)),
    audioVolume: vol(raw.audioVolume, 100), videoVolume: vol(raw.videoVolume, 100),
  }
}

/** Only an Instagram feed video (a Reel) can carry an Instagram song. */
export function takesAudio(row: { placement: string; mediaType: string }, platform?: string | null): boolean {
  return platform === 'instagram' && row.placement === 'feed' && row.mediaType === 'video'
}

export async function getPostAudio(postId: string): Promise<PostAudio | null> {
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: key(postId) } }).catch(() => null)
  if (!row) return null
  try { const v = JSON.parse(row.value); const a = cleanAudio(v); return a ? { ...a, ...(v.dropped ? { dropped: String(v.dropped) } : {}) } : null } catch { return null }
}

export async function getPostAudioMany(postIds: string[]): Promise<Record<string, PostAudio>> {
  if (!postIds.length) return {}
  await ensureTable()
  const rows = await prisma.appSetting.findMany({ where: { key: { in: postIds.map(key) } } }).catch(() => [] as { key: string; value: string }[])
  const out: Record<string, PostAudio> = {}
  for (const r of rows) {
    try { const v = JSON.parse(r.value); const a = cleanAudio(v); if (a) out[r.key.slice('postAudio:'.length)] = { ...a, ...(v.dropped ? { dropped: String(v.dropped) } : {}) } } catch {}
  }
  return out
}

export async function setPostAudio(postId: string, a: PostAudio | null): Promise<void> {
  await ensureTable()
  if (!a) { await prisma.appSetting.deleteMany({ where: { key: key(postId) } }).catch(() => {}); return }
  const value = JSON.stringify(a)
  await prisma.appSetting.upsert({ where: { key: key(postId) }, update: { value }, create: { key: key(postId), value } })
}

// Meta's docs call for a *user* access token on the audio endpoints, while each
// connected account stores its Page token (what publishing uses). The long-lived
// user token from the Connect flow is kept here, encrypted, so music search can
// fall back to it. Accounts connected before this existed simply reconnect once.
export async function saveOrgUserToken(orgId: string, token: string, expiresAt: Date): Promise<void> {
  try {
    await ensureTable()
    const value = JSON.stringify({ token: encrypt(token), expiresAt: expiresAt.toISOString() })
    await prisma.appSetting.upsert({ where: { key: userTokenKey(orgId) }, update: { value }, create: { key: userTokenKey(orgId), value } })
  } catch { /* best-effort: page tokens may be enough */ }
}

export async function loadOrgUserToken(orgId: string): Promise<string | null> {
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: userTokenKey(orgId) } }).catch(() => null)
  if (!row) return null
  try {
    const v = JSON.parse(row.value)
    if (v.expiresAt && new Date(v.expiresAt).getTime() < Date.now()) return null
    return decrypt(v.token)
  } catch { return null }
}
