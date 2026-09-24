import { NextRequest, NextResponse } from 'next/server'
import { requireStaff, requireDirector } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { publishScheduledPost, recoverStuckPosts } from '@/lib/socialPublish'

// Publish-now waits on Instagram video processing, so it needs the longer limit.
export const maxDuration = 60

const TERMINAL = ['published', 'publishing']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const post = await prisma.scheduledPost.findFirst({ where: { id: params.id, orgId: gate.orgId } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as any
  const action = body.action as string | undefined

  if (action === 'approve') {
    // Publishing is the sensitive step — only a director/admin can move a post
    // out of draft, mirroring Bo's standing "I review everything before it goes
    // out" rule directly in the API, not just in a UI that could be skipped.
    const dGate = await requireDirector()
    if (!dGate.ok) return dGate.res
    if (post.status !== 'draft') return NextResponse.json({ error: `Cannot approve a post that is already ${post.status}` }, { status: 400 })
    const data = { status: 'scheduled', approvedByUserId: dGate.userId, approvedAt: new Date() }
    const updated = await prisma.scheduledPost.update({ where: { id: post.id }, data })
    // A multi-account compose is one decision for Bo, not N — approving one draft
    // approves its still-draft siblings too (default on; pass applyToGroup:false to opt out).
    let alsoApproved = 0
    if (post.groupId && body.applyToGroup !== false) {
      const r = await prisma.scheduledPost.updateMany({ where: { groupId: post.groupId, orgId: gate.orgId, status: 'draft', id: { not: post.id } }, data })
      alsoApproved = r.count
    }
    return NextResponse.json({ ok: true, post: updated, alsoApproved })
  }

  if (action === 'check') {
    // "Check now" on a post stuck in Publishing: look on the account and settle it —
    // published if it's there, keep waiting if Instagram is still processing,
    // failed (safe to retry) if it never went out. Same logic the cron runs.
    if (post.status !== 'publishing') return NextResponse.json({ ok: true, post })
    const [outcome] = await recoverStuckPosts([post.id])
    const fresh = await prisma.scheduledPost.findUnique({ where: { id: post.id } })
    return NextResponse.json({ ok: true, outcome: outcome?.status || 'pending', post: fresh })
  }

  if (action === 'publish-now') {
    // Skips the wait for the cron and publishes this instant. Director only — it's
    // an approval and a publish in one. Goes through the same publishScheduledPost
    // path the cron uses, so the claim/refresh/first-comment behavior is identical.
    const dGate = await requireDirector()
    if (!dGate.ok) return dGate.res
    if (!['draft', 'scheduled', 'failed'].includes(post.status)) return NextResponse.json({ error: `Cannot publish a post that is ${post.status}` }, { status: 400 })
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { approvedByUserId: dGate.userId, approvedAt: new Date(), scheduledFor: new Date(), lastError: '' } })
    const outcome = await publishScheduledPost(post.id, ['draft', 'scheduled', 'failed'])
    const fresh = await prisma.scheduledPost.findUnique({ where: { id: post.id } })
    if (outcome.status === 'failed') return NextResponse.json({ ok: false, error: outcome.error || 'Publish failed', post: fresh }, { status: 502 })
    return NextResponse.json({ ok: true, post: fresh, warning: outcome.error })
  }

  if (action === 'unapprove') {
    // Pull an approved post back to draft (director only — same trust level as
    // approving). Only makes sense while the cron hasn't picked it up yet.
    const dGate = await requireDirector()
    if (!dGate.ok) return dGate.res
    if (post.status !== 'scheduled') return NextResponse.json({ error: `Only a scheduled post can be moved back to draft (this one is ${post.status})` }, { status: 400 })
    const updated = await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: 'draft', approvedByUserId: '', approvedAt: null },
    })
    return NextResponse.json({ ok: true, post: updated })
  }

  if (action === 'retry') {
    // Re-queue a failed post. It was already approved once, so it goes straight
    // back to 'scheduled' — but still director-only, since it re-arms a publish.
    // An optional new scheduledFor lets the UI push it forward if the old time passed.
    const dGate = await requireDirector()
    if (!dGate.ok) return dGate.res
    if (post.status !== 'failed') return NextResponse.json({ error: `Only a failed post can be retried (this one is ${post.status})` }, { status: 400 })
    const when = body.scheduledFor ? new Date(body.scheduledFor) : (post.scheduledFor.getTime() < Date.now() ? new Date(Date.now() + 5 * 60 * 1000) : post.scheduledFor)
    const updated = await prisma.scheduledPost.update({
      where: { id: post.id },
      data: { status: 'scheduled', lastError: '', scheduledFor: when, approvedByUserId: dGate.userId, approvedAt: new Date() },
    })
    return NextResponse.json({ ok: true, post: updated })
  }

  if (action === 'cancel') {
    if (TERMINAL.includes(post.status) || post.status === 'published') {
      return NextResponse.json({ error: 'Cannot cancel a post that already published' }, { status: 400 })
    }
    const updated = await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'canceled' } })
    return NextResponse.json({ ok: true, post: updated })
  }

  // Plain field edit (caption / mediaUrls / scheduledFor) — only while the post
  // hasn't started publishing. Editing a 'scheduled' post is fine (the cron
  // hasn't picked it up yet); it does NOT re-require approval, since nothing
  // about who approved it changed — only the content.
  if (TERMINAL.includes(post.status) || post.status === 'published') {
    return NextResponse.json({ error: `Cannot edit a post that is already ${post.status}` }, { status: 400 })
  }
  const data: any = {}
  if (typeof body.caption === 'string') data.caption = body.caption
  if (typeof body.firstComment === 'string') data.firstComment = body.firstComment
  if (body.mediaType === 'image' || body.mediaType === 'video') data.mediaType = body.mediaType
  if (body.placement === 'feed' || body.placement === 'story') data.placement = body.placement
  if (typeof body.thumbnailUrl === 'string') data.thumbnailUrl = body.thumbnailUrl
  if (Array.isArray(body.mediaUrls)) data.mediaUrls = JSON.stringify(body.mediaUrls)
  if (body.scheduledFor) data.scheduledFor = new Date(body.scheduledFor)
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const updated = await prisma.scheduledPost.update({ where: { id: post.id }, data })
  return NextResponse.json({ ok: true, post: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const post = await prisma.scheduledPost.findFirst({ where: { id: params.id, orgId: gate.orgId } })
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (post.status === 'published' || post.status === 'publishing') {
    return NextResponse.json({ error: 'Cannot delete a post that already published — cancel isn\'t available after the fact on Instagram/Facebook either' }, { status: 400 })
  }
  await prisma.scheduledPost.delete({ where: { id: post.id } })
  return NextResponse.json({ ok: true })
}
