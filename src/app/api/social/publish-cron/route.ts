import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { publishPost, refreshLongLivedToken } from '@/lib/social'
import { sendPushToOrg } from '@/lib/push'
import { encrypt, decrypt } from '@/lib/encrypt'

// Vercel cron (vercel.json): publishes anything approved ('scheduled') and due.
// Claims one row at a time (updateMany guarded on status still being 'scheduled')
// so an overlapping run can't double-post — same shape as the comm-cron pattern.
// Set CRON_SECRET in Vercel; the route requires it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const due = await prisma.scheduledPost.findMany({
    where: { status: 'scheduled', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    take: 10,
    include: { socialAccount: true },
  })

  const results: { id: string; status: string; error?: string }[] = []

  for (const post of due) {
    const claim = await prisma.scheduledPost.updateMany({ where: { id: post.id, status: 'scheduled' }, data: { status: 'publishing' } })
    if (claim.count === 0) continue // another run already grabbed it

    const account = post.socialAccount
    if (!account || account.status !== 'active') {
      const msg = !account ? 'Social account no longer exists' : `Social account is ${account.status}`
      await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'failed', lastError: msg } })
      results.push({ id: post.id, status: 'failed', error: msg })
      await sendPushToOrg(post.orgId, { title: 'Social post failed to publish', body: msg, url: '/dashboard/org/social', tag: 'social-publish-failed' })
      continue
    }

    // Opportunistic token refresh — a long-lived token is good for ~60 days;
    // renew it once it's within 5 days of expiring so accounts don't silently drop.
    if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() - Date.now() < 5 * 24 * 60 * 60 * 1000) {
      const refreshed = await refreshLongLivedToken(decrypt(account.accessToken))
      if (refreshed.ok) {
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: { accessToken: encrypt(refreshed.data.token), tokenExpiresAt: new Date(Date.now() + refreshed.data.expiresInSeconds * 1000) },
        })
        account.accessToken = encrypt(refreshed.data.token)
      }
    }

    const mediaUrls: string[] = JSON.parse(post.mediaUrls || '[]')
    if (!mediaUrls.length) {
      const msg = 'No media attached to this post'
      await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'failed', lastError: msg } })
      results.push({ id: post.id, status: 'failed', error: msg })
      continue
    }

    const published = await publishPost(
      { platform: account.platform, externalId: account.externalId, accessToken: account.accessToken },
      { imageUrl: mediaUrls[0], caption: post.caption },
    )

    if (published.ok) {
      await prisma.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'published', externalPostId: published.data.externalPostId, publishedAt: new Date() },
      })
      results.push({ id: post.id, status: 'published' })
    } else {
      await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: 'failed', lastError: published.error } })
      results.push({ id: post.id, status: 'failed', error: published.error })
      await sendPushToOrg(post.orgId, { title: 'Social post failed to publish', body: `${account.label}: ${published.error}`, url: '/dashboard/org/social', tag: 'social-publish-failed' })
    }
  }

  return NextResponse.json({ ok: true, checked: due.length, results })
}
