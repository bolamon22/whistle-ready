// Single place every transactional email goes through.
//
// Routes must NEVER import an email provider directly — they call sendEmail().
// That keeps the provider swappable in one file and gives us one seam to add
// per-org senders (fromEmail/fromName) and, later, other channels.
//
// Env:
//   SENDGRID_API_KEY  — required to actually send (absent = no-op, logged)
//   EMAIL_FROM        — default sender address (must be a SendGrid-verified domain)
//   EMAIL_FROM_NAME   — default sender display name
// INVITE_FROM_EMAIL is still read as a fallback so existing deploys keep working.
import sgMail from '@sendgrid/mail'

const DEFAULT_FROM = process.env.EMAIL_FROM || process.env.INVITE_FROM_EMAIL || 'noreply@whistleready.app'
const DEFAULT_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Whistle Ready'

export type SendEmailArgs = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  replyTo?: string
  /** Per-org sender. Only use a domain authenticated in SendGrid, or delivery fails. */
  fromEmail?: string
  fromName?: string
}

export type SendEmailResult = { ok: boolean; error?: string }

/** True when email is configured. Use to gate optional sends. */
export function emailEnabled(): boolean {
  return !!process.env.SENDGRID_API_KEY
}

/**
 * Send one transactional email. Never throws — email is best-effort and must
 * not fail the request that triggered it (a registration should still succeed
 * if the receipt bounces). Check `.ok` if the caller cares.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const key = process.env.SENDGRID_API_KEY
  if (!key) {
    console.warn('[email] SENDGRID_API_KEY not set — skipping send:', args.subject)
    return { ok: false, error: 'email not configured' }
  }
  const recipients = Array.isArray(args.to) ? args.to.filter(Boolean) : [args.to].filter(Boolean)
  if (!recipients.length) return { ok: false, error: 'no recipient' }

  try {
    sgMail.setApiKey(key)
    await sgMail.send({
      to: recipients,
      from: { email: args.fromEmail || DEFAULT_FROM, name: args.fromName || DEFAULT_FROM_NAME },
      subject: args.subject,
      html: args.html,
      ...(args.text ? { text: args.text } : {}),
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    })
    return { ok: true }
  } catch (e: any) {
    // SendGrid puts the useful part in response.body.errors
    const msg = e?.response?.body?.errors?.[0]?.message || e?.message || 'send failed'
    console.error('[email] send failed:', args.subject, '—', msg)
    return { ok: false, error: String(msg) }
  }
}
