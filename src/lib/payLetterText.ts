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
  subject: 'Payment secures your spots for {event} — {club}',
  body: `Hi {contact} — {event} is {countdown}, and {club} ({teams}) still shows a balance of {balance}.

We're at {eventTeams} teams this year and running a waiting list, with clubs asking us weekly about openings. Payment is what fully secures your spots — until the balance is cleared we can't confirm them, and as we finalize the field those spots are what we'd be offering to the teams waiting.

You can take care of it online in about a minute with the button below. Bank transfer (ACH) has no fee; card runs 3%.

If a check is already on the way, or anything here looks off, just reply to this email — we'll hold your spots and square it up.

Thanks for being part of the event. We can't wait to see your teams out there.`,
}
