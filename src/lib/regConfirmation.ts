// Registration confirmation "response letter" — shared by the on-screen success
// screen and the email sent to the club contact. The editable voice (welcome,
// next steps, sign-off, subject) comes from the org Forms library, optionally
// overridden per tournament; the summary / payment / links are auto-filled from
// the registration so they're always accurate.

export type RegConfirmation = {
  enabled: boolean      // send the confirmation email
  subject: string       // email subject (supports tokens below)
  welcome: string       // markdown welcome message
  nextSteps: string     // markdown "what's next"
  signoff: string       // markdown sign-off
  /** Comma-separated internal recipients for the new-registration notification.
      Falls back to the org contact email when empty. */
  notifyEmails?: string
}

export const DEFAULT_REG_CONFIRMATION: RegConfirmation = {
  enabled: true,
  subject: 'Registration confirmed — {tournament}',
  welcome:
    "Thank you for registering **{club}** for **{tournament}**! We're thrilled to have you join us{locationClause}. Your registration has been received and your spot is reserved.",
  nextSteps:
    "**What's next**\n" +
    "- **Get into your Whistle Ready account** using the button above. We run {tournament} on **Whistle Ready** — schedules, standings and game-day updates are all online and live, and your login also gives you your roster, player waivers and balance in one place.\n" +
    "- **Player waivers are completed online this year** — no paper forms. Every player needs one on file before their first game; share the waiver link below with your team families.\n" +
    "- The full schedule and pool/bracket assignments will be posted as we get closer to {dates} — you'll see them the moment they're up.\n" +
    "- Questions? Just reply to this email and we'll take care of you.",
  signoff: "See you on the field!\n\n— The {org} Team",
}

export function resolveRegConfirmation(orgCfg: any, override: any): RegConfirmation {
  const o = orgCfg || {}
  const ov = override || {}
  const pick = (k: keyof RegConfirmation) => {
    const v = (ov as any)[k]
    if (v !== undefined && v !== null && String(v).trim() !== '') return v
    const ob = (o as any)[k]
    if (ob !== undefined && ob !== null && String(ob).trim() !== '') return ob
    return (DEFAULT_REG_CONFIRMATION as any)[k]
  }
  return {
    enabled: (o.enabled === undefined ? DEFAULT_REG_CONFIRMATION.enabled : !!o.enabled),
    subject: String(pick('subject')),
    welcome: String(pick('welcome')),
    nextSteps: String(pick('nextSteps')),
    signoff: String(pick('signoff')),
    notifyEmails: String(ov.notifyEmails ?? o.notifyEmails ?? ''),
  }
}

export type RegLetterData = {
  tournamentName: string
  orgName: string
  dates?: string            // pre-formatted e.g. "Oct 24–25, 2026"
  location?: string
  clubName: string
  contactName?: string
  teams: { team?: string; division?: string }[]
  amount?: number           // total owed/charged
  paymentMethod?: string    // 'card' | 'ach' | 'check' | 'invoice' | ...
  paid?: boolean
  eventUrl?: string
  gameDayUrl?: string
  /** Public online player-waiver form for this tournament (waivers are in-app now). */
  waiverUrl?: string
  /** One-time "claim your team" link — invites the coach to set up portal access. */
  claimUrl?: string
  /** True when the contact email already has a Whistle Ready account — the
      letter then says "welcome back, sign in" instead of "create an account". */
  hasAccount?: boolean
  loginUrl?: string
}

function tokens(s: string, d: RegLetterData): string {
  const locationClause = d.location ? ` in ${d.location}` : ''
  return (s || '')
    .replace(/\{tournament\}/g, d.tournamentName || 'the tournament')
    .replace(/\{club\}/g, d.clubName || 'your club')
    .replace(/\{org\}/g, d.orgName || 'the organizers')
    .replace(/\{dates\}/g, d.dates || 'the event')
    .replace(/\{location\}/g, d.location || '')
    .replace(/\{locationClause\}/g, locationClause)
}

