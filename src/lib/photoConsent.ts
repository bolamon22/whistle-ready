import crypto from 'crypto'
import { renderEmail, button, esc, absUrl } from '@/lib/emailLayout'

// Permission to share a player's card photo on social media (Bo, Oct 18 2026:
// "draft an email asking them if we can use them in social media posts ... I'd
// kind of like them to be able to just do it through the platform").
//
// Staff pick photos on /tournaments/<id>/player-waivers/social and ask; the
// family gets one email with the photo and a link to /pass/photo-ok/<token>,
// where the parent or guardian answers Yes or No. Nothing is posted by the app:
// this only records the answer so staff know which photos they may use.
//
// The answer lives on the waiver itself (OrgFormSubmission.data), written only
// by updateSubmissionData so each change lands in the waiver's edit history:
//   photoAskAt     ISO time staff last sent the request
//   photoAskBy     who sent it
//   photoOk        'yes' | 'no' | '' (not answered)
//   photoOkAt      when they answered
//   photoOkName    the name the parent typed when answering
// Neither the parent edit whitelist (lib/parentWaiverFields) nor the staff one
// (EDITABLE in the player-waivers route) includes these, so only this flow sets them.

export const PHOTO_FIELDS = ['photoAskAt', 'photoAskBy', 'photoOk', 'photoOkAt', 'photoOkName'] as const

// ── the link ──────────────────────────────────────────────────────────────────
// An HMAC token naming the waiver and its org, like the parent-account token in
// lib/parentWaivers but with its own prefix so one can never stand in for the
// other. It is deliberately NOT the pass token: that one is printed as a QR on
// the player card and in public hands, and must not be able to grant permission.
// Good for 60 days, long enough to answer late and to change your mind.

type PhotoToken = { s: string; o: string }
const secret = () => process.env.NEXTAUTH_SECRET || ''
const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(`photook.${payload}`).digest('base64url')

export function signPhotoToken(t: PhotoToken, ttlMs = 60 * 24 * 60 * 60 * 1000): string {
  const payload = Buffer.from(JSON.stringify({ ...t, e: Date.now() + ttlMs })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function readPhotoToken(token: string): PhotoToken | null {
  if (!secret()) return null
  const [payload, sig] = String(token || '').split('.')
  if (!payload || !sig) return null
  const a = Buffer.from(sig), b = Buffer.from(sign(payload))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const { s, o, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof s !== 'string' || typeof o !== 'string' || !s || !o) return null
    return Number(e) > Date.now() ? { s, o } : null
  } catch { return null }
}

// ── who it goes to ────────────────────────────────────────────────────────────
// The parent who signed the waiver, and parent 2 when there is one. Players are
// mostly minors, so never the player's own email.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export function photoAskRecipients(d: any): string[] {
  const out: string[] = []
  for (const k of ['parentEmail', 'parent2Email']) {
    const e = String(d?.[k] || '').trim().toLowerCase()
    if (EMAIL.test(e) && !out.includes(e)) out.push(e)
  }
  return out
}

export const firstName = (full: unknown) => String(full || '').trim().split(/\s+/)[0] || ''

/** The words the parent agrees to, shown on the page and repeated in the email. */
export function photoPermissionText(orgName: string, tournamentName: string): string {
  return `${orgName} may share this photo and player card, with the player's first name and team, on its Instagram and Facebook pages to promote ${tournamentName} and future events. You can ask for a post to be taken down at any time.`
}

// ── the letter ────────────────────────────────────────────────────────────────

export function photoAskEmail(a: {
  orgName: string
  logoUrl?: string
  tournamentName: string
  parentName: string
  playerName: string
  photoUrl: string
  cardUrl?: string
  link: string
  base: string
}): { subject: string; html: string; text: string } {
  const player = firstName(a.playerName) || 'your player'
  const hi = firstName(a.parentName) ? `Hi ${esc(firstName(a.parentName))},` : 'Hi,'
  const photo = absUrl(a.base, a.cardUrl || a.photoUrl)
  const subject = `Can we feature ${player} on Instagram?`
  const body = `
    <p style="margin:0 0 14px">${hi}</p>
    <p style="margin:0 0 14px">${esc(player)}'s player card photo for ${esc(a.tournamentName)} is one of our favorites. We'd love to share it on our Instagram and Facebook to help promote the tournament.</p>
    ${photo ? `<p style="margin:18px 0"><img src="${photo}" width="220" alt="${esc(player)}'s player card" style="display:block;width:220px;max-width:100%;height:auto;border-radius:12px;border:1px solid #e2e8f0"></p>` : ''}
    <p style="margin:0 0 6px">We'll only post it if a parent or guardian says yes. It takes one tap:</p>
    ${button(a.link, 'Yes or no: answer here')}
    <p style="margin:14px 0 0;font-size:13px;color:#64748b">If you'd rather we didn't, choose No on that page or just ignore this email, and we won't use the photo. Changed your mind later? Use the same link, or reply to this email.</p>
  `
  const html = renderEmail({
    orgName: a.orgName,
    logoUrl: a.logoUrl,
    eyebrow: a.tournamentName,
    body,
    footerNote: 'You got this because you signed the player waiver for this event.',
  })
  const text = [
    hi.replace(/<[^>]+>/g, ''),
    '',
    `${player}'s player card photo for ${a.tournamentName} is one of our favorites. We'd love to share it on our Instagram and Facebook to help promote the tournament.`,
    '',
    `We'll only post it if a parent or guardian says yes. Answer here: ${a.link}`,
    '',
    "If you'd rather we didn't, choose No on that page or just ignore this email, and we won't use the photo.",
    '',
    a.orgName,
  ].join('\n')
  return { subject, html, text }
}
