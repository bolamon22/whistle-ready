// The pre-event checklist letter's body (Bo, Oct 4 2026): one letter the whole
// field gets, with each club's own outstanding items checked off.
//
// Pure on purpose -- no '@/lib/db' import -- so the same builder can render a
// preview in a client component without dragging Prisma into its graph (that is
// what 500'd the photographer pages on Oct 3). commSend.ts gathers the facts.
//
// ⚠ Player waivers is the one item that cannot report "28 of 34": the app stores
// waivers RECEIVED and has no roster size to divide by. So the rule here is
// "every registered team has at least one waiver", and the line names the teams
// still on zero -- which is the actionable half anyway. A true x-of-y needs an
// expected-player-count field on the registration form.

export type ChecklistFacts = {
  eventName: string
  teamCount: number
  teamsConfirmed: boolean
  confirmedOn: string          // "September 28", or '' when unknown
  /** This login can open THIS registration in the portal (ClubRegAccess). */
  hasLogin: boolean
  /** Their email already has a Whistle Ready account, it just isn't attached to
   *  this registration yet — a different sentence from having no account. */
  hasAccountElsewhere: boolean
  loginEmail: string
  waiverTotal: number
  teamsWithNoWaivers: string[] // registered team names still on zero
  /** Rough roster expectation for this club's divisions — wording only. */
  expectedLow: number
  expectedHigh: number
  coachTotal: number
  teamsWithNoCoach: string[]
  invoiced: number             // after discount
  balance: number              // remaining, already rounded, never below 0
  /** lib/housing deriveStatus — the same call the housing board makes. */
  housingStatus: 'needs' | 'progress' | 'booked' | 'local'
  /** Staff ticked this club local on the housing board. NOT the same as the
   *  club answering "No" on the registration form — see the hotel row. */
  staffMarkedLocal: boolean
  /** They ticked Yes or Maybe for rooms on the registration form. */
  saidNeedsHotel: boolean
  /** Club's home town is inside the local radius (lib/geoDistance). False when
   *  we could not place them — unknown must never read as "local". */
  withinLocalRadius: boolean
  hotelName: string
  hotelRooms: number
  /** The org's housing coordinator, from housingSettings — the person who can
   *  put a whole club in one hotel. Blank until the org fills it in, and the
   *  line is dropped rather than guessed at. */
  housingContactName: string
  housingContactEmail: string
}

export type ChecklistLinks = {
  confirmLink: string
  accountLink: string
  waiverLink: string
  coachLink: string
  payLink: string
  /** The org's housing bookingUrl — where families actually book. */
  hotelLink: string
  /** /share/<regId> — the ready-written messages. Anchored per row. */
  shareLink: string
  /** The club director portal. Signed in, it opens; signed out, login sends
   *  club_director straight here afterwards (lib/roleHome), so one link covers
   *  both. */
  portalLink: string
}

export type ChecklistItem = {
  key: 'teams' | 'login' | 'waivers' | 'coaches' | 'balance' | 'hotel'
  title: string
  done: boolean
  detail: string
  ctaLabel?: string
  ctaUrl?: string
  /** A second, quieter action beside the main one — always the ready-written
   *  message for this row. Bo, Oct 4 2026: one link at the foot of the letter
   *  "is going to get missed", and it should sit next to the thing it is for. */
  altLabel?: string
  altUrl?: string
  /** A quieter aside under the detail — for the director, not the families. */
  note?: string
}

/** Placeholder the {checklist} token merges to, swapped for the real block once
 *  the body has been turned into HTML. No HTML-special characters, so it comes
 *  through letterBodyHtml's escaping untouched. */
export const CHECKLIST_SENTINEL = '@@WR_CHECKLIST@@'

// Bo's rough roster sizes (Oct 4 2026), his own estimate: a full-field team runs
// 20-25 players, a 7v7 team 12-16. They are a GUESS, so they only ever shape the
// wording of the waiver line -- never whether it ticks. Printing "21 of 75" off a
// guessed denominator would leave a club with a small roster permanently behind.
export const ROSTER_ESTIMATE = { full: { low: 20, high: 25 }, small: { low: 12, high: 16 } }

