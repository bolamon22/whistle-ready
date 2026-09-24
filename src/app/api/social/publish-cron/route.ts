import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { publishScheduledPost, finishPendingContainers, recoverStuckPosts, type PublishOutcome } from '@/lib/socialPublish'

export const maxDuration = 60

// Vercel cron (vercel.json): publishes anything approved ('scheduled') and due.
// The per-post work (claim → token refresh → publish → first comment) lives in
// src/lib/socialPublish.ts so "Publish now" from the page goes through the exact
// same path. Claiming one row at a time means an overlapping run can't double-post.
//
// Order of work, and why:
//  1. recoverStuckPosts — anything a previous run started and never recorded. Quick.
//  2. finishPendingContainers — Instagram videos still transcoding. Capped at 10 s.
//  3. due posts — but only start one while there's ≥ 35 s left, because a Facebook
//     video upload can take 20–40 s and a run killed mid-call is exactly how a post
//     ends up live-but-unrecorded. Anything not started waits for the next run.
// Set CRON_SECRET in Vercel; the route requires it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const started = Date.now()
  const left = () => 60_000 - (Date.now() - started)
  const results: PublishOutcome[] = []

  results.push(...await recoverStuckPosts())
  results.push(...await finishPendingContainers(10_000))

  const due = await prisma.scheduledPost.findMany({
    where: { status: 'scheduled', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' }, take: 10, select: { id: true },
  })
  let deferred = 0
  for (const { id } of due) {
    if (left() < 35_000) { deferred++; continue }
    results.push(await publishScheduledPost(id, 'scheduled', Math.min(15_000, left() - 30_000)))
  }

  return NextResponse.json({ ok: true, checked: due.length, deferred, results: results.filter(r => r.status !== 'skipped') })
}
