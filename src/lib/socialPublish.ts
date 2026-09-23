import { prisma } from '@/lib/db'
import { publishPost, postFirstComment, refreshLongLivedToken } from '@/lib/social'
import { sendPushToOrg } from '@/lib/push'
import { encrypt, decrypt } from '@/lib/encrypt'

export type PublishOutcome = { id: string; status: 'published' | 'failed' | 'skipped'; error?: string }

/**
 * Publishes ONE ScheduledPost end to end: claim it (so an overlapping cron run or a
 * simultaneous "Publish now" can't double-post), refresh the account token if it's
 * about to expire, push the media + caption to Meta, then drop the first comment.
 * Used by the publish cron and by the Publish-now action — one code path, so the
 * two can never drift apart in how a post goes out.
 *
 * `fromStatus` is the status the row must currently have for the claim to succeed
 * ('scheduled' for the cron; Publish-now passes whatever the post is in).
 */
export async function publishScheduledPost(postId: string, fromStatus: string | string[] = 'scheduled'): Promise<PublishOutcome> {
  const claim = await prisma.scheduledPost.updateMany({
    where: { id: postId, status: Array.isArray(fromStatus) ? { in: fromStatus } : fromStatus },
    data: { status: 'publishing' },
  })
  if (claim.count === 0) return { id: postId, status: 'skipped' } // someone else already has it

  const post = await prisma.scheduledPost.findUnique({ where: { id: postId }, include: { socialAccount: true } })
  if (!post) return { id: postId, status: 'skipped' }

  const fail = async (msg: string, notify = true): Promise<PublishOutcome> => {
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'failed', lastError: msg } })
    if (notify) await sendPushToOrg(post.orgId, { title: 'Social post failed to publish', body: `${post.socialAccount?.label || 'Account'}: ${msg}`, url: '/dashboard/org/social', tag: 'social-publish-failed' })
    return { id: post.id, status: 'failed', error: msg }
  }

  const account = post.socialAccount
  if (!account || account.status !== 'active') return fail(!account ? 'Social account no longer exists' : `Social account is ${account.status}`)

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

  let mediaUrls: string[] = []
  try { mediaUrls = JSON.parse(post.mediaUrls || '[]') } catch { mediaUrls = [] }
  if (!mediaUrls.length) return fail('No photo attached to this post', false)

  const published = await publishPost(
    { platform: account.platform, externalId: account.externalId, accessToken: account.accessToken },
    { imageUrl: mediaUrls[0], caption: post.caption },
  )
  if (!published.ok) return fail(published.error)

  // The post is live from here on — a first-comment failure is recorded, never
  // allowed to flip a published post back to 'failed'.
  let lastError = ''
  if (post.firstComment.trim()) {
    const c = await postFirstComment(account, published.data.externalPostId, post.firstComment.trim())
    if (!c.ok) lastError = `Published, but the first comment didn't post: ${c.error}`
  }

  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: 'published', externalPostId: published.data.externalPostId, publishedAt: new Date(), lastError },
  })
  return { id: post.id, status: 'published', error: lastError || undefined }
}
