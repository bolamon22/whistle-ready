import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { publishScheduledPost, type PublishOutcome } from '@/lib/socialPublish'

// Vercel cron (vercel.json): publishes anything approved ('scheduled') and due.
// The per-post work (claim → token refresh → publish → first comment) lives in
// src/lib/socialPublish.ts so "Publish now" from the page goes through the exact
// same path. Claiming one row at a time means an overlapping run can't double-post.
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
    select: { id: true },
  })

  const results: PublishOutcome[] = []
  for (const { id } of due) results.push(await publishScheduledPost(id, 'scheduled'))

  return NextResponse.json({ ok: true, checked: due.length, results: results.filter(r => r.status !== 'skipped') })
}
