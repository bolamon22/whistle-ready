import { prisma } from '@/lib/db'
import { createInstagramContainer, getInstagramContainerStatus, publishInstagramContainer, publishFacebook, postFirstComment, refreshLongLivedToken, type PublishSpec } from '@/lib/social'
import { sendPushToOrg } from '@/lib/push'
import { encrypt, decrypt } from '@/lib/encrypt'

export type PublishOutcome = { id: string; status: 'published' | 'failed' | 'skipped' | 'pending'; error?: string }

type PostWithAccount = NonNullable<Awaited<ReturnType<typeof loadPost>>>
async function loadPost(id: string) { return prisma.scheduledPost.findUnique({ where: { id }, include: { socialAccount: true } }) }

function specOf(post: PostWithAccount): PublishSpec | null {
  let mediaUrls: string[] = []
  try { mediaUrls = JSON.parse(post.mediaUrls || '[]') } catch { mediaUrls = [] }
  if (!mediaUrls.length) return null
  return {
    mediaType: post.mediaType === 'video' ? 'video' : 'image',
    placement: post.placement === 'story' ? 'story' : 'feed',
    mediaUrl: mediaUrls[0], caption: post.caption, coverUrl: post.thumbnailUrl || undefined,
  }
}

async function fail(post: PostWithAccount, msg: string, notify = true): Promise<PublishOutcome> {
  await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'failed', lastError: msg, externalContainerId: '' } })
  if (notify) await sendPushToOrg(post.orgId, { title: 'Social post failed to publish', body: `${post.socialAccount?.label || 'Account'}: ${msg}`, url: '/dashboard/org/social', tag: 'social-publish-failed' })
  return { id: post.id, status: 'failed', error: msg }
}

async function markPublished(post: PostWithAccount, externalPostId: string): Promise<PublishOutcome> {
  // The post is live from here on — a first-comment failure is recorded, never
  // allowed to flip a published post back to 'failed'.
  let lastError = ''
  if (post.firstComment.trim() && post.placement !== 'story' && post.socialAccount) {
    const c = await postFirstComment(post.socialAccount, externalPostId, post.firstComment.trim())
    if (!c.ok) lastError = `Published, but the first comment didn't post: ${c.error}`
  }
  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: 'published', externalPostId, publishedAt: new Date(), lastError, externalContainerId: '' },
  })
  return { id: post.id, status: 'published', error: lastError || undefined }
}

/** Waits on an Instagram container until it's FINISHED (or gives up after `budgetMs`
 *  and leaves the post in 'publishing' with the container id saved — the cron's
 *  finishPendingContainers() picks it up on its next run). Videos typically take
 *  20–90 s to transcode on Meta's side; images are usually instant. */
async function finishInstagram(post: PostWithAccount, containerId: string, budgetMs: number): Promise<PublishOutcome> {
  const account = post.socialAccount!
  const deadline = Date.now() + budgetMs
  for (;;) {
    const st = await getInstagramContainerStatus(account, containerId)
    if (!st.ok) return fail(post, st.error)
    if (st.data.status === 'FINISHED') {
      const pub = await publishInstagramContainer(account, containerId)
      if (!pub.ok) return fail(post, pub.error)
      return markPublished(post, pub.data.externalPostId)
    }
    if (st.data.status === 'ERROR' || st.data.status === 'EXPIRED') {
      return fail(post, `Instagram couldn't process the ${post.mediaType === 'video' ? 'video' : 'image'}${st.data.detail ? `: ${st.data.detail}` : ''} — check the file meets Reels/Stories specs (MP4, ≤15 min for Reels, ≤60 s for Stories).`)
    }
    if (Date.now() > deadline) {
      await prisma.scheduledPost.update({ where: { id: post.id }, data: { externalContainerId: containerId, lastError: '' } })
      return { id: post.id, status: 'pending' }
    }
    await new Promise(r => setTimeout(r, 4000))
  }
}

/**
 * Publishes ONE ScheduledPost end to end: claim it (so an overlapping cron run or a
 * simultaneous "Publish now" can't double-post), refresh the account token if it's
 * about to expire, push the media to Meta, then drop the first comment.
 * Used by the publish cron and by the Publish-now action — one code path.
 *
 * `fromStatus` is the status the row must currently have for the claim to succeed
 * ('scheduled' for the cron; Publish-now passes whatever the post is in).
 * `waitMs` is how long to wait for Instagram video processing before handing off
 * to the cron (Publish-now can afford more than the cron's per-post share).
 */
export async function publishScheduledPost(postId: string, fromStatus: string | string[] = 'scheduled', waitMs = 25_000): Promise<PublishOutcome> {
  const claim = await prisma.scheduledPost.updateMany({
    where: { id: postId, status: Array.isArray(fromStatus) ? { in: fromStatus } : fromStatus },
    data: { status: 'publishing' },
  })
  if (claim.count === 0) return { id: postId, status: 'skipped' } // someone else already has it

  const post = await loadPost(postId)
  if (!post) return { id: postId, status: 'skipped' }

  const account = post.socialAccount
  if (!account || account.status !== 'active') return fail(post, !account ? 'Social account no longer exists' : `Social account is ${account.status}`)

  // Opportunistic token refresh — a long-lived token is good for ~60 days; renew it
  // once it's within 5 days of expiring so accounts don't silently drop.
  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < 5 * 24 * 60 * 60 * 1000) {
    const refreshed = await refreshLongLivedToken(decrypt(account.accessToken))
    if (refreshed.ok) {
      const accessToken = encrypt(refreshed.data.token)
      await prisma.socialAccount.update({ where: { id: account.id }, data: { accessToken, tokenExpiresAt: new Date(Date.now() + refreshed.data.expiresInSeconds * 1000) } })
      account.accessToken = accessToken
    }
  }

  const spec = specOf(post)
  if (!spec) return fail(post, `No ${post.mediaType === 'video' ? 'video' : 'photo'} attached to this post`, false)

  if (account.platform === 'facebook') {
    const r = await publishFacebook(account, spec)
    if (!r.ok) return fail(post, r.error)
    return markPublished(post, r.data.externalPostId)
  }
  if (account.platform === 'instagram') {
    const c = await createInstagramContainer(account, spec)
    if (!c.ok) return fail(post, c.error)
    return finishInstagram(post, c.data.containerId, waitMs)
  }
  return fail(post, `Unsupported platform: ${account.platform}`)
}

/** Second half of any Instagram publish that ran out of time waiting on transcoding:
 *  rows still in 'publishing' with a container id. Called by the cron each run. */
export async function finishPendingContainers(budgetMs = 20_000): Promise<PublishOutcome[]> {
  const pending = await prisma.scheduledPost.findMany({
    where: { status: 'publishing', externalContainerId: { not: '' } },
    orderBy: { scheduledFor: 'asc' }, take: 5, include: { socialAccount: true },
  })
  const out: PublishOutcome[] = []
  for (const post of pending) {
    if (!post.socialAccount) { out.push(await fail(post, 'Social account no longer exists')); continue }
    // A container that's been stuck > 2 hours isn't coming back — Meta expires them.
    if (Date.now() - post.updatedAt.getTime() > 2 * 60 * 60 * 1000) { out.push(await fail(post, 'Instagram never finished processing this video (timed out after 2 hours)')); continue }
    out.push(await finishInstagram(post, post.externalContainerId, budgetMs / pending.length))
  }
  return out
}
