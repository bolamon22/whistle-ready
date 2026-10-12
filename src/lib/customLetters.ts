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

export const LETTER_TONES = ['Friendly', 'Firm', 'Urgent'] as const
export type LetterTone = (typeof LETTER_TONES)[number]

/** The one-click rewrites under every letter. */
export const LETTER_REWRITES: ReadonlyArray<{ label: string; instruction: string }> = [
  { label: 'More urgent', instruction: 'Make it more urgent and direct: lead with what the club has to do and why it matters now.' },
  { label: 'Friendlier', instruction: 'Make it warmer and friendlier without losing anything the club has to do.' },
  { label: 'Shorter', instruction: 'Make it noticeably shorter. Cut repetition and filler, keep every action and fact.' },
  { label: 'Fix grammar', instruction: 'Fix spelling, grammar and punctuation only. Change nothing else.' },
]
