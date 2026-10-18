import { prisma } from '@/lib/db'
import { listSubmissions } from '@/lib/formSubmissions'
import { playerPassEnabled } from '@/lib/playerPass'
import { eventDates } from '@/lib/vendorApproval'
import { startFacts } from '@/lib/socialPosts'
import { instagramHandle } from '@/lib/photoConsent'
import { cleanCollaborators, cleanHandles, type PostPlayerLink, type ClearedPlayer } from '@/lib/playerPostText'

// Cleared players on the social scheduler (Bo, Oct 18 2026: "can we put the yes's on
// the social scheduler as potential posts ... just a few clicks to post a reel or add
// to story"). A player is cleared when a parent answered Yes on the photo-permission
// page (lib/photoConsent: photoOk = 'yes' on the waiver). The scheduler's tray lists
// them with their handles; one tap opens Compose with the post, caption and Collab
// invites filled in.
//
// Two small records per post, kept in AppSetting like the Instagram song
// (lib/socialAudio) so ScheduledPost needs no new columns:
//   postPlayer:{postId}  which player(s) the post features, so the tray can show
//                        "Posted" and nobody is featured twice by accident
//   postCollab:{postId}  Instagram usernames to invite as Collaborators (max 3, feed
//                        image / Reel / carousel only: Instagram doesn't take them on
//                        Stories). `dropped` is set at publish time when Instagram
//                        refused them, and the post then goes out without them.

const playerKey = (postId: string) => `postPlayer:${postId}`
const collabKey = (postId: string) => `postCollab:${postId}`

