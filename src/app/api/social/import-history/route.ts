import { NextRequest, NextResponse } from 'next/server'
import { requireDirector } from '@/lib/apiAuth'
import { prisma } from '@/lib/db'
import { listPublishedMedia, fetchPostInsights } from '@/lib/social'

export const maxDuration = 60

// "Import post history" — pulls the posts that already exist on each connected
// account (made in the Instagram/Facebook apps, PromoRepublic, wherever) into the
// scheduler as published rows, then takes a first insights snapshot for the
// newest ones so reach/interactions show up immediately instead of at the next
// cron tick. Idempotent: re-running only adds posts it hasn't seen (matched on
// externalPostId) and refreshes nothing it already has.
export async function POST(req: NextRequest) {
  const gate = await requireDirector()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ error: 'No organization selected' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as any
  const perAccount = Math.min(Math.max(Number(body.limit) || 60, 1), 200)

  const accounts = await prisma.socialAccount.findMany({ where: { orgId: gate.orgId, status: 'active' } })
  const result: { account: string; found: number; imported: number; error?: string }[] = []
  const newIds: string[] = []

  for (const account of accounts) {
    const media = await listPublishedMedia(account, perAccount)
    if (!media.ok) { result.push({ account: account.label, found: 0, imported: 0, error: media.error }); continue }
    const existing = new Set((await prisma.scheduledPost.findMany({
      where: { socialAccountId: account.id, externalPostId: { in: media.data.map(m => m.externalPostId) } },
      select: { externalPostId: true },
    })).map(r => r.externalPostId))
    let imported = 0
    for (const m of media.data) {
      if (existing.has(m.externalPostId)) continue
      const row = await prisma.scheduledPost.create({
        data: {
          orgId: gate.orgId, socialAccountId: account.id, caption: m.caption,
          mediaUrls: JSON.stringify(m.mediaUrl ? [m.mediaUrl] : []),
          scheduledFor: m.publishedAt, publishedAt: m.publishedAt, status: 'published',
          externalPostId: m.externalPostId, permalink: m.permalink, importedAt: new Date(),
          createdByUserId: gate.userId,
        },
      })
      newIds.push(row.id); imported++
    }
    result.push({ account: account.label, found: media.data.length, imported })
  }

  // First snapshot for the newest imported posts (bounded so the request stays
  // inside the function time limit; the insights cron covers the rest).
  const toSnapshot = await prisma.scheduledPost.findMany({
    where: { id: { in: newIds } }, orderBy: { publishedAt: 'desc' }, take: 30, include: { socialAccount: true },
  })
  let snapshotted = 0
  for (const post of toSnapshot) {
    if (!post.socialAccount) continue
    const r = await fetchPostInsights(post.socialAccount, post.externalPostId)
    if (!r.ok) continue
    await prisma.postInsightSnapshot.create({
      data: { scheduledPostId: post.id, reach: r.data.reach, impressions: r.data.impressions, likes: r.data.likes, comments: r.data.comments, saves: r.data.saves, shares: r.data.shares, raw: JSON.stringify(r.data.raw) },
    })
    snapshotted++
  }

  return NextResponse.json({ ok: true, accounts: result, imported: newIds.length, snapshotted })
}