const money = (n?: number) => '$' + (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

// Plain-language payment line, derived from method + paid state.
export function paymentLine(d: RegLetterData): string | null {
  if (!d.amount) return null
  const amt = money(d.amount)
  if (d.paid) return `Payment of ${amt} received — thank you! You're all set.`
  const m = (d.paymentMethod || '').toLowerCase()
  if (m.includes('card') || m.includes('stripe')) return `Amount due: ${amt}. If you haven't completed card payment, you can do so from the registration page.`
  if (m.includes('ach') || m.includes('bank')) return `Amount due: ${amt} by ACH/bank transfer. We'll email payment instructions shortly.`
  if (m.includes('check')) return `Amount due: ${amt} by check. We'll follow up with where to mail it.`
  if (m.includes('invoice')) return `Amount due: ${amt}. An invoice will follow by email.`
  return `Amount due: ${amt}. We'll be in touch with payment details.`
}

export type RegLetter = {
  subject: string
  greeting: string
  welcome: string     // tokens resolved, still markdown
  teams: { team?: string; division?: string }[]
  numTeams: number
  payment: string | null
  nextSteps: string   // markdown, tokens resolved
  signoff: string     // markdown, tokens resolved
}

export function buildRegLetter(cfg: RegConfirmation, d: RegLetterData): RegLetter {
  return {
    subject: tokens(cfg.subject, d),
    greeting: d.contactName ? `Hi ${d.contactName.split(' ')[0]},` : 'Hello,',
    welcome: tokens(cfg.welcome, d),
    teams: d.teams || [],
    numTeams: (d.teams || []).length,
    payment: paymentLine(d),
    nextSteps: tokens(cfg.nextSteps, d),
    signoff: tokens(cfg.signoff, d),
  }
}

// ── Email rendering (inline styles; email clients don't load Tailwind) ──
function escHtml(s: string) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }

// Minimal markdown -> inline-styled HTML for email bodies.
function emailMd(src: string): string {
  const lines = (src || '').replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { out.push('<ul style="margin:8px 0;padding-left:20px;color:#475569">' + list.join('') + '</ul>'); list = [] } }
  const inline = (s: string) => escHtml(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#0f766e">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#0f172a">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
  for (const raw of lines) {
    const line = raw.trim()
    if (/^[-*]\s+/.test(line)) { list.push('<li style="margin:2px 0">' + inline(line.replace(/^[-*]\s+/, '')) + '</li>'); continue }
    flush()
    if (!line) continue
    out.push('<p style="margin:8px 0;color:#475569;line-height:1.6">' + inline(line) + '</p>')
  }
  flush()
  return out.join('')
}

