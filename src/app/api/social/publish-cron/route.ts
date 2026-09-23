import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { publishScheduledPost, finishPendingContainers, type PublishOutcome } from '@/lib/socialPublish'

export const maxDuration = 60

// Vercel cron (vercel.json): publishes anything approved ('scheduled') and due.
// The per-post work (claim → token refresh → publish → first comment) lives in
// src/lib/socialPublish.ts so "Publish now" from the page goes through the exact
// same path. Claiming one row at a time means an overlapping run can't double-post.
// Instagram videos that are still transcoding when a run's time is up are left in
// 'publishing' with their container id and finished on the next run.
// Set CRON_SECRET in Vercel; the route requires it.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: PublishOutcome[] = []

  // Finish what a previous run started first — those posts are already late.
  results.push(...await finishPendingContainers(20_000))

  const due = await prisma.scheduledPost.findMany({
    where: { status: 'scheduled', scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: 'asc' },
    take: 10,
    select: { id: true },
  })
  for (const { id } of due) results.push(await publishScheduledPost(id, 'scheduled', 15_000))

  return NextResponse.json({ ok: true, checked: due.length, results: results.filter(r => r.status !== 'skipped') })
}
