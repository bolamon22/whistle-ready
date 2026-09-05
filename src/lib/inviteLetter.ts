import { prisma } from '@/lib/db'

// One invite letter, a dropdown decides who it goes to (Bo, Sep 5 2026). Two audiences:
//   'staff'   — people already in the Staff Pool; emailed by /api/workers/onboard with
//               each person's own claim link on the button.
//   'recruit' — people we don't know yet; copied into an email/text with the public
//               /join link. (Website inquiries go through the /join form itself.)
// Custom wording lives per org in AppSetting inviteLetter:{audience}:{orgId} as JSON
// {subject, body}; these defaults are the fallback. {firstName} {name} {org} {link}
// merge at send/copy time.

export type InviteAudience = 'staff' | 'recruit'

export const INVITE_LETTER_DEFAULTS: Record<InviteAudience, { subject: string; body: string }> = {
  staff: {
    subject: 'Create your {org} staff login',
    body: `Hi {firstName} — you're in the {org} staff pool on Whistle Ready, the app we use to run our events. Create your login to see your game assignments, set your availability, and keep your pay details current.

Your role and details are already set up — you just choose a password. This link expires in 30 days. If you weren't expecting this, you can ignore it.`,
  },
  recruit: {
    subject: 'Come work {org} events this season',
    body: `We're staffing our upcoming tournaments and could use good people on the crew — refs, scorekeepers, athletic trainers, and field ops.

Signing up takes about two minutes: pick your role, check the events you can work, and you're in the pool for assignments and pay.

Sign up here: {link}`,
  },
}

export async function inviteLetterFor(orgId: string | null, audience: InviteAudience): Promise<{ subject: string; body: string; custom: boolean }> {
  if (orgId) {
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: `inviteLetter:${audience}:${orgId}` } })
      if (row?.value) {
        const v = JSON.parse(row.value) as { subject?: unknown; body?: unknown }
        if (typeof v?.subject === 'string' && typeof v?.body === 'string' && v.body.trim()) {
          return { subject: v.subject, body: v.body, custom: true }
        }
      }
    } catch { /* bad JSON or no table — fall through to default */ }
  }
  return { ...INVITE_LETTER_DEFAULTS[audience], custom: false }
}

export function mergeLetter(text: string, vals: Record<string, string>): string {
  return text.replace(/\{(firstName|name|org|link)\}/g, (_m, k: string) => vals[k] ?? '')
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => HTML_ESCAPES[c])
}

// Org-authored plain text -> the email's paragraph markup (blank line = new paragraph)
export function letterBodyHtml(merged: string): string {
  return escapeHtml(merged).split(/\n{2,}/).map(p =>
    `<p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${p.replace(/\n/g, '<br/>')}</p>`
  ).join('')
}
