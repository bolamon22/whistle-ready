import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { randomUUID } from 'crypto'

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
  return NextResponse.json({ posts })
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as any
  const { caption, mediaUrls, scheduledFor, firstComment } = body
  const mediaType: 'image' | 'video' = body.mediaType === 'video' ? 'video' : 'image'
  const thumbnailUrl: string = typeof body.thumbnailUrl === 'string' ? body.thumbnailUrl : ''
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
          mediaUrls: JSON.stringify(Array.isArray(mediaUrls) ? mediaUrls : []),
          mediaType, placement, thumbnailUrl,
          scheduledFor: new Date(scheduledFor), status: 'draft', createdByUserId: gate.userId, groupId,
        },
      }))
    }
  }
  return NextResponse.json({ ok: true, post: posts[0], posts })
}
