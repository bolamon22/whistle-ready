import prisma from '@/lib/db'
import { sendEmail, orgSender } from '@/lib/email'
import { orgForTournament } from '@/lib/org'
import { orgBaseUrl } from '@/lib/orgDomains'
import { RETURNING_TEMPLATE, eventsList, upcomingEvents } from '@/lib/inviteTemplates'

// "Come back and play" invites to clubs from past events, lifted out of the route
// so the scheduler can run the same send later (Bo, Sep 10). One email per
// address, whatever list it's handed.

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL — prod's still points at old gameday-staff5.vercel.app (found Aug 28)

export type InviteClub = { clubName: string; contactEmail: string; contactName: string; numTeams?: number; divisions?: string[]; lastEvent?: string }

// The 'Welcome back' preset is the fallback — same text the page shows, so a
// scheduled send with a blank template mails what Bo saw. Other presets live
// beside it in inviteTemplates.ts; the page sends whichever one he picked.
export const RETURNING_DEFAULT_SUBJECT = RETURNING_TEMPLATE.subject
export const RETURNING_DEFAULT_BODY = RETURNING_TEMPLATE.body

function applyVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}
const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export async function runReturningInvite(a: {
  tournamentId: string
  clubs: InviteClub[]
  subjectTemplate?: string
  bodyTemplate?: string
  /** Receipt address — the scheduler passes the office inbox. */
  notifyTo?: string
}): Promise<{ ok: true; sent: number; errors: string[]; skippedDupes: number } | { ok: false; error: string; status: number }> {
  if (!a.clubs?.length) return { ok: false, error: 'clubs required', status: 400 }

  // One invite per address, whatever the caller sent (Bo: pulling several past
  // events must never mail the same director twice). The page already merges
  // clubs across events; this is the backstop for a stale list or a double-click.
  const seen = new Set<string>()
  const recipients = a.clubs.filter(c => {
    const key = String(c.contactEmail || '').trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
  const skippedDupes = a.clubs.length - recipients.length
  if (!recipients.length) return { ok: false, error: 'No usable email addresses', status: 400 }

  const tournament = await prisma.tournament.findUnique({
    where: { id: a.tournamentId },
    select: { name: true, startDate: true, endDate: true },
  })
  if (!tournament) return { ok: false, error: 'Not found', status: 404 }

  const fmtDate = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); return `${parseInt(m)}/${parseInt(day)}/${y}` }
  const dateStr = tournament.startDate
    ? tournament.endDate && tournament.endDate !== tournament.startDate
      ? `${fmtDate(tournament.startDate)} – ${fmtDate(tournament.endDate)}`
      : fmtDate(tournament.startDate)
    : 'TBD'

  const subjectTemplate = a.subjectTemplate || RETURNING_DEFAULT_SUBJECT
  const bodyTemplate = a.bodyTemplate || RETURNING_DEFAULT_BODY

  // Cold outreach to club directors -- it has to come from the tournament
  // company, not noreply@whistleready.app. Falls back to the platform sender
  // when the org has no SendGrid-authenticated address.
  const org = await orgForTournament(a.tournamentId)
  const sender = orgSender(org)
  const fromName = org?.name || tournament.name || 'Whistle Ready'
  // ...and the link has to look like theirs too: sunshineeventsgroup.com/tournaments/...
  // rather than whistleready.app, which the director has no reason to trust.
  const regUrl = `${orgBaseUrl(org?.slug, APP_URL)}/tournaments/${a.tournamentId}/register`

  // {{ourEvents}} — the rest of the season, for the letter that invites a club to
  // more than one weekend. orgId is a raw column, so this can't go through Prisma's
  // typed client; a failure here just leaves the token empty rather than killing the send.
  let ourEvents = ''
  try {
    if (org?.id) {
      const rows: any[] = await prisma.$queryRawUnsafe(
        'SELECT name, startDate, endDate FROM "Tournament" WHERE orgId = ? AND startDate >= ? ORDER BY startDate ASC LIMIT 25',
        org.id, new Date().toISOString().slice(0, 10))
      ourEvents = eventsList(upcomingEvents(rows.map(r => ({
        name: String(r.name ?? ''), startDate: String(r.startDate ?? ''), endDate: String(r.endDate ?? ''),
      }))))
    }
  } catch { /* the letter still goes out without the calendar */ }

  let sent = 0
  const errors: string[] = []
  let sample: { subject: string; html: string; to: string } | null = null

  for (const club of recipients) {
    const vars: Record<string, string> = {
      clubName: club.clubName,
      contactName: club.contactName || club.clubName,
      tournamentName: tournament.name,
      dates: dateStr,
      registerUrl: regUrl,
      lastYearTeams: String(club.numTeams ?? '—'),
      lastYearDivisions: club.divisions?.join(', ') ?? '—',
      lastEvent: club.lastEvent || '',
      orgName: fromName,
      ourEvents,
    }

    const subject = applyVars(subjectTemplate, vars)
    const plainBody = applyVars(bodyTemplate, vars)

    // Convert plain text body to simple HTML
    const htmlBody = plainBody
      .split('\n\n')
      .map(para => `<p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;">${para.replace(/\n/g, '<br/>')}</p>`)
      .join('')

    const html = `
          <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;padding:40px 28px;background:#ffffff;">
            <h2 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 24px;border-bottom:2px solid #e5e7eb;padding-bottom:16px;">
              ${tournament.name}
            </h2>
            ${htmlBody}
            <div style="margin:28px 0;">
              <a href="${regUrl}"
                style="display:inline-block;background:#0f172a;color:white;font-weight:600;
                       font-size:15px;padding:13px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.3px;">
                Register Now →
              </a>
            </div>
          </div>
        `
    const res = await sendEmail({ ...sender, fromName, to: club.contactEmail, subject, html })
    if (res.ok) { sent++; if (!sample) sample = { subject, html, to: club.contactEmail } }
    else errors.push(`${club.clubName}: ${res.error}`)
  }

  if (a.notifyTo) {
    // Receipt for a scheduled run — Bo isn't watching a toast when this fires.
    try {
      await sendEmail({
        ...sender,
        fromName,
        to: a.notifyTo,
        subject: `Sent: returning-team invites — ${sent} club${sent === 1 ? '' : 's'} (${tournament.name})`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
  <p style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#0d9488;margin:0 0 4px">SCHEDULED SEND · ${esc(tournament.name)}</p>
  <h2 style="font-size:19px;margin:0 0 6px">Returning-team invites just went out</h2>
  <p style="color:#475569;font-size:14px;margin:0 0 12px"><strong>${sent}</strong> club${sent === 1 ? '' : 's'} emailed${skippedDupes ? `, ${skippedDupes} duplicate address${skippedDupes === 1 ? '' : 'es'} skipped` : ''}${errors.length ? `, ${errors.length} failed` : ''}.</p>
  <ul style="font-size:13px;color:#334155;padding-left:18px;margin:0 0 8px">${recipients.map(c => `<li style="margin:2px 0">${esc(c.clubName)} <span style="color:#94a3b8">— ${esc(c.contactEmail)}</span></li>`).join('')}</ul>
  ${errors.length ? `<p style="font-size:12px;color:#b45309;margin:8px 0 0">Failed: ${esc(errors.join('; '))}</p>` : ''}
  ${sample ? `<div style="border-top:1px solid #e2e8f0;margin:20px 0 0;padding-top:14px">
    <p style="font-size:12px;color:#94a3b8;margin:0 0 2px">Copy of what they received — this one went to ${esc(sample.to)}:</p>
    <p style="font-size:13px;color:#0f172a;font-weight:600;margin:0 0 10px">Subject: ${esc(sample.subject)}</p>
    <div style="border:1px solid #e2e8f0;border-radius:10px">${sample.html}</div>
  </div>` : ''}
</div>`,
      })
    } catch { /* a missing receipt must never fail the send */ }
  }

  return { ok: true, sent, errors, skippedDupes }
}
