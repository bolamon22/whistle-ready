// The pure, browser-safe half of the invite letters: the audience list, the default
// wording, and the text/HTML merging.
//
// SPLIT OUT FROM inviteLetter.ts BECAUSE THAT FILE IMPORTS PRISMA. The Staff Pool
// panel is a client component and needs letterCopyHtml to build the rich-text
// clipboard payload; importing it from the module that also reads AppSetting would
// drag the database client into the browser bundle. Nothing here touches the database
// -- inviteLetter.ts keeps the lookup and re-exports all of this, so existing imports
// are unaffected.

//   'assigner' — the person who runs a crew of officials. Not a recruit pitch: it is
//               written to be FORWARDED, so it addresses the assigner and then speaks
//               to their refs, and it carries no {firstName} because Bo pastes it into
//               Gmail and types the greeting himself (Bo, Sep 29 2026).
export type InviteAudience = 'staff' | 'recruit' | 'assigner'

export const INVITE_LETTER_DEFAULTS: Record<InviteAudience, { subject: string; body: string }> = {
  staff: {
    subject: 'Create your {org} staff login',
    body: `Hi {firstName} — you're in the {org} staff pool on Whistle Ready, the app we use to run our events. Create your login to see your game assignments, set your availability, and keep your pay details current.

Your role and details are already set up — you just choose a password. This link expires in 30 days. If you weren't expecting this, you can ignore it.`,
  },
  assigner: {
    subject: 'Signup link for your officials — {org} events',
    body: `We're building out the {org} staff list for the season and I'd like your crew on it. Would you pass this along to your officials?

Anyone who signs up lands in our pool for assignments and pay. Nothing changes about how you and I work together — it just saves us both chasing contact details and availability over text.

It takes about two minutes: pick your role, check the events you can work, and you're in.

Sign up here: {link}

Anyone already in our pool can ignore it — they're set.`,
  },
  recruit: {
    subject: 'Come work {org} events this season',
    body: `We're staffing our upcoming tournaments and could use good people on the crew — refs, scorekeepers, athletic trainers, and field ops.

Signing up takes about two minutes: pick your role, check the events you can work, and you're in the pool for assignments and pay.

Sign up here: {link}`,
  },
}

export function mergeLetter(text: string, vals: Record<string, string>): string {
  return text.replace(/\{(firstName|name|org|link)\}/g, (_m, k: string) => vals[k] ?? '')
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, c => HTML_ESCAPES[c])
}

// COPYING A LETTER INTO GMAIL.
//
// The panel used to put plain text on the clipboard. Gmail pastes that as-is: the
// link arrives as bare characters that Gmail may or may not decide to autolink, and
// when it does not, the recipient gets a URL they have to select and paste
// themselves -- which is what Bo meant by "the links don't look right" (Sep 29 2026).
// Writing text/html alongside text/plain lets Gmail take the markup and leaves every
// other target the readable text.
//
// The {link} is swapped for a sentinel BEFORE escaping so the anchor can be spliced
// in afterwards without a regex hunting for a URL inside already-escaped text. The
// sentinel uses NUL, which escapeHtml leaves alone and no letter will ever contain.
const LINK_TOKEN = '\u0000__WR_LINK__\u0000'

export function letterCopyHtml(body: string, vals: Record<string, string>, link: string): string {
  const merged = mergeLetter(body.replace(/\{link\}/g, LINK_TOKEN), { ...vals, link: '' })
  const anchor = link
    ? `<a href="${escapeHtml(link)}" style="color:#0d9488;text-decoration:underline;">${escapeHtml(link)}</a>`
    : ''
  const html = escapeHtml(merged)
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 12px;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('')
  return html.split(LINK_TOKEN).join(anchor)
}

// Org-authored plain text -> the email's paragraph markup (blank line = new paragraph)
export function letterBodyHtml(merged: string): string {
  return escapeHtml(merged).split(/\n{2,}/).map(p =>
    `<p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 16px;">${p.replace(/\n/g, '<br/>')}</p>`
  ).join('')
}
