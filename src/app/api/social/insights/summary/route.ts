import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'

export type PostMetrics = { reach: number; impressions: number; likes: number; comments: number; saves: number; shares: number; interactions: number; fetchedAt: string }

// Numbers for the scheduler page: the latest snapshot per published post plus a
// 28-day rollup (people reached, interactions) and the previous 28 days for the
// delta. Reads only what the insights cron / import already stored — never calls
// Meta, so it's cheap enough to load with the page.
export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ latest: {}, window: null })

  const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get('days')) || 28, 7), 365)
  const now = Date.now()
  const cutoff = new Date(now - days * 864e5)
  const prevCutoff = new Date(now - 2 * days * 864e5)

  const posts = await prisma.scheduledPost.findMany({
    where: { orgId: gate.orgId, status: 'published', publishedAt: { gte: prevCutoff } },
    select: { id: true, publishedAt: true, insights: { orderBy: { fetchedAt: 'desc' }, take: 1 } },
  })

  const latest: Record<string, PostMetrics> = {}
  const sum = (p: typeof posts) => p.reduce((acc, post) => {
    const s = post.insights[0]; if (!s) return acc
    acc.reach += s.reach; acc.interactions += s.likes + s.comments + s.saves + s.shares; acc.withData++
    return acc
  }, { reach: 0, interactions: 0, withData: 0, posts: p.length })

  for (const post of posts) {
    const s = post.insights[0]
    if (s) latest[post.id] = { reach: s.reach, impressions: s.impressions, likes: s.likes, comments: s.comments, saves: s.saves, shares: s.shares, interactions: s.likes + s.comments + s.saves + s.shares, fetchedAt: s.fetchedAt.toISOString() }
  }
  const current = sum(posts.filter(p => p.publishedAt && p.publishedAt >= cutoff))
  const previous = sum(posts.filter(p => p.publishedAt && p.publishedAt < cutoff))

  return NextResponse.json({ latest, window: { days, current, previous } })
}
