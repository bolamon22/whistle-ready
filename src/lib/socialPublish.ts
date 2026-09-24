import { prisma } from '@/lib/db'
import { createInstagramContainer, createInstagramCarouselChildren, createInstagramCarouselParent, carouselItems, getInstagramContainerStatus, publishInstagramContainer, publishFacebook, postFirstComment, findLivePost, refreshLongLivedToken, type PublishSpec } from '@/lib/social'
import { sendPushToOrg } from '@/lib/push'
import { encrypt, decrypt } from '@/lib/encrypt'

export type PublishOutcome = { id: string; status: 'published' | 'failed' | 'skipped' | 'pending'; error?: string }

type PostWithAccount = NonNullable<Awaited<ReturnType<typeof loadPost>>>
async function loadPost(id: string) { return prisma.scheduledPost.findUnique({ where: { id }, include: { socialAccount: true } }) }

function specOf(post: PostWithAccount): PublishSpec | null {
  let mediaUrls: string[] = []
  try { mediaUrls = JSON.parse(post.mediaUrls || '[]') } catch { mediaUrls = [] }
  if (!mediaUrls.length) return null
  const placement = post.placement === 'story' ? 'story' : 'feed'
  // A carousel only exists in the feed; a Story row always carries one file.
  if (post.mediaType === 'carousel' && placement === 'feed' && mediaUrls.length > 1) {
    return { mediaType: 'carousel', placement, mediaUrl: mediaUrls[0], caption: post.caption, items: carouselItems(mediaUrls).slice(0, 10) }
  }
  const single = post.mediaType === 'carousel' ? (carouselItems(mediaUrls)[0].type) : post.mediaType === 'video' ? 'video' : 'image'
  return { mediaType: single, placement, mediaUrl: mediaUrls[0], caption: post.caption, coverUrl: post.thumbnailUrl || undefined }
}

async function fail(post: PostWithAccount, msg: string, notify = true): Promise<PublishOutcome> {
  await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'failed', lastError: msg, externalContainerId: '' } })
  if (notify) await sendPushToOrg(post.orgId, { title: 'Social post failed to publish', body: `${post.socialAccount?.label || 'Account'}: ${msg}`, url: '/dashboard/org/social', tag: 'social-publish-failed' }).catch(() => {})
  return { id: post.id, status: 'failed', error: msg }
}

/** Records a post as live. The database write comes FIRST — once Meta has the post,
 *  nothing after this point (the first comment, a push, a slow network) is allowed
 *  to leave the row stuck in 'publishing'. That ordering is the fix for Sep 23, when
 *  a crash in the first-comment step stranded two posts that were already live. */
async function markPublished(post: PostWithAccount, externalPostId: string, permalink = ''): Promise<PublishOutcome> {
  await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: 'published', externalPostId, publishedAt: new Date(), lastError: '', externalContainerId: '', ...(permalink ? { permalink } : {}) },
  })
  if (!post.firstComment.trim() || post.placement === 'story' || !post.socialAccount) return { id: post.id, status: 'published' }
  let warn = ''
  try {
    const c = await postFirstComment(post.socialAccount, externalPostId, post.firstComment.trim())
    if (!c.ok) warn = `Published, but the first comment didn't post: ${c.error}`
  } catch (e: any) { warn = `Published, but the first comment didn't post: ${e?.message || 'unexpected error'}` }
  if (warn) await prisma.scheduledPost.update({ where: { id: post.id }, data: { lastError: warn } }).catch(() => {})
  return { id: post.id, status: 'published', error: warn || undefined }
}

/** Is this post already on the account (sent, but never recorded)? */
async function alreadyLive(post: PostWithAccount): Promise<{ externalPostId: string; permalink: string } | null> {
  if (!post.socialAccount) return null
  const r = await findLivePost(post.socialAccount, { since: post.scheduledFor, caption: post.caption, mediaType: post.mediaType, placement: post.placement })
  return r.ok ? r.data : null
}

/** Waits on an Instagram container until it's FINISHED (or gives up after `budgetMs`
 *  and leaves the post in 'publishing' with the container id saved — the cron's
 *  finishPendingContainers() picks it up on its next run). Videos typically take
 *  20–90 s to transcode on Meta's side; images are usually instant. */
