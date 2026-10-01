import { prisma } from '@/lib/db'
import { renderEmail } from '@/lib/emailLayout'
import { letterBodyHtml } from '@/lib/inviteLetter'
import { PAY_LETTER_DEFAULTS, mergePayLetter, countdownPhrase } from '@/lib/payLetterText'

// The copy, the token merge and the countdown live in payLetterText (no prisma), so
// the registrations page can preview exactly what the send path will produce.
export { PAY_LETTER_DEFAULTS, mergePayLetter, countdownPhrase, PAY_LETTER_TOKENS } from '@/lib/payLetterText'

export async function payLetterFor(orgId: string | null): Promise<{ subject: string; body: string; custom: boolean }> {
  if (orgId) {
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: `payLetter:${orgId}` } })
      if (row?.value) {
        const v = JSON.parse(row.value) as { subject?: unknown; body?: unknown }
        if (typeof v?.subject === 'string' && typeof v?.body === 'string' && v.body.trim()) {
          return { subject: v.subject, body: v.body, custom: true }
        }
      }
    } catch { /* bad JSON — fall through to default */ }
  }
  return { ...PAY_LETTER_DEFAULTS, custom: false }
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// One builder for BOTH send paths (the per-club modal and the bulk Email clubs
// dialog): editable letter on top, fixed invoice table / Pay button / fee note
// below so the payment mechanics can't be edited away.
export function buildPayReminderEmail(args: {
  clubName: string; clubContact: string; teamsCount: number
  tName: string; link: string; due: number; paid: number; balance: number
  orgName: string; subjectTpl: string; bodyTpl: string
  /** Tournament.startDate (YYYY-MM-DD) and the event-wide team count, for the
   *  {countdown} and {eventTeams} tokens. Omit and those merge to a safe phrase. */
  startDate?: string | null; eventTeams?: number
  /** Branding. Absolute URLs; omit and the shell simply renders without them. */
  eventLogo?: string; eventHref?: string; orgLogo?: string; orgHref?: string
  logoBox?: { w: number; h: number }; footerLogoBox?: { w: number; h: number }
}): { subject: string; html: string; text: string } {
  const totalWithFee = Math.round(args.balance * 1.03 * 100) / 100
  const teamsLabel = `${args.teamsCount} team${args.teamsCount !== 1 ? 's' : ''}`
  const vals = {
    contact: args.clubContact || args.clubName, club: args.clubName, event: args.tName,
    balance: fmt(args.balance), teams: teamsLabel, org: args.orgName,
    countdown: countdownPhrase(args.startDate),
    eventTeams: args.eventTeams && args.eventTeams > 0 ? String(args.eventTeams) : 'a full field of',
  }
  const subject = mergePayLetter(args.subjectTpl, vals)
  const letterText = mergePayLetter(args.bodyTpl, vals)
  const body = `${letterBodyHtml(letterText)}
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 0;color:#64748b">Invoiced</td><td style="padding:6px 0;text-align:right">${fmt(args.due)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Paid</td><td style="padding:6px 0;text-align:right">${fmt(args.paid)}</td></tr>
    <tr><td style="padding:6px 0;font-weight:bold;border-top:1px solid #e2e8f0">Balance due</td><td style="padding:6px 0;text-align:right;font-weight:bold;border-top:1px solid #e2e8f0">${fmt(args.balance)}</td></tr>
  </table>
  <p style="text-align:center;margin:24px 0">
    <a href="${args.link}" style="background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">Pay ${fmt(args.balance)} online</a>
  </p>
  <p style="font-size:13px;color:#64748b">Pay by <strong>bank transfer (ACH) with no fee</strong>, or by card (3% processing fee &mdash; ${fmt(totalWithFee)} total). Prefer to pay by check? Just reply to this email.</p>
  <p style="font-size:13px;color:#64748b">If the button does not work, copy this link into your browser:<br>${args.link}</p>`
  const html = renderEmail({
    orgName: args.orgName,
    eyebrow: args.tName || args.orgName,
    logoUrl: args.eventLogo, logoHref: args.eventHref, logoAlt: args.tName, logoBox: args.logoBox,
    footerLogoUrl: args.orgLogo, footerHref: args.orgHref, footerLogoBox: args.footerLogoBox,
    body,
    footerNote: 'Prefer to pay by check? Just reply to this email.',
  })
  const text = `${letterText}\n\nInvoiced: ${fmt(args.due)}\nPaid: ${fmt(args.paid)}\nBalance due: ${fmt(args.balance)}\n\nPay online — bank transfer (ACH, no fee) or card (3% fee, ${fmt(totalWithFee)} total):\n${args.link}`
  return { subject, html, text }
}
