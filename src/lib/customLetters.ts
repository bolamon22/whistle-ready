// Letters an org writes itself in the Email clubs dialog (Bo, Oct 12 2026: "create
// a way to generate them inside of the email area, with an AI assist"). Saved next
// to the built-in ones, sent through the same runCommSend.
//
// Pure on purpose -- no '@/lib/db' -- because the registrations page imports it to
// check a letter before it goes out (a db import in a client graph is what 500'd
// the photographer pages on Oct 3).

import { PAY_LETTER_TOKENS } from '@/lib/payLetterText'

/** The button under the letter. It also decides how the letter is sent: Pay
 *  balance is a payment letter in every respect (skips clubs that have paid,
 *  carries the invoice table), the rest are plain club letters. */
export type LetterButton = 'none' | 'waiver' | 'coach' | 'schedule' | 'confirm' | 'pay'

export type CustomLetter = {
  id: string
  name: string
  button: LetterButton
  subject: string
  body: string
  updatedAt: string
}

export const LETTER_BUTTONS: ReadonlyArray<{ value: LetterButton; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'waiver', label: 'Player waiver' },
  { value: 'coach', label: 'Coach registration' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'confirm', label: 'Confirm teams' },
  { value: 'pay', label: 'Pay balance' },
]

/** Same words as the built-in letters' buttons (COMM_KINDS ctaLabel). */
export const CTA_LABELS: Record<'waiver' | 'coach' | 'schedule' | 'confirm', string> = {
  waiver: 'Open the player waiver',
  coach: 'Open coach registration',
  schedule: 'View the schedule',
  confirm: 'Review + confirm your teams',
}

export const MAX_CUSTOM_LETTERS = 40

export const asLetterButton = (v: unknown): LetterButton =>
  LETTER_BUTTONS.some(b => b.value === v) ? (v as LetterButton) : 'none'

/** Trimmed, capped and checked, or null when a letter is missing its name,
 *  subject or body. Caps match what the send path keeps (200 / 4000). */