export function letterToEmailHtml(letter: RegLetter, d: RegLetterData): string {
  const teamRows = (letter.teams.length ? letter.teams : [{}]).map(t =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-weight:600">${escHtml(t.team || 'Team')}</td><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;text-align:right">${escHtml(t.division || '')}</td></tr>`
  ).join('')
  const pay = letter.payment ? `<p style="margin:14px 0;padding:12px 14px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;color:#0f766e;font-size:14px">${escHtml(letter.payment)}</p>` : ''
  const links: string[] = []
  if (d.eventUrl) links.push(`<a href="${d.eventUrl}" style="color:#0f766e">Event page</a>`)
  if (d.waiverUrl) links.push(`<a href="${d.waiverUrl}" style="color:#0f766e">Player waiver form</a>`)
  if (d.gameDayUrl) links.push(`<a href="${d.gameDayUrl}" style="color:#0f766e">Game day</a>`)
  const linksRow = links.length ? `<p style="margin:14px 0 0;font-size:14px;color:#475569">${links.join(' &nbsp;·&nbsp; ')}</p>` : ''
  // Account CTA — the main action we want the coach to take after registering.
  // New contact → the claim link creates their Whistle Ready login.
  // Returning contact → welcome back + sign in + the pre-tournament checklist
  // (don't ask people who already have accounts to sign up again).
  const claim = d.hasAccount ? `
    <div style="margin:18px 0;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
      <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#0f172a">Welcome back — you already have an account</p>
      <p style="margin:0 0 12px;font-size:13px;color:#475569;line-height:1.5">This registration is tied to your Whistle Ready login. Once you're signed in: confirm your players are registered, make sure each one has completed the <strong style="color:#0f172a">online player waiver</strong>, keep an eye on your balance, and watch for the schedule the moment it posts.</p>
      <a href="${d.loginUrl || '#'}" style="display:inline-block;background:#0f766e;color:#ffffff;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;text-decoration:none">Sign in to my account →</a>
    </div>` : d.claimUrl ? `
    <div style="margin:18px 0;padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px">
      <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#0f172a">Set up your Whistle Ready account</p>
      <p style="margin:0 0 12px;font-size:13px;color:#475569;line-height:1.5">We run this event on Whistle Ready — live schedules, standings and game-day updates, plus your roster, online player waivers and balance, all in one place. Use this link to create your login.</p>
      <a href="${d.claimUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;text-decoration:none">Set up my account →</a>
      <p style="margin:10px 0 0;font-size:11px;color:#94a3b8">This link is unique to your registration.</p>
    </div>` : ''
  const meta = [d.dates, d.location].filter(Boolean).join(' · ')
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <div style="border-bottom:3px solid #0f766e;padding-bottom:12px;margin-bottom:18px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0f766e">${escHtml(d.orgName || '')}</div>
      <h1 style="margin:4px 0 0;font-size:22px;color:#0f172a">${escHtml(d.tournamentName)}</h1>
      ${meta ? `<div style="color:#64748b;font-size:14px;margin-top:2px">${escHtml(meta)}</div>` : ''}
    </div>
    <p style="margin:0 0 8px;color:#0f172a;font-weight:600">${escHtml(letter.greeting)}</p>
    ${emailMd(letter.welcome)}
    <h2 style="font-size:14px;color:#0f172a;margin:18px 0 6px">Your registration</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <tr><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#64748b">Club</td><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-weight:600;text-align:right">${escHtml(d.clubName || '')}</td></tr>
      ${teamRows}
      <tr><td style="padding:6px 12px;color:#64748b">Teams</td><td style="padding:6px 12px;color:#0f172a;font-weight:600;text-align:right">${letter.numTeams}</td></tr>
    </table>
    ${pay}
    ${claim}
    ${emailMd(letter.nextSteps)}
    ${emailMd(letter.signoff)}
    ${linksRow}
    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px">${escHtml(d.orgName || '')} · Registration confirmation</p>
  </div>`
}

// ── Internal "new registration" notification ─────────────────────────────
// Sent to the tournament organizers (and anyone else in notifyEmails) so a
// human can call the club director and welcome them. Includes every detail
// captured on the form — this email IS the call sheet.
export type RegNotifyData = RegLetterData & {
  contactEmail?: string
  contactPhone?: string
  clubBasedIn?: string
  needsHotel?: string
  notes?: string
  instagram?: string   // club's IG handle (no @) — for the follow/collab play
  adminUrl?: string    // staff registrations page for this tournament
}

export function organizerEmailSubject(d: RegNotifyData): string {
  const n = (d.teams || []).length
  return `New registration — ${d.clubName || 'Unknown club'} (${n} team${n === 1 ? '' : 's'}) — ${d.tournamentName}`
}

export function organizerEmailHtml(d: RegNotifyData): string {
  const row = (label: string, value?: string, href?: string) => value ? `<tr>
    <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;white-space:nowrap">${escHtml(label)}</td>
    <td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#0f172a;font-weight:600;text-align:right">${href ? `<a href="${href}" style="color:#0f766e">${escHtml(value)}</a>` : escHtml(value)}</td>
  </tr>` : ''
  const teamRows = (d.teams || []).map(t =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#0f172a">${escHtml(t.team || 'Team')}</td><td style="padding:6px 12px;border-bottom:1px solid #f1f5f9;color:#64748b;text-align:right">${escHtml(t.division || '')}</td></tr>`
  ).join('')
  const pay = d.amount ? `<p style="margin:12px 0;padding:10px 14px;background:${d.paid ? '#f0fdf4;border:1px solid #bbf7d0' : '#fffbeb;border:1px solid #fde68a'};border-radius:8px;font-size:14px;color:${d.paid ? '#166534' : '#92400e'}">${d.paid ? `Paid online — ${money(d.amount)} received.` : `${money(d.amount)} due · method: ${escHtml(d.paymentMethod || 'not set')}`}</p>` : ''
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;padding:24px">
    <div style="border-bottom:3px solid #0f766e;padding-bottom:12px;margin-bottom:16px">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0f766e">New team registration</div>
      <h1 style="margin:4px 0 0;font-size:20px;color:#0f172a">${escHtml(d.clubName || 'Unknown club')} → ${escHtml(d.tournamentName)}</h1>
    </div>
    <p style="margin:0 0 12px;color:#475569;font-size:14px;line-height:1.6">A new club just registered. Give <strong style="color:#0f172a">${escHtml(d.contactName || 'the club director')}</strong> a call to welcome them and confirm details.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      ${row('Contact', d.contactName)}
      ${row('Phone', d.contactPhone, d.contactPhone ? `tel:${(d.contactPhone || '').replace(/[^+\d]/g, '')}` : undefined)}
      ${row('Email', d.contactEmail, d.contactEmail ? `mailto:${d.contactEmail}` : undefined)}
      ${row('Based in', d.clubBasedIn)}
      ${row('Hotel needed', d.needsHotel)}
      ${row('Instagram', d.instagram ? '@' + d.instagram : '', d.instagram ? `https://instagram.com/${d.instagram}` : undefined)}
    </table>
    <h2 style="font-size:14px;color:#0f172a;margin:16px 0 6px">Teams (${(d.teams || []).length})</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">${teamRows}</table>
    ${pay}
    ${d.notes ? `<h2 style="font-size:14px;color:#0f172a;margin:16px 0 6px">Notes from the club</h2><p style="margin:0;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#475569;font-size:14px;line-height:1.6">${escHtml(d.notes)}</p>` : ''}
    ${d.adminUrl ? `<p style="margin:18px 0 0"><a href="${d.adminUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;font-weight:600;font-size:14px;padding:10px 20px;border-radius:8px;text-decoration:none">Open in Whistle Ready →</a></p>` : ''}
    <p style="margin:22px 0 0;color:#94a3b8;font-size:12px">${escHtml(d.orgName || '')} · Internal notification — not sent to the club</p>
  </div>`
}
