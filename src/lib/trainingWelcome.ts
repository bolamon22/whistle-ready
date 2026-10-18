// The training videos follow-up (Bo, Oct 18 2026: "when staff like referees and
// scorekeepers sign up, automatically send them the list of the videos they're
// supposed to watch"). Sent once per Staff Pool person, right after they create their
// login (api/join, api/invite/[token]), with the videos their roles get on the Training
// page (lib/training videosFor, on the organization's plan). Logged like a Video library
// send, so "Who's watched", their profile and the Sent tab show it went. Server only.
import { prisma } from '@/lib/db'
import { sendEmail, orgSender } from '@/lib/email'
import { renderEmail, esc, button } from '@/lib/emailLayout'
import { orgById } from '@/lib/org'
import { planOffFor } from '@/lib/orgPlanStore'
import { trainingVideo, videosFor, workerRoles, minutesLabel } from '@/lib/training'
import { recordTrainingEmails } from '@/lib/trainingSends'

type Row = Record<string, unknown>
const SENT = (workerId: string) => `trainingWelcome:${workerId}`
const LOG = 'trainingSends'
const WATCH = 'https://whistleready.app/dashboard/staff/training'

export async function sendTrainingWelcome(workerId: string): Promise<{ sent: boolean; reason?: string }> {
  try {
    if (!workerId) return { sent: false, reason: 'no worker' }
    if (await prisma.appSetting.findUnique({ where: { key: SENT(workerId) } })) return { sent: false, reason: 'already sent' }
    const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner, orgId FROM "Worker" WHERE id = ? LIMIT 1`, workerId)
    const w = rows[0]
    const email = String(w?.email || '').trim()
    if (!w || !email) return { sent: false, reason: 'no email' }
    const orgId = (w.orgId as string) || null
    const ids = videosFor(workerRoles(w), await planOffFor(orgId).catch(() => [])).filter(id => trainingVideo(id))
    if (!ids.length) return { sent: false, reason: 'no videos' }
    const vids = ids.map(id => trainingVideo(id)!)
    const org = await orgById(orgId).catch(() => null)
    const orgName = org?.name || 'Sunshine Events Group'
    const first = String(w.name || '').trim().split(/\s+/)[0] || 'there'
    const total = Math.max(1, Math.round(vids.reduce((n, v) => n + v.secs, 0) / 60))
    const subject = 'Your training videos'
    const intro = `Hi ${first}, welcome to the ${orgName} staff team! Before your first event, please watch these ${vids.length} short videos. Each is about a minute, ${total} minutes in all, and they show exactly what you’ll do in the app on game day.`
    const list = vids.map(v => `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0"><a href="${WATCH}?v=${encodeURIComponent(v.id)}" style="color:#0f766e;font-weight:700;text-decoration:none">${esc(v.title)}</a><br><span style="color:#64748b;font-size:13px">${esc(v.blurb)} · ${minutesLabel(v.secs)}</span></td></tr>`).join('')
    const html = renderEmail({
      orgName,
      eyebrow: 'Whistle Ready training',
      title: `${vids.length} training videos for you`,
      body: `<p style="margin:0 0 14px">${esc(intro)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font:14px Arial,Helvetica,sans-serif">${list}</table>
        <div style="margin-top:22px">${button(`${WATCH}?v=${encodeURIComponent(vids[0].id)}`, 'Start watching')}</div>
        <p style="margin:14px 0 0;font-size:12px;color:#64748b">Sign in to Whistle Ready with this email address. The videos are on your Training page, and they stay there to watch again any time.</p>`,
      footerNote: 'Questions? Reply to this email.',
    })
    const text = `${intro}\n\n${vids.map(v => `${v.title}: ${WATCH}?v=${v.id}`).join('\n')}\n\nSign in to Whistle Ready with this email address.`
    const r = await sendEmail({ to: email, subject, html, text, ...orgSender(org as any) })
    const at = new Date().toISOString()
    const by = 'Automatic, at signup'
    // Marked sent even when the send failed, so a retry can't double up; the failure
    // shows on their profile and in the Sent tab, where it can be sent again by hand.
    await prisma.appSetting.upsert({ where: { key: SENT(workerId) }, update: { value: at }, create: { key: SENT(workerId), value: at } })
    await recordTrainingEmails([{ email, workerId, ok: r.ok, error: r.error }], { at, by, byUserId: '', videoIds: ids }).catch(() => {})
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: LOG } })
      const log = row?.value ? JSON.parse(row.value) : []
      const entry = { at, by, byUserId: '', videoIds: ids, roles: [], everyone: false, people: [workerId], excluded: [], emails: [], meCopy: false, event: '', subject, sent: r.ok ? 1 : 0, to: r.ok ? [{ name: String(w.name || email), email }] : [], failed: r.ok ? [] : [String(w.name || email)] }
      await prisma.appSetting.upsert({ where: { key: LOG }, update: { value: JSON.stringify([entry, ...(Array.isArray(log) ? log : [])].slice(0, 50)) }, create: { key: LOG, value: JSON.stringify([entry]) } })
    } catch { /* the email went; only the log line is lost */ }
    return { sent: r.ok, reason: r.ok ? undefined : r.error }
  } catch (e) {
    console.error('[trainingWelcome]', e)
    return { sent: false, reason: 'error' }
  }
}
