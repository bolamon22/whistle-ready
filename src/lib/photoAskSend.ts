import { prisma } from '@/lib/db'
import { orgById, orgLogoUrl } from '@/lib/org'
import { getSubmission, updateSubmissionData, ensurePassToken, type FormSubmission } from '@/lib/formSubmissions'
import { playerPassEnabled, orgSiteConfig } from '@/lib/playerPass'
import { sendEmail, orgSender } from '@/lib/email'
import { absUrl } from '@/lib/emailLayout'
import { orgBaseUrl } from '@/lib/orgDomains'
import { eventDates } from '@/lib/vendorApproval'
import { signPhotoToken, photoAskRecipients, photoAskEmail, instagramHandle } from '@/lib/photoConsent'

// Sending the photo-permission letter (lib/photoConsent). One function for the
// Send button, the test send and the scheduled send, so a scheduled letter can't
// differ from one sent by hand.
//
// Scheduling (Bo, Oct 18 2026: "send it tomorrow morning to the people I pick")
// lives on the waiver like the rest of the photo state:
//   photoAskSchedAt   ISO time to send ('' = nothing scheduled)
//   photoAskSchedBy   who scheduled it
// The cron (/api/social-photos/cron) claims a row by clearing photoAskSchedAt
// with a conditional UPDATE before sending, so two overlapping runs can't both
// send it.

export type PhotoAskContext = {
  orgId: string
  tournamentId: string
  appBase: string
  orgName: string
  tournamentName: string
  dates: string
  instagram: string
  logo: string
  sender: ReturnType<typeof orgSender>
  passOn: boolean
}

export async function photoAskContext(orgId: string, tournamentId: string, appBase: string): Promise<PhotoAskContext> {
  const [org, t, passOn, site] = await Promise.all([
    orgById(orgId),
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, startDate: true, endDate: true } }),
    playerPassEnabled(orgId),
    orgSiteConfig(orgId),
  ])
  return {
    orgId, tournamentId, appBase, passOn,
    orgName: org?.name || 'Sunshine Events Group',
    tournamentName: t?.name || 'the tournament',
    dates: eventDates(t?.startDate || '', t?.endDate || ''),
    instagram: instagramHandle(site.socials.instagram),
    logo: absUrl(orgBaseUrl(org?.slug), await orgLogoUrl(org?.id, org?.logoUrl)),
    sender: orgSender(org),
  }
}

export type AskCheck = { ok: true; sub: FormSubmission; name: string } | { ok: false; name: string; reason: string }

/** Can this waiver be asked? `test` skips the already-asked / already-answered checks. */
export async function askable(ctx: PhotoAskContext, subId: string, opts: { test?: boolean; resend?: boolean } = {}): Promise<AskCheck> {
  const s = await getSubmission(ctx.orgId, subId)
  const d = s?.data || {}
  const name = String(d.playerName || subId)
  if (!s || s.formType !== 'player' || String(d.tournamentId || '') !== ctx.tournamentId || s.archivedAt) return { ok: false, name, reason: 'not a player at this event' }
  if (!String(d.photoUrl || '').trim()) return { ok: false, name, reason: 'no photo' }
  if (!opts.test && (d.photoOk === 'yes' || d.photoOk === 'no')) return { ok: false, name, reason: 'already answered' }
  if (!opts.test && d.photoAskAt && !opts.resend) return { ok: false, name, reason: 'already asked' }
  if (!opts.test && !photoAskRecipients(d).length) return { ok: false, name, reason: 'no parent email' }
  return { ok: true, sub: s, name }
}

/**
 * Email one family (or, with testTo, one staff member) the letter. Marks the
 * waiver as asked unless it's a test. Returns an error string on failure.
 */
export async function sendPhotoAsk(ctx: PhotoAskContext, s: FormSubmission, by: string, testTo?: string): Promise<{ ok: boolean; error?: string }> {
  const d = s.data || {}
  const to = testTo ? [testTo] : photoAskRecipients(d)
  if (!to.length) return { ok: false, error: 'no parent email' }
  const token = signPhotoToken({ s: s.id, o: ctx.orgId, ...(testTo ? { x: true } : {}) })
  const link = `${ctx.appBase}/pass/photo-ok/${encodeURIComponent(token)}`
  const passToken = ctx.passOn ? (s.passToken || await ensurePassToken(ctx.orgId, s.id)) : null
  const mail = photoAskEmail({
    orgName: ctx.orgName, logoUrl: ctx.logo, tournamentName: ctx.tournamentName, dates: ctx.dates, instagram: ctx.instagram,
    parentName: String(d.parentName || ''), playerName: String(d.playerName || ''),
    photoUrl: String(d.photoUrl || ''),
    cardUrl: passToken ? `/pass/${passToken}/card.png` : '',
    link, base: ctx.appBase,
  })
  const res = await sendEmail({ ...ctx.sender, to, subject: testTo ? `[Test] ${mail.subject}` : mail.subject, html: mail.html, text: mail.text })
  if (!res.ok) return { ok: false, error: res.error || 'send failed' }
  if (!testTo) {
    await updateSubmissionData(ctx.orgId, s.id, { photoAskAt: new Date().toISOString(), photoAskBy: by, photoAskSchedAt: '', photoAskSchedBy: '' }, by || 'staff')
  }
  return { ok: true }
}

// ── the schedule ──────────────────────────────────────────────────────────────

export type DueAsk = { orgId: string; id: string; at: string; tournamentId: string; by: string }

/** Waivers whose scheduled send time has come. */
export async function dueAsks(nowIso: string, limit = 60): Promise<DueAsk[]> {
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT "orgId", "id",
            json_extract("data", '$.photoAskSchedAt') AS at,
            json_extract("data", '$.tournamentId') AS tid,
            json_extract("data", '$.photoAskSchedBy') AS by
       FROM "OrgFormSubmission"
      WHERE "formType" = 'player'
        AND COALESCE(json_extract("data", '$.photoAskSchedAt'), '') <> ''
        AND json_extract("data", '$.photoAskSchedAt') <= ?
      ORDER BY at ASC
      LIMIT ?`, nowIso, limit)
  return rows.map(r => ({ orgId: String(r.orgId), id: String(r.id), at: String(r.at), tournamentId: String(r.tid || ''), by: String(r.by || '') }))
}

/** Take one due row for this run. False when another run already took it. */
export async function claimAsk(a: DueAsk): Promise<boolean> {
  const n = await prisma.$executeRawUnsafe(
    `UPDATE "OrgFormSubmission" SET "data" = json_set("data", '$.photoAskSchedAt', '')
      WHERE "orgId" = ? AND "id" = ? AND json_extract("data", '$.photoAskSchedAt') = ?`,
    a.orgId, a.id, a.at)
  return Number(n) > 0
}