export function cleanCustomLetter(x: unknown, now = new Date().toISOString()): CustomLetter | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const name = String(o.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  const subject = String(o.subject ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const body = String(o.body ?? '').replace(/\r\n/g, '\n').trim().slice(0, 4000)
  if (!name || !subject || !body) return null
  return {
    id: String(o.id ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40),
    name, button: asLetterButton(o.button), subject, body,
    updatedAt: String(o.updatedAt || now).slice(0, 40),
  }
}

// FILL-IN FIELDS. A letter goes out through one of two merges -- the payment
// letters' (mergePayLetter) or everyone else's (mergeCommLetter) -- and a {field}
// that merge doesn't know is sent literally, braces and all. unknownFields() is
// what stops that, so these two lists must match the merges' own lists.
export const COMM_MERGE_FIELDS = [
  'contact', 'club', 'event', 'teams', 'org', 'waiverLink', 'scheduleLink', 'teamsList', 'eventDates',
  'playerCounts', 'playerCount', 'coachCounts', 'confirmLink', 'accountLink', 'checklist', 'openCount', 'whatsLeft',
  'daysToEvent', 'payLink', 'shareLink', 'countdown',
] as const
export const PAY_MERGE_FIELDS = PAY_LETTER_TOKENS

/** Every {field} in the text, in order of first appearance. */
export function fieldsIn(text: string): string[] {
  const out: string[] = []
  for (const m of String(text || '').matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** {fields} the letter's merge won't fill — each one would reach the club as
 *  literal text. */
export function unknownFields(text: string, pay: boolean): string[] {
  const known: readonly string[] = pay ? PAY_MERGE_FIELDS : COMM_MERGE_FIELDS
  return fieldsIn(text).filter(f => !known.includes(f))
}

/** What each field turns into — told to the AI, and shown under the letter. */
export const FIELD_NOTES: Record<string, string> = {
  contact: "the club director's name (the club name when none is on file)",
  club: 'the club name',
  event: 'the event name',
  teams: 'how many teams the club has, e.g. "3 teams"',
  org: 'your organization name',
  eventDates: 'the event dates, e.g. "Oct 24–25"',
  countdown: 'how far off the event is, e.g. "twelve days away", "tomorrow"',
  teamsList: "the club's teams and divisions, one per line",
  playerCounts: "each of the club's teams with its registered players, one per line",
  playerCount: "the club's total registered players",
  coachCounts: "each of the club's teams with the coaches registered for it, by name, or \"no coach registered yet\", one per line",
  balance: 'what the club still owes, e.g. "$995.00"',
  eventTeams: 'how many teams are registered for the whole event, e.g. "112"',
  requirements: "the club's balance, player and coach registrations, team confirmation and account setup, each checked off if done",
  checklist: "the club's whole pre-event checklist, ticked where done",
  whatsLeft: 'how much of the checklist is still open, e.g. "2 things left"',
}

/** Fields that render as a block of their own lines, so they belong on a line by
 *  themselves rather than mid-sentence. */
export const BLOCK_FIELDS = ['teamsList', 'playerCounts', 'coachCounts', 'requirements', 'checklist']

/** The fields worth offering for a letter: no links (the button carries the link)
 *  and nothing that only one built-in letter fills in. */
export function aiFieldsFor(kind: string, button?: LetterButton): string[] {
  if (kind === 'payment' || button === 'pay') return ['contact', 'club', 'event', 'teams', 'org', 'balance', 'countdown', 'eventTeams', 'requirements']
  const base = ['contact', 'club', 'event', 'teams', 'org', 'eventDates', 'countdown', 'teamsList']
  if (kind === 'waiver' || kind === 'custom') base.push('playerCounts', 'playerCount')
  if (kind === 'custom') base.push('coachCounts')
  if (kind === 'checklist') base.push('checklist', 'whatsLeft')
  return base
}

/** {coachCounts}: each team with the coaches who registered for it, then anyone
 *  who registered for the club without picking one of its teams. Written to
 *  mirror {playerCounts}. One formatter for the send (lib/commSend) and the
 *  dialog's preview, from the same coachSignatures() names, so the two read the
 *  same. Bo, Oct 12 2026: a coach letter asked for exactly this and the AI had
 *  to invent a field for it. */
export function coachCountsText(
  clubName: string,
  teams: { teamName: string; division?: string | null; coaches: string[] }[],
  clubCoaches: string[],
): string {
  const lines = teams.map(t => {
    const n = t.coaches.length
    return `• ${t.teamName}${t.division ? ` — ${t.division}` : ''}: ${n === 0 ? 'no coach registered yet' : `${n} coach${n === 1 ? '' : 'es'} registered (${t.coaches.join(', ')})`}`
  })
  const onTeams = new Set(teams.flatMap(t => t.coaches))
  const loose = clubCoaches.filter(c => !onTeams.has(c))
  if (loose.length) lines.push(`• Not matched to a team: ${loose.join(', ')}`)
  const total = new Set([...onTeams, ...clubCoaches]).size
  lines.push(`Total for ${clubName}: ${total} coach${total === 1 ? '' : 'es'} registered`)
  return lines.join('\n')
}

// REUSE AT OTHER EVENTS. Saved letters are kept per org, not per event, so every
// one shows up in Email clubs at every event (Bo, Oct 12 2026: "save the letters
// we create as templates that I can reuse for future events"). A letter that
// spells out this event's name or dates by hand would say them at the next event
// too; {event} and {eventDates} never do. These find the hand-typed ones and
// swap them in.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ANY_MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?'
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The event's name as a whole phrase (no lookbehind: older iPhones can't run
 *  it), and its first day as people write it: "Oct 24", "October 24th",
 *  "Oct. 24–25, 2026", "October 24 to 25". */
function eventPatterns(eventName: string, startDate: string): { name: RegExp | null; dates: RegExp | null } {
  const n = String(eventName || '').trim()
  const name = n.length >= 3 ? new RegExp(`(^|[^A-Za-z0-9])${escRe(n)}(?![A-Za-z0-9])`, 'gi') : null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(startDate || ''))
  const mi = m ? Number(m[2]) - 1 : -1, day = m ? Number(m[3]) : 0
  if (!m || mi < 0 || mi > 11 || day < 1 || day > 31) return { name, dates: null }
  const full = MONTHS[mi]
  const month = `(?:${full}|${full.slice(0, 3)}${mi === 8 ? '|Sept' : ''})\\.?`
  const ord = '(?:st|nd|rd|th)?'
  const dates = new RegExp(`\\b${month}\\s+${day}${ord}\\b(?:\\s*(?:-|–|—|to|through|and|&)\\s*(?:${ANY_MONTH}\\s+)?\\d{1,2}${ord}\\b)?(?:,?\\s+${m[1]})?`, 'gi')
  return { name, dates }
}

/** Whether the letter spells out this event's name or dates by hand. Dates only
 *  count in club letters: the payment letters' merge has no {eventDates}. */
export function eventLiterals(text: string, eventName: string, startDate: string, pay: boolean): { name: boolean; dates: boolean } {
  const p = eventPatterns(eventName, startDate)
  const t = String(text || '')
  return { name: !!p.name && p.name.test(t), dates: !pay && !!p.dates && p.dates.test(t) }
}

/** The same text with this event's name and dates swapped for {event} and
 *  {eventDates}. */
export function withEventFields(text: string, eventName: string, startDate: string, pay: boolean): string {
  const p = eventPatterns(eventName, startDate)
  let out = String(text || '')
  if (p.name) out = out.replace(p.name, '$1{event}')
  if (!pay && p.dates) out = out.replace(p.dates, '{eventDates}')
  return out
}

/** {eventDates} as the send writes it (fmtDates in lib/commSend, on a UTC
 *  server): "Oct 24–Oct 25", or the one day. Read from the date's own digits, so
 *  a browser west of UTC doesn't preview the day before. */
export function eventDatesText(start?: string | null, end?: string | null): string {
  const f = (d?: string | null) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''))
    const mon = m ? MONTHS[Number(m[2]) - 1] : ''
    return m && mon ? `${mon.slice(0, 3)} ${Number(m[3])}` : ''
  }
  const s = f(start), e = f(end)
  return s && e && s !== e ? `${s}–${e}` : s || e
}

export const LETTER_TONES = ['Friendly', 'Firm', 'Urgent'] as const
export type LetterTone = (typeof LETTER_TONES)[number]

/** The one-click rewrites under every letter. */
export const LETTER_REWRITES: ReadonlyArray<{ label: string; instruction: string }> = [
  { label: 'More urgent', instruction: 'Make it more urgent and direct: lead with what the club has to do and why it matters now.' },
  { label: 'Friendlier', instruction: 'Make it warmer and friendlier without losing anything the club has to do.' },
  { label: 'Shorter', instruction: 'Make it noticeably shorter. Cut repetition and filler, keep every action and fact.' },
  { label: 'Fix grammar', instruction: 'Fix spelling, grammar and punctuation only. Change nothing else.' },
]