async function ensureTable() {
  try { await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AppSetting" ("key" TEXT NOT NULL PRIMARY KEY, "value" TEXT NOT NULL, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`) } catch {}
}
async function put(key: string, value: string) {
  await prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
}

// ── which players a post features ─────────────────────────────────────────────

export function cleanPlayerLink(raw: any): PostPlayerLink | null {
  if (!raw || typeof raw !== 'object') return null
  const ids = (Array.isArray(raw.submissionIds) ? raw.submissionIds : [raw.submissionId]).map((x: any) => String(x || '').trim()).filter((x: string) => /^[\w-]{4,64}$/.test(x)).slice(0, 10)
  if (!ids.length) return null
  const kind = ['post', 'reel', 'story', 'rollcall'].includes(raw.kind) ? raw.kind : 'post'
  return { submissionIds: ids, tournamentId: String(raw.tournamentId || '').slice(0, 64), style: String(raw.style || '').slice(0, 40), kind, days: Number.isFinite(Number(raw.days)) ? Number(raw.days) : null }
}

export async function setPostPlayer(postId: string, link: PostPlayerLink): Promise<void> {
  await ensureTable(); await put(playerKey(postId), JSON.stringify(link))
}

export async function getPostPlayersMany(postIds: string[]): Promise<Record<string, PostPlayerLink>> {
  if (!postIds.length) return {}
  await ensureTable()
  const out: Record<string, PostPlayerLink> = {}
  for (let i = 0; i < postIds.length; i += 400) {
    const rows = await prisma.appSetting.findMany({ where: { key: { in: postIds.slice(i, i + 400).map(playerKey) } } }).catch(() => [] as { key: string; value: string }[])
    for (const r of rows) { try { const l = cleanPlayerLink(JSON.parse(r.value)); if (l) out[r.key.slice('postPlayer:'.length)] = l } catch {} }
  }
  return out
}

// ── Collab invites ────────────────────────────────────────────────────────────

/** usernames: Collab invites (max 3). tags: people tagged in the Reel or photo (Squad
 *  Reels: everyone the 3 Collab slots couldn't take). dropped / droppedTags: why
 *  Instagram refused them at publish time. */
export type PostCollab = { usernames: string[]; tags?: string[]; dropped?: string; droppedTags?: string }

function readCollab(raw: string): PostCollab | null {
  try {
    const v = JSON.parse(raw)
    const usernames = cleanCollaborators(v.usernames), tags = cleanHandles(v.tags)
    if (!usernames.length && !tags.length) return null
    return { usernames, ...(tags.length ? { tags } : {}), ...(v.dropped ? { dropped: String(v.dropped) } : {}), ...(v.droppedTags ? { droppedTags: String(v.droppedTags) } : {}) }
  } catch { return null }
}

export async function setPostCollab(postId: string, c: PostCollab | null): Promise<void> {
  await ensureTable()
  const usernames = cleanCollaborators(c?.usernames), tags = cleanHandles(c?.tags)
  if (!c || (!usernames.length && !tags.length)) { await prisma.appSetting.deleteMany({ where: { key: collabKey(postId) } }).catch(() => {}); return }
  await put(collabKey(postId), JSON.stringify({ usernames, ...(tags.length ? { tags } : {}), ...(c.dropped ? { dropped: c.dropped.slice(0, 300) } : {}), ...(c.droppedTags ? { droppedTags: c.droppedTags.slice(0, 300) } : {}) }))
}

export async function getPostCollab(postId: string): Promise<PostCollab | null> {
  await ensureTable()
  const row = await prisma.appSetting.findUnique({ where: { key: collabKey(postId) } }).catch(() => null)
  return row ? readCollab(row.value) : null
}

export async function getPostCollabMany(postIds: string[]): Promise<Record<string, PostCollab>> {
  if (!postIds.length) return {}
  await ensureTable()
  const rows = await prisma.appSetting.findMany({ where: { key: { in: postIds.map(collabKey) } } }).catch(() => [] as { key: string; value: string }[])
  const out: Record<string, PostCollab> = {}
  for (const r of rows) { const c = readCollab(r.value); if (c) out[r.key.slice('postCollab:'.length)] = c }
  return out
}

// ── the tray ──────────────────────────────────────────────────────────────────

/** Every player with a family Yes at the org's upcoming events (still running or
 *  not yet started), with what's already been scheduled for each. Also counts the
 *  families still deciding, so an empty tray can say why. */
export async function loadClearedPlayers(orgId: string): Promise<{ players: ClearedPlayer[]; waiting: number; passOn: boolean }> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
  let events: any[] = []
  try {
    events = await prisma.$queryRawUnsafe(
      'SELECT id, name, startDate, endDate, location FROM "Tournament" WHERE orgId = ? AND startDate != \'\' AND (endDate >= ? OR startDate >= ?) ORDER BY startDate ASC LIMIT 12',
      orgId, today, today)
  } catch { events = [] }
  const passOn = await playerPassEnabled(orgId).catch(() => false)
  if (!events.length) return { players: [], waiting: 0, passOn }

  // What the scheduler already holds for each player (anything not canceled; a
  // deleted post simply has no row any more).
  const posts = await prisma.scheduledPost.findMany({
    where: { orgId, status: { not: 'canceled' }, createdAt: { gte: new Date(Date.now() - 200 * 864e5) } },
    select: { id: true, status: true, scheduledFor: true, placement: true, mediaType: true, groupId: true },
  }).catch(() => [])
  const links = await getPostPlayersMany(posts.map(p => p.id)).catch(() => ({} as Record<string, PostPlayerLink>))
  const byPlayer: Record<string, ClearedPlayer['posts']> = {}
  const seenGroup = new Set<string>()
  for (const p of posts) {
    const l = links[p.id]; if (!l) continue
    // One compose to IG + FB (feed + Story) is one "post" for the tray.
    const g = p.groupId || p.id
    for (const sid of l.submissionIds) {
      const k = `${sid}|${g}`; if (seenGroup.has(k)) continue; seenGroup.add(k)
      ;(byPlayer[sid] ||= []).push({ postId: p.id, status: p.status, kind: l.kind, style: l.style, scheduledFor: p.scheduledFor.toISOString() })
    }
  }

  const players: ClearedPlayer[] = []
  let waiting = 0
  for (const e of events) {
    const subs = await listSubmissions({ orgId, formType: 'player', tournamentId: e.id, sort: 'name', limit: 20000 }).catch(() => [])
    const facts = startFacts(String(e.startDate || ''))
    for (const s of subs) {
      const d = s.data || {}
      if (!String(d.photoUrl || '').trim()) continue
      const ok = String(d.photoOk || '')
      if (!ok && d.photoAskAt) waiting++
      if (ok !== 'yes' || !s.passToken) continue
      players.push({
        id: s.id,
        tournamentId: e.id,
        event: { name: String(e.name || '').trim(), start: String(e.startDate || '').slice(0, 10), end: String(e.endDate || e.startDate || '').slice(0, 10), dates: eventDates(String(e.startDate || ''), String(e.endDate || '')), location: String(e.location || ''), daysOut: facts.daysOut },
        playerName: String(d.playerName || '').trim(),
        jersey: String(d.jerseyNumber || ''),
        position: String(d.position || ''),
        club: String(d.clubName || ''),
        team: String(d.teamName || ''),
        token: s.passToken,
        okAt: String(d.photoOkAt || ''),
        instagram: instagramHandle(d.photoIg),
        clubInstagram: instagramHandle(d.photoClubIg),
        clubFacebook: String(d.photoClubFb || ''),
        posts: (byPlayer[s.id] || []).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)),
      })
    }
  }
  // Newest yes first within an event, soonest event first.
  players.sort((a, b) => a.event.start.localeCompare(b.event.start) || b.okAt.localeCompare(a.okAt))
  return { players, waiting, passOn }
}
