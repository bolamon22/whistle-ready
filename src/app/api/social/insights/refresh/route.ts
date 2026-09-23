import { NextRequest, NextResponse } from 'next/server'
import { requireDirector } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { fetchPostInsights } from '@/lib/social'

export const maxDuration = 60

// "Refresh numbers" on the Insights tab. The 4-hourly cron only re-reads posts from
// the last 30 days, so older posts keep the number from the day they were imported.
// This re-snapshots every published post in the chosen window (newest first,
// bounded so it finishes inside the function limit) — one Meta call per post.
export async function POST(req: NextRequest) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as any
  const days = Math.min(Math.max(Number(body.days) || 28, 7), 730)

  const posts = await prisma.scheduledPost.findMany({
    where: { orgId: gate.orgId, status: 'published', externalPostId: { not: '' }, publishedAt: { gte: new Date(Date.now() - days * 864e5) } },
    orderBy: { publishedAt: 'desc' }, take: 60, include: { socialAccount: true },
  })

  const deadline = Date.now() + 50_000
  let refreshed = 0; const errors: string[] = []
  for (const post of posts) {
    if (Date.now() > deadline) break
    if (!post.socialAccount) continue
    const r = await fetchPostInsights(post.socialAccount, post.externalPostId)
    if (!r.ok) { errors.push(r.error); continue }
    await prisma.postInsightSnapshot.create({
      data: { scheduledPostId: post.id, reach: r.data.reach, impressions: r.data.impressions, likes: r.data.likes, comments: r.data.comments, saves: r.data.saves, shares: r.data.shares, raw: JSON.stringify(r.data.raw) },
    })
    refreshed++
  }
  // One representative error is enough for the toast; they're usually all the same.
  return NextResponse.json({ ok: true, eligible: posts.length, refreshed, failed: errors.length, error: errors[0] })
}
