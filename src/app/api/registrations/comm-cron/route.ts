import { NextRequest, NextResponse } from 'next/server'
import { claimDue, finishScheduled } from '@/lib/commSchedule'
import { runCommSend } from '@/lib/commSend'
import { runReturningInvite, type InviteClub } from '@/lib/returningInvite'
import { sendEmail, OFFICE_CC } from '@/lib/email'

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
    // The office gets a receipt for every scheduled run — Bo isn't watching a
    // toast at 8am, so this is how he knows it actually went (Sep 10).
    const res = job.type === 'returning'
      ? await runReturningInvite({
          tournamentId: job.tournamentId,
          clubs: ((job.payload?.clubs as InviteClub[] | undefined) ?? []),
          subjectTemplate: job.subject, bodyTemplate: job.body, notifyTo: OFFICE_CC,
        })
      : await runCommSend({ tournamentId: job.tournamentId, kind: job.kind, regIds: job.regIds, subject: job.subject, body: job.body, notifyTo: OFFICE_CC })
    if (res.ok) {
      const results = 'results' in res ? res.results : []
      const sent = 'results' in res ? res.results.filter(r => r.status === 'sent').length : res.sent
      const clubs = job.type === 'returning' ? ((job.payload?.clubs as InviteClub[] | undefined)?.length ?? 0) : job.regIds.length
      await finishScheduled(job.id, 'sent', results)
      ran.push({ id: job.id, kind: job.type === 'returning' ? 'returning invites' : job.kind, clubs, sent, status: 'sent' })
    } else {
      await finishScheduled(job.id, 'failed', [])
      // Silence would look identical to "it went fine" — say so.
      await sendEmail({
        to: OFFICE_CC,
        subject: `Scheduled email did NOT go out — ${job.type === 'returning' ? 'returning invites' : job.kind}`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="font-size:18px;margin:0 0 6px">A scheduled send failed</h2>
  <p style="color:#475569;font-size:14px;margin:0 0 8px">The <strong>${job.type === 'returning' ? 'returning-team invite' : job.kind}</strong> letter queued for this event could not be sent.</p>
  <p style="color:#b45309;font-size:13px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:8px 12px;margin:0">${res.error}</p>
  <p style="color:#94a3b8;font-size:12px;margin:12px 0 0">Nothing was emailed to the clubs — send it again from the tournament's registrations page.</p>
</div>`,
      })
      ran.push({ id: job.id, kind: job.kind, clubs: job.regIds.length, sent: 0, status: `failed: ${res.error}` })
    }
  }
  return NextResponse.json({ ok: true, ran })
}