/** Rough expected player range for a set of divisions. 7v7 divisions are named
 *  that way by convention, the same string the flat 7v7 price matches on. */
export function expectedPlayers(divisions: string[]): { low: number; high: number } {
  let low = 0, high = 0
  for (const d of divisions) {
    const e = /7\s*v\s*7/i.test(String(d || '')) ? ROSTER_ESTIMATE.small : ROSTER_ESTIMATE.full
    low += e.low; high += e.high
  }
  return { low, high }
}

const usd = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })

const list = (xs: string[]) =>
  xs.length === 1 ? xs[0] : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

export function buildChecklist(f: ChecklistFacts, links: ChecklistLinks): ChecklistItem[] {
  const items: ChecklistItem[] = []
  const teams = `${f.teamCount} team${f.teamCount === 1 ? '' : 's'}`
  const allTeams = f.teamCount === 1 ? 'your team' : `all ${f.teamCount} of your teams`

  items.push(f.teamsConfirmed
    ? { key: 'teams', title: 'Teams and divisions confirmed', done: true,
        detail: f.confirmedOn ? `Confirmed ${f.confirmedOn} · ${teams}.` : `Confirmed · ${teams}.` }
    : { key: 'teams', title: 'Confirm your teams and divisions', done: false,
        // A registration the office keyed in can have no teams on it yet, and
        // "we have 0 teams down for you" is not a sentence to send a customer.
        detail: f.teamCount === 0
          ? 'We do not have any teams listed for you yet. Send us your team names and divisions and we will get them in.'
          : `We have ${teams} down for you. Tell us that is right, or send a correction, before the schedule locks.`,
        ctaLabel: f.teamCount === 0 ? 'Send us your teams' : 'Review and confirm', ctaUrl: links.confirmLink })

  // Two different misses here, and they need different sentences. No account at
  // all means sign up. An account that exists but is not attached to this
  // registration means claim it with the password they already have — telling
  // that person to "set up a login" sends them hunting for a second one. The
  // claim page handles both; only the wording changes.
  items.push(f.hasLogin
    ? { key: 'login', title: 'Club portal login', done: true,
        detail: (f.loginEmail ? `${f.loginEmail} can sign in. ` : '')
          + 'Everything on this list is in there too — your teams, waivers, coaches, balance, and the messages to send your families.',
        ctaLabel: 'Open my club portal', ctaUrl: links.portalLink }
    : f.hasAccountElsewhere
      ? { key: 'login', title: 'Link this event to your login', done: false,
          detail: `You already have a Whistle Ready login${f.loginEmail ? ` for ${f.loginEmail}` : ''} — this registration just is not attached to it yet. One click, using the password you already have.`,
          ctaLabel: 'Add this event to my login', ctaUrl: links.accountLink }
      : { key: 'login', title: 'Set up your club login', done: false,
          detail: 'It is where your roster, waivers, balance and the schedule all live. Takes about a minute.',
          ctaLabel: 'Set up my login', ctaUrl: links.accountLink })

  // Done only when there is something to measure AND no team is sitting on zero.
  const waiversDone = f.teamCount > 0 && f.waiverTotal > 0 && f.teamsWithNoWaivers.length === 0
  const got = `${f.waiverTotal} waiver${f.waiverTotal === 1 ? '' : 's'} in`
  const short = f.expectedLow > 0 && f.waiverTotal < f.expectedLow
  const range = `For ${teams} we would usually expect somewhere around ${f.expectedLow}\u2013${f.expectedHigh} players.`
  const zeros = f.teamsWithNoWaivers.length
    ? `${list(f.teamsWithNoWaivers)} ${f.teamsWithNoWaivers.length === 1 ? 'has' : 'have'} none yet.`
    : ''
  items.push(waiversDone
    ? { key: 'waivers', title: 'Player waivers', done: true,
        detail: `${got}, from ${allTeams}. Keep them coming as families sign up.` }
    : { key: 'waivers', title: 'Player waivers', done: false,
        detail: [got + '.', zeros, short ? range : '', 'Every player needs one before their first game.']
          .filter(Boolean).join(' '),
        ctaLabel: 'Share the waiver link', ctaUrl: links.waiverLink,
        altLabel: 'Send to my families', altUrl: `${links.shareLink}#waivers` })

  // Coaches sign their own form, and a team on the field without one is a
  // problem at check-in, so it gets its own line rather than hiding in the
  // waiver count. Same rule shape: every team needs at least one.
  const coachesDone = f.teamCount > 0 && f.coachTotal > 0 && f.teamsWithNoCoach.length === 0
  items.push(coachesDone
    ? { key: 'coaches', title: 'Coaches registered', done: true,
        detail: `${f.coachTotal} coach${f.coachTotal === 1 ? '' : 'es'} registered, covering ${allTeams}.` }
    : { key: 'coaches', title: 'Coaches registered', done: false,
        detail: f.teamsWithNoCoach.length
          ? `${f.coachTotal} registered so far. ${list(f.teamsWithNoCoach)} ${f.teamsWithNoCoach.length === 1 ? 'has' : 'have'} no coach signed up yet \u2014 every team needs at least one on the sideline.`
          : 'Every coach on your sideline needs to register, same as the players.',
        ctaLabel: 'Coach registration', ctaUrl: links.coachLink,
        altLabel: 'Send to my coaches', altUrl: `${links.shareLink}#coaches` })

  // A $0 invoice has nothing to chase, so the row does not appear at all.
  if (f.invoiced > 0) {
    items.push(f.balance <= 0
      ? { key: 'balance', title: 'Balance paid', done: true, detail: `Paid in full · ${usd(f.invoiced)}. Thank you.` }
      : { key: 'balance', title: 'Balance due', done: false,
          detail: `${usd(f.balance)} of ${usd(f.invoiced)} still outstanding.`,
          ctaLabel: 'Pay the balance', ctaUrl: links.payLink })
  }

  // WHO GETS THE HOTEL ROW, in order:
  //   1. Staff ticked "Local — not needed" on the housing board → never shown.
  //      A human decision always wins, and it is one dropdown per club.
  //   2. They said Yes or Maybe for rooms, or we already have a hotel or rooms
  //      against them → shown.
  //   3. Their home town is inside the radius → hidden.
  //   4. Anything else, including a town we could not place and every
  //      out-of-state club → shown.
  //
  // What is deliberately NOT a reason to hide it: the club answering "No" on
  // the form. Bo, Oct 4 2026 — "some people still type no when they're
  // registering just because they don't want to be bothered with dealing with
  // it." Those clubs still have families who need rooms, and room nights are
  // what pay for the event, so a shrugged No from 200 miles away must not
  // silence the ask. Within the radius it does, because then it is probably true.
  //
  // The club's only job is forwarding the link — families book their own rooms
  // (Bo, Oct 4 2026) — so the row carries a ready-to-paste note for them, and
  // the only evidence we get that it worked is rooms logged against the club.
  const hotelAlreadyInPlay = f.saidNeedsHotel || f.housingStatus === 'booked' || f.housingStatus === 'progress'
  const showHotel = !f.staffMarkedLocal && (hotelAlreadyInPlay || !f.withinLocalRadius)
  if (showHotel) {
    const booked = f.housingStatus === 'booked'
    // Two things only the coordinator can do: put a whole club under one roof,
    // and say whether the coaches' rooms are comped (Bo, Oct 4 2026). "Ask" is
    // deliberate — eligibility is theirs to decide, and this letter must not
    // promise anyone a free room on their behalf. Dropped entirely when the org
    // has no coordinator on file rather than inventing one.
    const who = f.housingContactName.trim()
    const mail = f.housingContactEmail.trim()
    const note = mail
      ? `Want your families all in the same hotel? ${who ? `Email ${who} at ${mail}` : `Email our housing coordinator at ${mail}`} and they can book your club together — and ask whether your coaches qualify for comp rooms.`
      : ''
    items.push(booked
      ? { key: 'hotel', title: 'Send your families the hotel link', done: true,
          detail: `${f.hotelRooms} room${f.hotelRooms === 1 ? '' : 's'} logged${f.hotelName ? ` at ${f.hotelName}` : ''}. Thank you — pass it on to anyone still booking.`,
          ctaLabel: 'Hotel booking link', ctaUrl: links.hotelLink, note,
          altLabel: 'Send to my families', altUrl: `${links.shareLink}#hotel` }
      : { key: 'hotel', title: 'Send your families the hotel link', done: false,
          detail: f.hotelName
            ? `We have ${f.hotelName} down for you but no rooms logged yet. Your families book their own rooms — you just pass the link along, and the message is already written.`
            : 'Your families book their own rooms, so all you have to do is pass the link along. The message is already written — open it, make it sound like you, and send.',
          ctaLabel: 'Hotel booking link', ctaUrl: links.hotelLink, note,
          altLabel: 'Send to my families', altUrl: `${links.shareLink}#hotel` })
  }

  return items
}

