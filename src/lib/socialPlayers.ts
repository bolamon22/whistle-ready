import { prisma } from '@/lib/db'
import { listSubmissions } from '@/lib/formSubmissions'
import { playerPassEnabled, teamOnly } from '@/lib/playerPass'
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

/** Boys or girls: the waiver's gender answer when the form asked, else the division or
 *  team name ("Girls U14", "Boys 2030"). '' when nothing says. */
function genderOf(d: any, division: string): 'boys' | 'girls' | '' {
  const g = String(d?.gender || '').trim().toLowerCase()
  if (/^(f|female|girl)/.test(g)) return 'girls'
  if (/^(m|male|boy)/.test(g)) return 'boys'
  const text = `${division} ${d?.teamName || ''}`.toLowerCase()
  if (/\b(girls?|women'?s?|womens|lady|ladies)\b/.test(text)) return 'girls'
  if (/\b(boys?|men'?s?|mens)\b/.test(text)) return 'boys'
  return ''
}

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
    select: { id: true, status: true, scheduledFor: true, publishedAt: true, placement: true, mediaType: true, groupId: true, permalink: true, socialAccount: { select: { platform: true } } },
  }).catch(() => [] as any[])
  const links = await getPostPlayersMany(posts.map(p => p.id)).catch(() => ({} as Record<string, PostPlayerLink>))
  // One compose to IG + FB (feed + Story) is one "use" of the player. Roll each group
  // up first: its furthest-along status, every platform it went to, and the live link
  // (Bo, Oct 18 2026: "know who's already been used in a post ... a log and a count").
  const RANK: Record<string, number> = { published: 5, publishing: 4, scheduled: 3, failed: 2, draft: 1 }
  type Use = ClearedPlayer['posts'][number] & { ids: string[] }
  const groups = new Map<string, Use>()
  for (const p of posts) {
    const l = links[p.id]; if (!l) continue
    const g = p.groupId || p.id
    const plat = String(p.socialAccount?.platform || '')
    const at = (p.status === 'published' && p.publishedAt ? p.publishedAt : p.scheduledFor).toISOString()
    const u = groups.get(g)
    if (!u) { groups.set(g, { postId: p.id, status: p.status, kind: l.kind, style: l.style, scheduledFor: at, platforms: plat ? [plat] : [], story: p.placement === 'story', permalink: p.permalink || '', ids: l.submissionIds }); continue }
    if (plat && !u.platforms!.includes(plat)) u.platforms!.push(plat)
    if (p.placement === 'story') u.story = true
    if ((RANK[p.status] || 0) > (RANK[u.status] || 0)) { u.status = p.status; u.postId = p.id; u.scheduledFor = at }
    // Prefer the Instagram link: that's the one families see.
    if (p.permalink && (!u.permalink || plat === 'instagram')) u.permalink = p.permalink
  }
  const byPlayer: Record<string, ClearedPlayer['posts']> = {}
  for (const { ids, ...u } of Array.from(groups.values())) {
    for (const sid of Array.from(new Set(ids))) (byPlayer[sid] ||= []).push({ ...u, platforms: u.platforms!.slice().sort().reverse() })
  }

  const players: ClearedPlayer[] = []
  let waiting = 0
  for (const e of events) {
    const subs = await listSubmissions({ orgId, formType: 'player', tournamentId: e.id, sort: 'name', limit: 20000 }).catch(() => [])
    const facts = startFacts(String(e.startDate || ''))
    // Each registered team's division (the waiver only names the club and team), for the
    // tray's filters: same lookup the player card uses (lib/playerPass).
    const divisionOf = new Map<string, string>()
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>('SELECT r.clubName AS club, t.teamName AS team, t.division AS division FROM "TeamRegistration" r JOIN "RegisteredTeam" t ON t.registrationId = r.id WHERE r.tournamentId = ? AND r.deletedAt IS NULL', e.id)
      for (const r of rows || []) divisionOf.set(`${String(r.club || '').trim().toLowerCase()}|${String(r.team || '').trim().toLowerCase()}`, String(r.division || '').trim())
    } catch {}
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
        division: String(d.division || '').trim() || divisionOf.get(`${String(d.clubName || '').trim().toLowerCase()}|${teamOnly(d).toLowerCase()}`) || '',
        gender: genderOf(d, divisionOf.get(`${String(d.clubName || '').trim().toLowerCase()}|${teamOnly(d).toLowerCase()}`) || String(d.division || '')),
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
