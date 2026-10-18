import { NextRequest, NextResponse } from 'next/server'
import { sendEmail, OFFICE_CC } from '@/lib/email'
import { esc } from '@/lib/emailLayout'
import { isOrgArchived } from '@/lib/orgArchive'
import { appBaseUrl } from '@/lib/playerPass'
import { dueAsks, claimAsk, photoAskContext, askable, sendPhotoAsk, type PhotoAskContext } from '@/lib/photoAskSend'

// Vercel cron (vercel.json, every 15 min): send the photo-permission letters that
// staff scheduled on Photos for social (lib/photoAskSend). Each waiver is claimed
// before it is sent, so an overlapping run can't email a family twice. Set
// CRON_SECRET in Vercel and the route requires it (it already is, for comm-cron).
//
// The office gets one receipt per run that sent anything: Bo schedules these at
// midnight for the morning and isn't watching a toast when they go.

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const due = await dueAsks(new Date().toISOString(), 60)
  const ctxs = new Map<string, PhotoAskContext>()
  const sent: string[] = []
  const problems: string[] = []
  const base = appBaseUrl()
  const started = Date.now()

  for (const a of due) {
    if (Date.now() - started > 45_000) break          // the next tick picks up the rest
    if (!(await claimAsk(a))) continue                 // another run took it
    if (await isOrgArchived(a.orgId)) { problems.push(`${a.id}: organization archived`); continue }
    const key = `${a.orgId}:${a.tournamentId}`
    let ctx = ctxs.get(key)
    if (!ctx) { ctx = await photoAskContext(a.orgId, a.tournamentId, base); ctxs.set(key, ctx) }
    const c = await askable(ctx, a.id)
    if (!c.ok) { problems.push(`${c.name}: ${c.reason}`); continue }
    const res = await sendPhotoAsk(ctx, c.sub, a.by || 'scheduled')
    if (res.ok) sent.push(`${c.name} (${ctx.tournamentName})`)
    else problems.push(`${c.name}: ${res.error}`)
  }

  if (sent.length || problems.length) {
    await sendEmail({
      to: OFFICE_CC,
      subject: `Photo permission requests: ${sent.length} sent${problems.length ? `, ${problems.length} not sent` : ''}`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="font-size:18px;margin:0 0 8px">Scheduled photo permission requests</h2>
  ${sent.length ? `<p style="font-size:14px;margin:0 0 6px"><strong>Sent to the families of:</strong></p><ul style="font-size:14px;margin:0 0 12px;padding-left:18px">${sent.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
  ${problems.length ? `<p style="font-size:14px;margin:0 0 6px;color:#b45309"><strong>Not sent:</strong></p><ul style="font-size:13px;margin:0 0 12px;padding-left:18px;color:#b45309">${problems.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
  <p style="color:#94a3b8;font-size:12px;margin:12px 0 0">Answers show on Player waivers &gt; Photos for social.</p>
</div>`,
    })
  }
  return NextResponse.json({ ok: true, due: due.length, sent: sent.length, problems })
}
