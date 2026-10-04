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
  teamCount: number
  teamsConfirmed: boolean
  confirmedOn: string          // "September 28", or '' when unknown
  hasLogin: boolean
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
  hotelName: string
  hotelRooms: number
}

export type ChecklistLinks = {
  confirmLink: string
  accountLink: string
  waiverLink: string
  coachLink: string
  payLink: string
  /** The org's housing bookingUrl — where families actually book. */
  hotelLink: string
}

export type ChecklistItem = {
  key: 'teams' | 'login' | 'waivers' | 'coaches' | 'balance' | 'hotel'
  title: string
  done: boolean
  detail: string
  ctaLabel?: string
  ctaUrl?: string
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

  items.push(f.hasLogin
    ? { key: 'login', title: 'Club portal login', done: true,
        detail: f.loginEmail ? `${f.loginEmail} can sign in.` : 'Your login is set up.' }
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
        ctaLabel: 'Share the waiver link', ctaUrl: links.waiverLink })

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
        ctaLabel: 'Coach registration', ctaUrl: links.coachLink })

  // A $0 invoice has nothing to chase, so the row does not appear at all.
  if (f.invoiced > 0) {
    items.push(f.balance <= 0
      ? { key: 'balance', title: 'Balance paid', done: true, detail: `Paid in full · ${usd(f.invoiced)}. Thank you.` }
      : { key: 'balance', title: 'Balance due', done: false,
          detail: `${usd(f.balance)} of ${usd(f.invoiced)} still outstanding.`,
          ctaLabel: 'Pay the balance', ctaUrl: links.payLink })
  }

  // Local clubs are not asked about hotels at all. Everyone else gets the line,
  // because the job is forwarding the booking link to families -- families book
  // their own rooms, the club does not book a block (Bo, Oct 4 2026). The only
  // evidence we have that it happened is rooms logged on the housing board, so
  // that is what ticks it.
  if (f.housingStatus !== 'local') {
    const booked = f.housingStatus === 'booked'
    items.push(booked
      ? { key: 'hotel', title: 'Hotel rooms for your families', done: true,
          detail: `${f.hotelRooms} room${f.hotelRooms === 1 ? '' : 's'} logged${f.hotelName ? ` at ${f.hotelName}` : ''}. Thank you \u2014 send the link on to anyone still booking.`,
          ctaLabel: 'Hotel booking link', ctaUrl: links.hotelLink }
      : { key: 'hotel', title: 'Hotel rooms for your families', done: false,
          detail: f.hotelName
            ? `We have ${f.hotelName} down for you but no rooms logged yet. Please pass the booking link below to your families so their rooms land in our block.`
            : 'Please pass the booking link below to your families. Rooms booked in our block are what let us keep coming back to this venue, so it helps even when families book on their own.',
          ctaLabel: 'Hotel booking link', ctaUrl: links.hotelLink })
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
    return it.ctaUrl ? `${head}\n    ${it.ctaLabel}: ${it.ctaUrl}` : head
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
    const cta = it.ctaUrl
      ? `<div style="margin:9px 0 2px"><a href="${it.ctaUrl}" style="background:#0b1f3a;color:#ffffff;text-decoration:none;padding:9px 18px;border-radius:6px;font-size:14px;font-weight:bold;display:inline-block">${esc(it.ctaLabel || 'Open')}</a></div>`
      : ''
    return `<tr><td style="padding:11px 0;border-bottom:1px solid #e2e8f0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td width="32" valign="top" style="padding:1px 10px 0 0">${mark}</td>
<td valign="top">
<div style="font-size:15px;font-weight:bold;color:${it.done ? '#64748b' : '#0f172a'}">${esc(it.title)}</div>
<div style="font-size:14px;line-height:1.55;color:#475569;margin:3px 0 0">${esc(it.detail)}</div>
${cta}
</td></tr></table></td></tr>`
  }).join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:2px 0 18px">${rows}</table>`
}
