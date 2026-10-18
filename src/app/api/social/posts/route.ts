import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { randomUUID } from 'crypto'
import { isVideoUrl } from '@/lib/social'
import { cleanAudio, getPostAudioMany, setPostAudio, takesAudio } from '@/lib/socialAudio'
import { cleanPlayerLink, setPostPlayer, setPostCollab, getPostCollabMany } from '@/lib/socialPlayers'
import { cleanCollaborators, cleanHandles } from '@/lib/playerPostText'

// Queue + calendar data for the social scheduler. A post always starts as a
// 'draft' here — only PATCH .../posts/[id] with action:'approve' (director/
// admin only) moves it to 'scheduled', which is what the publish cron acts on.
// That two-step is deliberate: Bo reviews everything before it can go out.
export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ posts: [] })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')

  const where: any = { orgId: gate.orgId }
  if (status) where.status = status
  if (from || to) where.scheduledFor = { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) }

  const posts = await prisma.scheduledPost.findMany({
    where, orderBy: { scheduledFor: 'asc' },
    include: { socialAccount: { select: { id: true, platform: true, label: true, status: true } } },
  })
  // The Instagram song each Reel carries (AppSetting, see src/lib/socialAudio.ts).
  const audio = await getPostAudioMany(posts.filter(p => takesAudio(p, p.socialAccount?.platform)).map(p => p.id)).catch(() => ({} as Record<string, any>))
  // Instagram Collab invites (lib/socialPlayers), for the post drawer.
  const collab = await getPostCollabMany(posts.filter(p => p.socialAccount?.platform === 'instagram' && p.placement === 'feed').map(p => p.id)).catch(() => ({} as Record<string, any>))
  return NextResponse.json({ posts: posts.map(p => ({ ...p, ...(audio[p.id] ? { audio: audio[p.id] } : {}), ...(collab[p.id] ? { collab: collab[p.id] } : {}) })) })
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as any
  const { caption, mediaUrls, scheduledFor, firstComment } = body
  const urls: string[] = Array.isArray(mediaUrls) ? mediaUrls.filter((u: any) => typeof u === 'string' && u) : []
  // More than one file = an Instagram carousel (a multi-photo post on Facebook).
  const mediaType: 'image' | 'video' | 'carousel' = urls.length > 1 || body.mediaType === 'carousel' ? 'carousel' : body.mediaType === 'video' ? 'video' : 'image'
  if (mediaType === 'carousel' && (urls.length < 2 || urls.length > 10)) return NextResponse.json({ error: 'A carousel takes 2–10 photos or videos' }, { status: 400 })
  const thumbnailUrl: string = typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl : ''
  // A player post from the scheduler's tray brings its own 9:16 Story version of the
  // 4:5 feed graphic, so the Story copy fills the screen instead of showing bars.
  const storyMediaUrl: string = typeof body.storyMediaUrl === 'string' && /^(https:\/\/|\/api\/img\/)/.test(body.storyMediaUrl) ? body.storyMediaUrl : ''
  // The Story copy can go out at its own time (e.g. a couple of hours after the
  // feed post, for a second look). Defaults to the same time.
  const storyAt = body.storyScheduledFor ? new Date(body.storyScheduledFor) : null
  if (storyAt && isNaN(storyAt.getTime())) return NextResponse.json({ error: 'Story time is not a valid date' }, { status: 400 })
  // Where it goes: feed, story, or both (both = one row per placement, same group).
  const placements: ('feed' | 'story')[] = Array.isArray(body.placements) && body.placements.length
    ? Array.from(new Set(body.placements.filter((x: any) => x === 'feed' || x === 'story'))) as ('feed' | 'story')[]
    : [body.placement === 'story' ? 'story' : 'feed']
  // One compose can target several accounts (IG + FB is the normal case). Each
  // becomes its own ScheduledPost — separate publish, separate insights — tied
  // together by a shared groupId so approving one can approve its siblings.
  const ids: string[] = Array.isArray(body.socialAccountIds) ? body.socialAccountIds.filter(Boolean)
    : body.socialAccountId ? [body.socialAccountId] : []
  if (!ids.length || !scheduledFor) {
    return NextResponse.json({ error: 'At least one account and a scheduledFor are required' }, { status: 400 })
  }
  const accounts = await prisma.socialAccount.findMany({ where: { id: { in: ids }, orgId: gate.orgId, status: { not: 'disconnected' } } })
  if (accounts.length !== ids.length) return NextResponse.json({ error: 'One of those accounts isn\'t connected to your organization' }, { status: 404 })

  const groupId = accounts.length * placements.length > 1 ? randomUUID() : ''
  const posts = []
  for (const account of accounts) {
    for (const placement of placements) {
      posts.push(await prisma.scheduledPost.create({
        data: {
          orgId: gate.orgId, socialAccountId: account.id, caption: caption || '',
          // Stories have no caption/first comment on either platform.
          firstComment: placement === 'feed' && typeof firstComment === 'string' ? firstComment : '',
          // A Story carries one file: a carousel's Story copy is its first slide.
          ...(placement === 'story' && storyMediaUrl
            ? { mediaUrls: JSON.stringify([storyMediaUrl]), mediaType: 'image', thumbnailUrl: '' }
            : placement === 'story' && mediaType === 'carousel'
            ? { mediaUrls: JSON.stringify(urls.slice(0, 1)), mediaType: isVideoUrl(urls[0]) ? 'video' : 'image', thumbnailUrl: isVideoUrl(urls[0]) ? thumbnailUrl : '' }
            : { mediaUrls: JSON.stringify(urls), mediaType, thumbnailUrl }),
          placement,
          scheduledFor: placement === 'story' && storyAt ? storyAt : new Date(scheduledFor), status: 'draft', createdByUserId: gate.userId, groupId,
        },
      }))
    }
  }
  // An Instagram song only rides on the Instagram Reel(s) in the set.
  const audio = cleanAudio(body.audio)
  if (audio) {
    const igIds = new Set(accounts.filter(a => a.platform === 'instagram').map(a => a.id))
    for (const p of posts) if (igIds.has(p.socialAccountId) && takesAudio(p, 'instagram')) await setPostAudio(p.id, audio)
  }
  // Collab invites ride on the Instagram feed post only (Instagram doesn't take them
  // on Stories, and Facebook has no equivalent through the API).
  // Squad Reels also tag the people the 3 Collab slots couldn't take (not on carousels).
  const collaborators = cleanCollaborators(body.collaborators)
  const userTags = mediaType === 'carousel' ? [] : cleanHandles(body.userTags, 20).filter(u => !collaborators.some(c => c.toLowerCase() === u.toLowerCase()))
  if (collaborators.length || userTags.length) {
    const igIds = new Set(accounts.filter(a => a.platform === 'instagram').map(a => a.id))
    for (const p of posts) if (igIds.has(p.socialAccountId) && p.placement === 'feed') await setPostCollab(p.id, { usernames: collaborators, tags: userTags }).catch(() => {})
  }
  // Which cleared player(s) this features, so the tray marks them posted.
  const player = cleanPlayerLink(body.player)
  if (player) for (const p of posts) await setPostPlayer(p.id, player).catch(() => {})
  return NextResponse.json({ ok: true, post: posts[0], posts })
}
