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

export const PAY_LETTER_TOKENS = ['contact', 'club', 'event', 'balance', 'teams', 'org', 'countdown', 'eventTeams', 'requirements'] as const

export function mergePayLetter(text: string, vals: Record<string, string>): string {
  return text.replace(/\{(contact|club|event|balance|teams|org|countdown|eventTeams|requirements)\}/g, (_m, k: string) => vals[k] ?? '')
}

// TWO payment letters, because a tournament that is full and a tournament that is
// simply owed money are different conversations (Bo, Oct 1: "we're not always going
// to have a waiting list, we're just going to be asking them to pay"). Both are
// org-editable and stored separately; the invoice table, Pay button and fee note are
// FIXED chrome below whichever one is sent.
//
// {countdown} and {eventTeams} are computed at send time so either letter can sit
// here for years without a hand-typed date or team count going stale.
//
// A third, 'urgent' (Bo, Oct 12 2026), is the last push before the event: the club
// may lose its spot to the waiting list, and paying is only one of the four things
// that keep it. {requirements} merges to THIS club's balance, player and coach
// registrations and team confirmation, checked off where already done (built in
// lib/checklistLetter by the same rules as the pre-event checklist).

export type PayLetterVariant = 'reminder' | 'final' | 'urgent'
export const PAY_LETTER_VARIANTS: readonly PayLetterVariant[] = ['reminder', 'final', 'urgent']

/** The everyday ask. No waiting list, no reassignment, no deadline. */
export const PAY_LETTER_DEFAULTS: { subject: string; body: string } = {
  subject: 'Balance due for {event} — {club}',
  body: `Hi {contact},

A quick reminder that {club} ({teams}) still shows a balance of {balance} for {event}, which is {countdown}.

You can take care of it online in about a minute using the button below:

• Bank transfer (ACH) — no fee
• Credit card — 3% processing fee

Payment before the event is what confirms your spots, and we aren't able to take payments at the tournament site. If a check is already on the way or anything looks off on your account, just reply to this email and we'll square it up.

Thanks for being part of the event — we can't wait to see your teams out on the field!

— {org}`,
}

/** The escalation, for a full event with clubs waiting on a spot. */
export const PAY_LETTER_FINAL_DEFAULTS: { subject: string; body: string } = {
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

/** The last push, for a full event: Bo's own letter (Oct 12 2026), with the
 *  requirement list filled in per club. */
export const PAY_LETTER_URGENT_DEFAULTS: { subject: string; body: string } = {
  subject: "Action required: secure {club}'s spot at {event}",
  body: `Hi {contact},

{event} is just {countdown}, and {club} ({teams}) currently shows an outstanding balance of {balance}.

We have hit a full house with {eventTeams} teams this year and are operating an active waiting list, with clubs reaching out daily for open spots. Payment and completed account setup are the only ways to fully secure your team's spot in the schedule.

To ensure your team is confirmed, please complete the following basic tournament requirements immediately:

{requirements}

Please note: if we do not receive a response, see account activity, or receive completed registrations, we may be forced to remove your team from the list so we can release the spot to an eager waitlisted team.

• Unable to attend? If for any reason your team can no longer participate, please reply to this email ASAP so we can offer the opening to a team on the waitlist.

• Ready to pay? You can settle your balance online in about a minute using the button below. Bank transfers (ACH) have zero fees; credit card payments carry a 3% fee.

• Check on the way? If a check has already been mailed or something looks incorrect, reply directly to this email right away so we can hold your spot while we get everything squared away.

Thank you for being part of the event — we look forward to seeing your teams on the field!

Best regards,
{org}
{event}`,
}

export const payLetterDefaults = (variant?: PayLetterVariant) =>
  variant === 'final' ? PAY_LETTER_FINAL_DEFAULTS : variant === 'urgent' ? PAY_LETTER_URGENT_DEFAULTS : PAY_LETTER_DEFAULTS

/** Anything that isn't a known letter reads as the everyday one. */
export const asPayLetterVariant = (v: unknown): PayLetterVariant =>
  PAY_LETTER_VARIANTS.includes(String(v || '') as PayLetterVariant) ? (String(v) as PayLetterVariant) : 'reminder'

/** AppSetting key per variant. 'reminder' keeps the original key so nothing an org
 *  already saved is orphaned by the split. */
export const payLetterKey = (orgId: string, variant?: PayLetterVariant) =>
  `${variant === 'final' ? 'payLetterFinal' : variant === 'urgent' ? 'payLetterUrgent' : 'payLetter'}:${orgId}`
