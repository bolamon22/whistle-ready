import { NextRequest, NextResponse } from 'next/server'
import { claimDue, finishScheduled } from '@/lib/commSchedule'
import { runCommSend } from '@/lib/commSend'

// Vercel cron (vercel.json, every 15 min): send anything that came due. Rows are
// claimed one at a time before sending, so an overlapping run can't double-send.
// Set CRON_SECRET in Vercel and the route requires it.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const ran: { id: string; kind: string; clubs: number; sent: number; status: string }[] = []
  // A handful per run keeps the function well inside its time limit; the next
  // tick picks up anything still waiting.
  for (let i = 0; i < 5; i++) {
    const job = await claimDue(new Date().toISOString())
    if (!job) break
    const res = await runCommSend({ tournamentId: job.tournamentId, kind: job.kind, regIds: job.regIds, subject: job.subject, body: job.body })
    if (res.ok) {
      await finishScheduled(job.id, 'sent', res.results)
      ran.push({ id: job.id, kind: job.kind, clubs: job.regIds.length, sent: res.results.filter(r => r.status === 'sent').length, status: 'sent' })
    } else {
      await finishScheduled(job.id, 'failed', [])
      ran.push({ id: job.id, kind: job.kind, clubs: job.regIds.length, sent: 0, status: `failed: ${res.error}` })
    }
  }
  return NextResponse.json({ ok: true, ran })
}
