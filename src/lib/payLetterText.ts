// Pure half of the payment letter: the default copy, the token merge, and the
// countdown phrasing. No prisma import, so the registrations page can render the
// same preview the send path will produce (same split as inviteLetterText /
// inviteLetter and poolNames / pools).

/** Small numbers read better spelled out in a letter than as digits. */
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
const spell = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n))

/**
 * A complete phrase, not a bare number, so "{event} is {countdown}" reads right in
 * every case -- "three weeks away", "nine days away", "tomorrow", "under way".
 * A letter saved once and reused for years cannot carry a hand-typed "three weeks".
 *
 * startDate is the Tournament.startDate string (YYYY-MM-DD). Anything unparseable
 * falls back to "coming up", which still makes a sentence.
 */
export function countdownPhrase(startDate?: string | null, today = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(startDate || '').trim())
  if (!m) return 'coming up'
  const [yy, mm, dd] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const start = new Date(yy, mm - 1, dd)
  // JS rolls a bad date over instead of rejecting it -- "2026-13-99" becomes April
  // 2027 and the letter would cheerfully say "about 27 weeks away". Round-trip it.
  if (start.getFullYear() !== yy || start.getMonth() !== mm - 1 || start.getDate() !== dd) return 'coming up'
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const days = Math.round((start.getTime() - t0.getTime()) / 86400000)
  if (days < 0) return 'under way'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 14) return `${spell(days)} days away`
  // Past about ten weeks, a week count stops being a useful thing to say.
  if (days > 70) return 'coming up'
  return `about ${spell(Math.round(days / 7))} weeks away`
}

export const PAY_LETTER_TOKENS = ['contact', 'club', 'event', 'balance', 'teams', 'org', 'countdown', 'eventTeams'] as const

export function mergePayLetter(text: string, vals: Record<string, string>): string {
  return text.replace(/\{(contact|club|event|balance|teams|org|countdown|eventTeams)\}/g, (_m, k: string) => vals[k] ?? '')
}

// Org-editable payment-reminder letter (Bo, Sep 9: "the current letter isn't great
// for reminding teams they need to pay"). The invoice table, Pay button, and fee
// note are FIXED chrome below this -- the editable part is the human note on top.
//
// Oct 1: rewritten around the waiting list. The event fills up, so the lever is not
// "you are late" (they are not) but "payment is what confirms the spot, and other
// clubs are asking for it". {countdown} and {eventTeams} are computed at send time
// so this copy can sit here for years without going stale.
export const PAY_LETTER_DEFAULTS: { subject: string; body: string } = {
  subject: 'Payment required to confirm your spots — {event}',
  body: `Hi {contact},

{event} is {countdown}! We're at {eventTeams} teams this year with an active waiting list, and clubs are asking us weekly about open spots.

Our records currently show an unpaid balance of {balance} for {club} ({teams}).

Please take care of this balance today. Full payment prior to the event is required to officially confirm your spots — we do not accept payments at the tournament site. As we finalize division schedules, unconfirmed spots will be reassigned to teams on the waiting list.

You can complete payment online in about a minute using the button below:

• Bank transfer (ACH) — no fee
• Credit card — 3% processing fee

If a check is already in the mail or anything looks off on your account, please reply to this email right away so we can hold your spot while we clear things up.

Thanks for being part of the event — we can't wait to see your teams out on the field!

— {org}`,
}
