import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { fetchPostInsights } from '@/lib/social'

// Vercel cron (vercel.json): snapshots metrics for recently-published posts.
// Meta's API only gives current values and doesn't retain full history — this
// is what turns that into an actual trend line over time (see
// PostInsightSnapshot in prisma/schema.prisma). Runs less often than the
// publish cron; a handful per run keeps it inside the function time limit.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Only bother polling posts published in the last 30 days — Instagram/Facebook
  // engagement on a post is heavily front-loaded, and this keeps the table from
  // growing forever on posts nobody's looking at anymore.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const posts = await prisma.scheduledPost.findMany({
    where: { status: 'published', publishedAt: { gte: cutoff } },
    orderBy: { publishedAt: 'desc' },
    take: 25,
    include: { socialAccount: true },
  })

  let snapshotted = 0
  const errors: string[] = []

  for (const post of posts) {
    if (!post.externalPostId || !post.socialAccount) continue
    const r = await fetchPostInsights(
      { platform: post.socialAccount.platform, accessToken: post.socialAccount.accessToken },
      post.externalPostId,
    )
    if (!r.ok) { errors.push(`${post.id}: ${r.error}`); continue }
    await prisma.postInsightSnapshot.create({
      data: {
        scheduledPostId: post.id, reach: r.data.reach, impressions: r.data.impressions,
        likes: r.data.likes, comments: r.data.comments, saves: r.data.saves, shares: r.data.shares,
        raw: JSON.stringify(r.data.raw),
      },
    })
    snapshotted++
  }

  return NextResponse.json({ ok: true, checked: posts.length, snapshotted, errors })
}