export function openCount(items: ChecklistItem[]): number {
  return items.filter(i => !i.done).length
}

/** "3 things left", "1 thing left", "nothing left" — so one token covers the
 *  all-done case without the letter needing conditionals. */
export function whatsLeftPhrase(items: ChecklistItem[]): string {
  const n = openCount(items)
  return n === 0 ? 'nothing left' : `${n} thing${n === 1 ? '' : 's'} left`
}

export function checklistText(items: ChecklistItem[]): string {
  return items.map(it => {
    const head = `${it.done ? '[x]' : '[ ]'} ${it.title} — ${it.detail}`
    const withNote = it.note ? head + '\n    ' + it.note : head
    const withCta = it.ctaUrl ? withNote + '\n    ' + it.ctaLabel + ': ' + it.ctaUrl : withNote
    return it.altUrl ? withCta + '\n    ' + it.altLabel + ': ' + it.altUrl : withCta
  }).join('\n\n')
}

const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export function checklistHtml(items: ChecklistItem[]): string {
  // Tables and inline styles only -- Outlook drops most of everything else.
  // Buttons are navy, not the teal used elsewhere: white on teal-600 measures
  // about 3.7:1, under the 4.5:1 floor for text this size.
  const rows = items.map(it => {
    const mark = it.done
      ? `<div style="width:22px;height:22px;line-height:22px;border-radius:11px;background:#0d9488;color:#ffffff;text-align:center;font-size:13px;font-weight:bold">&#10003;</div>`
      : `<div style="width:18px;height:18px;border-radius:11px;border:2px solid #cbd5e1">&nbsp;</div>`
    const noteHtml = it.note
      ? '<div style="font-size:13px;line-height:1.55;color:#64748b;margin:6px 0 0">'
        + esc(it.note).replace(/([\w.+-]+@[\w-]+\.[\w.]+)/, '<a href="mailto:$1" style="color:#0f766e">$1</a>')
        + '</div>'
      : ''
    // A box the director can select and paste into a team email. The URL is
    // spelled out rather than hidden behind a button, because a forwarded
    // button is a link nobody can see.
    // The ready-written message sits beside the action it belongs to, outlined
    // rather than filled so the primary step still reads first.
    const alt = it.altUrl
      ? `<a href="${it.altUrl}" style="border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;padding:8px 17px;border-radius:6px;font-size:14px;font-weight:bold;display:inline-block">${esc(it.altLabel || 'Send to my families')}</a>`
      : ''
    const cta = (it.ctaUrl || it.altUrl)
      ? `<div style="margin:9px 0 2px">`
        + (it.ctaUrl ? `<a href="${it.ctaUrl}" style="background:#0b1f3a;color:#ffffff;text-decoration:none;padding:9px 18px;border-radius:6px;font-size:14px;font-weight:bold;display:inline-block;margin:0 8px 6px 0">${esc(it.ctaLabel || 'Open')}</a>` : '')
        + alt + `</div>`
      : ''
    return `<tr><td style="padding:11px 0;border-bottom:1px solid #e2e8f0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td width="32" valign="top" style="padding:1px 10px 0 0">${mark}</td>
<td valign="top">
<div style="font-size:15px;font-weight:bold;color:${it.done ? '#64748b' : '#0f172a'}">${esc(it.title)}</div>
<div style="font-size:14px;line-height:1.55;color:#475569;margin:3px 0 0">${esc(it.detail)}</div>
${noteHtml}
${cta}
</td></tr></table></td></tr>`
  }).join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:2px 0 18px">${rows}</table>`
}
