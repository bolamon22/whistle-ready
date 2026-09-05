import { sendEmail, orgSender, OFFICE_CC } from '@/lib/email'

// "Let me know they registered" (Bo, Sep 5): one compact office email the moment a
// staff login gets created — clearer than CC'ing the new staffer's own welcome mail.
// Fired from all three registration doors: the /join signup, a claim-invite accept,
// and the plain-invite flow. Best-effort like all mail — never blocks the signup.

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL (stale in prod)

const ROLE_LABELS: Record<string, string> = {
  ref: 'Referee', scorekeeper: 'Scorekeeper', athletic_trainer: 'Athletic Trainer',
  field_ops: 'Field Ops', assigner: 'Assigner',
}
const SOURCE_LABELS: Record<string, string> = {
  signup: 'through your recruiting link',
  claim: 'from their app invite',
  invite: 'from their invite',
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export async function notifyStaffRegistered(opts: {
  org: { name?: string | null } | null
  name: string
  email: string
  phone?: string | null
  roles: string[]
  source: 'signup' | 'claim' | 'invite'
  events?: string[]
}) {
  try {
    const roleLine = opts.roles.map(r => ROLE_LABELS[r] ?? r).join(', ') || 'Staff'
    const row = (label: string, value: string) =>
      `<tr><td style="padding:3px 12px 3px 0;color:#94a3b8;font-size:12px;white-space:nowrap;">${label}</td><td style="padding:3px 0;color:#0f172a;font-size:13px;">${value}</td></tr>`
    await sendEmail({
      ...orgSender(opts.org),
      to: OFFICE_CC,
      subject: `Staff registered — ${opts.name} (${roleLine})`,
      html: `
        <div style="font-family: sans-serif; max-width: 440px; margin: 0 auto; padding: 28px 24px;">
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 4px;">${esc(opts.name)} just registered</h2>
          <p style="color: #64748b; font-size: 13px; margin: 0 0 16px;">They created their staff login ${SOURCE_LABELS[opts.source] ?? ''}.</p>
          <table style="border-collapse: collapse;">
            ${row('Role', esc(roleLine))}
            ${row('Email', esc(opts.email))}
            ${opts.phone ? row('Phone', esc(String(opts.phone))) : ''}
            ${opts.events?.length ? row('Working', esc(opts.events.join(', '))) : ''}
          </table>
          <a href="${APP_URL}/staff"
            style="display: inline-block; margin-top: 18px; background: #14b8a6; color: white; font-weight: 600;
                   font-size: 13px; padding: 10px 22px; border-radius: 10px; text-decoration: none;">
            Open the Staff Pool &rarr;
          </a>
        </div>
      `,
    })
  } catch { /* notification only — the registration itself already succeeded */ }
}