export const CHILDREN_PREFIX = 'children:'
async function finishInstagram(post: PostWithAccount, containerId: string, budgetMs: number): Promise<PublishOutcome> {
  const account = post.socialAccount!
  const deadline = Date.now() + budgetMs
  // Carousel, stage 1: wait for every slide's container (video slides transcode),
  // then create the album container and carry on as a normal single container.
  // Until then the row keeps "children:<id,id,…>" so the cron can pick it up.
  if (containerId.startsWith(CHILDREN_PREFIX)) {
    const childIds = containerId.slice(CHILDREN_PREFIX.length).split(',').filter(Boolean)
    for (;;) {
      const sts = await Promise.all(childIds.map(id => getInstagramContainerStatus(account, id)))
      const bad = sts.findIndex(st => !st.ok || st.data.status === 'ERROR' || st.data.status === 'EXPIRED')
      if (bad >= 0) { const st = sts[bad]; return fail(post, `Instagram couldn't process slide ${bad + 1}${st.ok && st.data.detail ? `: ${st.data.detail}` : !st.ok ? `: ${st.error}` : ''} — check the file, then Retry.`) }
      if (sts.every(st => st.ok && st.data.status === 'FINISHED')) break
      if (Date.now() > deadline) {
        await prisma.scheduledPost.update({ where: { id: post.id }, data: { externalContainerId: containerId, lastError: 'Instagram is still processing the carousel videos' } })
        return { id: post.id, status: 'pending' }
      }
      await new Promise(r => setTimeout(r, 4000))
    }
    const parent = await createInstagramCarouselParent(account, childIds, post.caption)
    if (!parent.ok) return fail(post, parent.error)
    containerId = parent.data.containerId
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { externalContainerId: containerId } }).catch(() => {})
  }
  for (;;) {
    const st = await getInstagramContainerStatus(account, containerId)
    if (!st.ok) return fail(post, st.error)
    if (st.data.status === 'FINISHED') {
      const pub = await publishInstagramContainer(account, containerId)
      if (!pub.ok) {
        // A publish that errored can still have gone through; check before failing.
        const live = await alreadyLive(post)
        if (live) return markPublished(post, live.externalPostId, live.permalink)
        return fail(post, pub.error)
      }
      return markPublished(post, pub.data.externalPostId)
    }
    if (st.data.status === 'PUBLISHED') {
      // Meta already published this container — an earlier run got that far and
      // then died. Find the live post and record it rather than waiting forever.
      const live = await alreadyLive(post)
      if (live) return markPublished(post, live.externalPostId, live.permalink)
      return fail(post, 'Instagram says this was published, but it could not be found on the account — check @' + account.label.replace(/^@/, '') + ' before retrying.', false)
    }
    if (st.data.status === 'ERROR' || st.data.status === 'EXPIRED') {
      return fail(post, `Instagram couldn't process the ${post.mediaType === 'video' ? 'video' : post.mediaType === 'carousel' ? 'carousel' : 'image'}${st.data.detail ? `: ${st.data.detail}` : ''} — check the file meets Reels/Stories specs (MP4, ≤15 min for Reels, ≤60 s for Stories).`)
    }
    if (Date.now() > deadline) {
      await prisma.scheduledPost.update({ where: { id: post.id }, data: { externalContainerId: containerId, lastError: `Instagram is still processing the video (status ${st.data.status})` } })
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
 * Never throws: any unexpected error becomes a recorded outcome.
 */
export async function publishScheduledPost(postId: string, fromStatus: string | string[] = 'scheduled', waitMs = 25_000): Promise<PublishOutcome> {
  const claim = await prisma.scheduledPost.updateMany({
    where: { id: postId, status: Array.isArray(fromStatus) ? { in: fromStatus } : fromStatus },
    data: { status: 'publishing', lastError: '' },
  })
  if (claim.count === 0) return { id: postId, status: 'skipped' } // someone else already has it

  const post = await loadPost(postId)
  if (!post) return { id: postId, status: 'skipped' }
  try {
    const account = post.socialAccount
    if (!account || account.status !== 'active') return await fail(post, !account ? 'Social account no longer exists' : `Social account is ${account.status}`)

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
    if (!spec) return await fail(post, `No ${post.mediaType === 'video' ? 'video' : 'photo'} attached to this post`, false)

    if (account.platform === 'facebook') {
      const r = await publishFacebook(account, spec)
      if (!r.ok) return await fail(post, r.error)
      return await markPublished(post, r.data.externalPostId)
    }
    if (account.platform === 'instagram') {
      if (spec.mediaType === 'carousel') {
        const ch = await createInstagramCarouselChildren(account, spec.items || [])
        if (!ch.ok) return await fail(post, ch.error)
        const pending = CHILDREN_PREFIX + ch.data.childIds.join(',')
        // Save the slide containers first, so an interrupted run can resume them.
        await prisma.scheduledPost.update({ where: { id: post.id }, data: { externalContainerId: pending } })
        return await finishInstagram(post, pending, waitMs)
      }
      const c = await createInstagramContainer(account, spec)
      if (!c.ok) return await fail(post, c.error)
      return await finishInstagram(post, c.data.containerId, waitMs)
    }
    return await fail(post, `Unsupported platform: ${account.platform}`)
  } catch (e: any) {
    // Leave it in 'publishing': it may already be on Meta. recoverStuckPosts()
    // checks the account and settles it either way on the next cron run.
    await prisma.scheduledPost.update({ where: { id: post.id }, data: { lastError: `Interrupted: ${e?.message || 'unexpected error'} — checking whether it went out` } }).catch(() => {})
    return { id: post.id, status: 'pending', error: e?.message }
  }
}

/** Second half of any Instagram publish that ran out of time waiting on transcoding:
 *  rows still in 'publishing' with a container id, less than 2 hours past their
 *  scheduled time (older ones go to recoverStuckPosts). Called by the cron each run. */
export async function finishPendingContainers(budgetMs = 10_000): Promise<PublishOutcome[]> {
  const pending = await prisma.scheduledPost.findMany({
    where: { status: 'publishing', externalContainerId: { not: '' }, scheduledFor: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
    orderBy: { scheduledFor: 'asc' }, take: 5, include: { socialAccount: true },
  })
  const out: PublishOutcome[] = []
  for (const post of pending) {
    try {
      if (!post.socialAccount) { out.push(await fail(post, 'Social account no longer exists')); continue }
      out.push(await finishInstagram(post, post.externalContainerId, budgetMs / pending.length))
    } catch (e: any) { out.push({ id: post.id, status: 'pending', error: e?.message }) }
  }
  return out
}

/** Safety net for rows stuck in 'publishing' — the function was killed or crashed
 *  somewhere between Meta accepting the post and the database write. For each one,
 *  look on the account: if the post is there, record it as published (and post the
 *  first comment it never got); if an Instagram container is still usable, finish
 *  it; otherwise mark it failed with a message saying it's safe to retry.
 *  "Stuck" = no container and untouched for 10 min, or a container > 2 h old. */
export async function recoverStuckPosts(onlyIds?: string[]): Promise<PublishOutcome[]> {
  const tenMin = new Date(Date.now() - 10 * 60 * 1000), twoHours = new Date(Date.now() - 2 * 60 * 60 * 1000)
  const stuck = await prisma.scheduledPost.findMany({
    // onlyIds = "Check now" from the page: settle this post immediately, whatever its age.
    where: onlyIds ? { status: 'publishing', id: { in: onlyIds } } : { status: 'publishing', OR: [{ externalContainerId: '', updatedAt: { lt: tenMin } }, { externalContainerId: { not: '' }, scheduledFor: { lt: twoHours } }] },
    orderBy: { scheduledFor: 'asc' }, take: 5, include: { socialAccount: true },
  })
  const out: PublishOutcome[] = []
  for (const post of stuck) {
    try {
      if (!post.socialAccount) { out.push(await fail(post, 'Social account no longer exists')); continue }
      const live = await alreadyLive(post)
      if (live) { out.push(await markPublished(post, live.externalPostId, live.permalink)); continue }
      if (post.externalContainerId.startsWith(CHILDREN_PREFIX) && post.socialAccount.platform === 'instagram') {
        // Carousel still waiting on its slides: give it one more try while it's young.
        if (post.scheduledFor >= twoHours || onlyIds) { out.push(await finishInstagram(post, post.externalContainerId, 5_000)); continue }
        out.push(await fail(post, 'Instagram never finished processing this carousel\'s videos. It isn\'t on the account, so it\'s safe to Retry.'))
        continue
      }
      if (post.externalContainerId && post.socialAccount.platform === 'instagram') {
        const st = await getInstagramContainerStatus(post.socialAccount, post.externalContainerId)
        if (st.ok && st.data.status === 'FINISHED') { out.push(await finishInstagram(post, post.externalContainerId, 5_000)); continue }
        if (st.ok && st.data.status === 'IN_PROGRESS' && post.scheduledFor >= twoHours) {
          await prisma.scheduledPost.update({ where: { id: post.id }, data: { lastError: 'Instagram is still processing the video (status IN_PROGRESS)' } })
          out.push({ id: post.id, status: 'pending' }); continue
        }
        out.push(await fail(post, `Instagram never finished processing this video${st.ok ? ` (last status: ${st.data.status}${st.data.detail ? ` — ${st.data.detail}` : ''})` : ''}. It isn't on the account, so it's safe to Retry.`))
        continue
      }
      out.push(await fail(post, 'Publishing was interrupted before Meta confirmed it, and it isn\'t on the account — safe to Retry.'))
    } catch (e: any) { out.push({ id: post.id, status: 'pending', error: e?.message }) }
  }
  return out
}
