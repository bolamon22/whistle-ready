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
//   EMAIL_AUTHENTICATED_DOMAINS — comma-separated domains SendGrid can sign for
//   EMAIL_ORG_SENDERS — "slug:address" pairs, per-org From overrides
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

// -- Per-org sending identity ------------------------------------------------
// Mail an org sends to ITS OWN customers - registration confirmations, the
// organizer heads-up, returning-team invites - should look like it came from the
// tournament company, not from the software. Platform mail (password reset,
// staff login invites) must NOT use this: that really is from Whistle Ready.
//
// Hard constraint: the From domain must be authenticated in SendGrid (Sender
// Authentication -> 3 CNAMEs). A From on an unauthenticated domain fails DKIM/SPF
// alignment and gets spam-foldered, so an unauthenticated org address is demoted
// to Reply-To instead of being sent as From. Only list a domain here once it
// shows verified in SendGrid.
const AUTHENTICATED_DOMAINS = String(
  process.env.EMAIL_AUTHENTICATED_DOMAINS || 'whistleready.app,sunshineeventsgroup.com'
).split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

// Preferred From per org slug, used when the org's own contact address isn't on
// an authenticated domain. Override without a deploy:
//   EMAIL_ORG_SENDERS="sunshine-events-group:info@sunshineeventsgroup.com"
//
// Sunshine Events Group's contact address is info@sunshinelax.com, a Google
// Workspace mailbox on a domain that is NOT authenticated in SendGrid - so mail
// goes out from the authenticated sunshineeventsgroup.com and replies route back
// to sunshinelax.com. To send from sunshinelax.com later, authenticate it in
// SendGrid and add it to EMAIL_AUTHENTICATED_DOMAINS; the org contact address is
// then preferred automatically and this map stops mattering.
const ORG_SENDERS: Record<string, string> = {
  'sunshine-events-group': 'info@sunshineeventsgroup.com',
  ...Object.fromEntries(
    String(process.env.EMAIL_ORG_SENDERS || '')
      .split(',')
      .map(pair => pair.split(':').map(s => s.trim()))
      .filter(([slug, email]) => !!slug && !!email && email.includes('@'))
  ),
}

const domainOf = (email?: string | null): string =>
  String(email || '').trim().toLowerCase().split('@')[1] || ''

/** True when SendGrid is set up to sign mail for this address's domain. */
export function senderAuthenticated(email?: string | null): boolean {
  const d = domainOf(email)
  return !!d && AUTHENTICATED_DOMAINS.some(a => d === a || d.endsWith('.' + a))
}

export type OrgSenderInput = { name?: string | null; slug?: string | null; contactEmail?: string | null }

/**
 * From / Reply-To for one org's outbound customer mail. Spread into sendEmail():
 *   await sendEmail({ to, subject, html, ...orgSender(org) })
 *
 * Degrades safely: an unknown or unauthenticated org keeps the platform sender
 * (mail still lands) rather than sending from a domain SendGrid can't sign
 * (mail silently spam-folders).
 */
export function orgSender(org?: OrgSenderInput | null): Pick<SendEmailArgs, 'fromEmail' | 'fromName' | 'replyTo'> {
  if (!org?.name) return {}
  const contact = String(org.contactEmail || '').trim()
  const preferred = (org.slug && ORG_SENDERS[org.slug]) || ''
  const from = senderAuthenticated(contact) ? contact : senderAuthenticated(preferred) ? preferred : ''
  if (!from) {
    console.warn(`[email] no SendGrid-authenticated sender for org "${org.name}" - sending as ${DEFAULT_FROM}`)
    return { fromName: org.name, ...(contact ? { replyTo: contact } : {}) }
  }
  // Replies go to the address a human actually reads, even when we can't send as it.
  return {
    fromEmail: from,
    fromName: org.name,
    ...(contact && contact.toLowerCase() !== from.toLowerCase() ? { replyTo: contact } : {}),
  }
}
