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
//   photoIg        Instagram handle they want tagged / invited as a Collab ('' = none)
//   photoClubIg    the club's Instagram handle, to tag / invite too ('' = none)
//   photoClubFb    the club's Facebook page name (facebook.com/<this>) ('' = none)
// Neither the parent edit whitelist (lib/parentWaiverFields) nor the staff one
// (EDITABLE in the player-waivers route) includes these, so only this flow sets them.

export const PHOTO_FIELDS = ['photoAskAt', 'photoAskBy', 'photoOk', 'photoOkAt', 'photoOkName', 'photoIg', 'photoClubIg', 'photoClubFb'] as const

// ── the link ──────────────────────────────────────────────────────────────────
// An HMAC token naming the waiver and its org, like the parent-account token in
// lib/parentWaivers but with its own prefix so one can never stand in for the
// other. It is deliberately NOT the pass token: that one is printed as a QR on
// the player card and in public hands, and must not be able to grant permission.
// Good for 60 days, long enough to answer late and to change your mind.

/** x: a staff test send. The page works the same, but nothing it answers is saved. */
type PhotoToken = { s: string; o: string; x?: boolean }
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
    const { s, o, e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof s !== 'string' || typeof o !== 'string' || !s || !o) return null
    return Number(e) > Date.now() ? { s, o, ...(x === true ? { x: true } : {}) } : null
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

/** The words the parent agrees to, shown on the page. */
export function photoPermissionText(orgName: string, tournamentName: string): string {
  return `${orgName} may post this player card, with the player's first name and team, on its Instagram and Facebook in the lead-up to ${tournamentName}, and use it to promote future events. You can ask for a post to be taken down at any time.`
}

/** "@handle" from whatever the website editor holds (a handle or a profile URL), or ''. */
export function instagramHandle(v: unknown): string {
  const s = String(v || '').trim()
  if (!s) return ''
  const m = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(s)
  const h = (m ? m[1] : s).replace(/^@/, '')
  return /^[A-Za-z0-9._]{1,30}$/.test(h) ? `@${h}` : ''
}

/** A Facebook page name from a page URL, "@name" or the bare name, or ''. */
export function facebookPage(v: unknown): string {
  const s = String(v || '').trim()
  if (!s) return ''
  const m = /facebook\.com\/(?:pg\/)?([A-Za-z0-9.\-]+)/i.exec(s)
  const n = (m ? m[1] : s).replace(/^@/, '')
  return /^[A-Za-z0-9.\-]{2,80}$/.test(n) && !/^(profile\.php|people|groups|pages)$/i.test(n) ? n : ''
}

// ── the letter ────────────────────────────────────────────────────────────────
// Bo, Oct 18 2026: "letting them know that we really like their picture ... we want
// to know if we can post their player card on Instagram leading up to the
// tournament, letting people know they'll be there. Make it sound important and fun."

export function photoAskEmail(a: {
  orgName: string
  logoUrl?: string
  tournamentName: string
  /** "Oct 24–25, 2026" (lib/vendorApproval eventDates), or ''. */
  dates?: string
  /** "@seglacrosse", or '' when the org has none on file. */
  instagram?: string
  parentName: string
  playerName: string
  photoUrl: string
  cardUrl?: string
  link: string
  base: string
}): { subject: string; html: string; text: string } {
  const player = firstName(a.playerName) || 'your player'
  const P = esc(player)
  const hi = firstName(a.parentName) ? `Hi ${firstName(a.parentName)},` : 'Hi,'
  const photo = absUrl(a.base, a.cardUrl || a.photoUrl)
  const ig = a.instagram ? `Instagram (${a.instagram})` : 'Instagram'
  const when = a.dates ? ` (${a.dates})` : ''
  const subject = `${player} made the cut for ${a.tournamentName}`
  const body = `
    <p style="margin:0 0 14px">${esc(hi)}</p>
    <p style="margin:0 0 14px"><strong>${P} made the cut!</strong> Out of every player card for ${esc(a.tournamentName)}, ${P}'s is one of our favorites.</p>
    <p style="margin:0 0 14px">All week we're counting down on ${esc(ig)} by spotlighting players who'll be on the field, and we'd love ${P} to be one of them.</p>
    ${photo ? `<p style="margin:18px 0"><img src="${photo}" width="220" alt="${P}'s player card" style="display:block;width:220px;max-width:100%;height:auto;border-radius:12px;border:1px solid #e2e8f0"></p>` : ''}
    <p style="margin:0 0 6px">Before anything goes up, we need a parent or guardian's OK. It takes about ten seconds:</p>
    ${button(a.link, 'Yes or no: answer here')}
    <p style="margin:16px 0 14px">Saying yes? Add your Instagram handle (or your player's) on that page, plus your club's Instagram and Facebook if you know them. We'll tag you and your club and send it as a Collab post so it shows up on your pages too. Then please like, share and repost it, and help us get everyone hyped for game day!</p>
    <p style="margin:14px 0 0;font-size:13px;color:#64748b">What we'd post: ${P}'s player card, with first name and team, on our Instagram and Facebook before and during ${esc(a.tournamentName)}${esc(when)}. Rather not? Choose No on that page or just ignore this email, and it won't be posted. Change your mind later? Use the same link, or reply to this email.</p>
    <p style="margin:18px 0 0">See you on the field!<br>The ${esc(a.orgName)} team</p>
  `
  const html = renderEmail({
    orgName: a.orgName,
    logoUrl: a.logoUrl,
    eyebrow: a.tournamentName,
    body,
    footerNote: 'You got this because you signed the player waiver for this event.',
  })
  const text = [
    hi,
    '',
    `${player} made the cut! Out of every player card for ${a.tournamentName}, ${player}'s is one of our favorites.`,
    '',
    `All week we're counting down on ${ig} by spotlighting players who'll be on the field, and we'd love ${player} to be one of them.`,
    '',
    `Before anything goes up, we need a parent or guardian's OK. It takes about ten seconds: ${a.link}`,
    '',
    "Saying yes? Add your Instagram handle (or your player's) on that page, plus your club's Instagram and Facebook if you know them. We'll tag you and your club and send it as a Collab post so it shows up on your pages too. Then please like, share and repost it, and help us get everyone hyped for game day!",
    '',
    `What we'd post: ${player}'s player card, with first name and team, on our Instagram and Facebook before and during ${a.tournamentName}${when}. Rather not? Choose No on that page or just ignore this email, and it won't be posted.`,
    '',
    'See you on the field!',
    `The ${a.orgName} team`,
  ].join('\n')
  return { subject, html, text }
}
