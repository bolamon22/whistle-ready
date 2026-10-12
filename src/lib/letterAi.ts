// The AI half of the Email clubs letter writer: the prompt and the clean-up of what
// comes back. Pure (no SDK, no db) so the prompt can be tested; the route
// /api/registrations/comm-ai makes the call.
//
// The rules exist for one reason: the same letter goes to every club, so a number
// the model makes up goes to every club too. It writes words; amounts, dates the
// org didn't give, team lists and links come from fill-in fields at send time.

import { aiFieldsFor, BLOCK_FIELDS, CTA_LABELS, FIELD_NOTES, fieldsIn, type LetterButton, type LetterTone } from '@/lib/customLetters'

export type LetterAiInput = {
  mode: 'write' | 'rewrite'
  /** What the letter should say (write), or how to change it (rewrite). */
  prompt: string
  tone?: LetterTone | ''
  /** 'payment', 'custom', or a built-in letter kind. */
  kind: string
  button?: LetterButton
  subject?: string
  body?: string
  orgName: string
  eventName: string
  eventDates: string
  eventPlace: string
  sport: string
}

const TONE_NOTES: Record<string, string> = {
  Friendly: 'warm and upbeat, still clear about anything the club has to do',
  Firm: 'direct and businesslike: say exactly what is needed and by when, polite with no padding',
  Urgent: 'time-sensitive: lead with what has to happen and why it matters now; mention consequences only if the request does',
}

const BUILTIN_CTA: Record<string, string> = {
  waiver: CTA_LABELS.waiver,
  schedule: CTA_LABELS.schedule,
  confirm: CTA_LABELS.confirm,
  account: 'Set up my account',
}

/** What the email adds below the letter by itself, so the model neither repeats
 *  it nor writes a link of its own. */
function belowTheLetter(kind: string, button?: LetterButton): string {
  if (kind === 'payment' || button === 'pay') {
    return 'Below the letter the email automatically adds the club’s invoice (invoiced, paid, balance due), a "Pay online" button and a line about bank-transfer and card fees. Point to it as "the button below" if useful; do not restate the fees or the invoice figures.'
  }
  if (kind === 'checklist') return 'Each item in {checklist} carries its own button. There is no other button.'
  const cta = kind === 'custom' ? (button && button !== 'none' ? CTA_LABELS[button as keyof typeof CTA_LABELS] : '') : BUILTIN_CTA[kind] || ''
  return cta
    ? `Below the letter the email automatically adds a "${cta}" button with the club’s own link. Point to it as "the button below" if useful.`
    : 'There is no button under this letter. Do not refer to one.'
}

export function letterAiPrompt(i: LetterAiInput): { system: string; user: string } {
  const fields = aiFieldsFor(i.kind, i.button)
  // In a rewrite, anything the letter already uses is allowed too, so a field a
  // built-in letter depends on ({checklist}, {accountLink}) is never "unknown".
  const keep = i.mode === 'rewrite' ? fieldsIn(`${i.subject || ''}\n${i.body || ''}`) : []
  const allowed = [...fields, ...keep.filter(f => !fields.includes(f))]
  const fieldLines = allowed.map(f => `{${f}} — ${FIELD_NOTES[f] || 'filled in per club'}${BLOCK_FIELDS.includes(f) ? ' (put it on a line by itself)' : ''}`).join('\n')
  const event = [
    `${i.eventName || 'the tournament'}`,
    i.sport ? `a youth ${i.sport.toLowerCase()} tournament` : 'a youth sports tournament',
    i.eventDates ? `on ${i.eventDates}` : '',
    i.eventPlace ? `in ${i.eventPlace}` : '',
  ].filter(Boolean).join(', ')
  const tone = i.tone && TONE_NOTES[i.tone] ? `\nTone: ${TONE_NOTES[i.tone]}.` : ''

  const system = `You write emails for ${i.orgName || 'a tournament organizer'}, the organizer of ${event}. Each email goes to the director of every registered club, who passes things on to their own coaches and families.

The same letter goes to every club, so it is a template. Wherever something differs from club to club, use a fill-in field, written exactly as shown, braces included:
${fieldLines}
Never use any other {field}, and never put braces around anything else. If the request asks for something that differs from club to club and none of these fields provide it, say it in general words instead (for example "anything still open on your registration") or leave it out.

${belowTheLetter(i.kind, i.button)} Never write a URL or a link of your own.

Rules:
- Facts: use only what the request says plus the fill-in fields. Never invent dates, deadlines, amounts, prices, fees, team counts, names, places, policies or promises. Keep any date, deadline or amount the request gives exactly as given.
- Plain text only: no Markdown, no asterisks, no headings. Short paragraphs separated by one blank line. For a list, put each item on its own line starting with "• ".
- Start with "Hi {contact}," on its own line. End with a short sign-off and "{org}" on its own line.
- American English. Written by a tournament organizer to a club director they work with every season. Usually under 180 words unless the request needs more.
- Subject: under 70 characters, specific to the email, no ALL CAPS, no emoji.${tone}
${i.mode === 'rewrite'
    ? `
You are revising an existing letter. Apply the instruction and change nothing it doesn't call for:
- Keep every fill-in field the letter already uses, written exactly as it is.
- Keep every fact, date, amount and promise the letter already makes, and add none.
- Keep its greeting, lists and sign-off unless the instruction is about them.
Return the complete revised subject and letter.`
    : ''}
Reply only by calling the "letter" tool. "name" is a 2–4 word name for this letter, the way you'd label it in a list of templates.`

  const user = i.mode === 'rewrite'
    ? `Instruction: ${i.prompt}\n\nCurrent subject:\n${i.subject || ''}\n\nCurrent letter:\n${i.body || ''}`
    : `What this email should say:\n${i.prompt}`
  return { system, user }
}

/** The tool the model must answer with, so the reply is always three fields. */
export const LETTER_TOOL = {
  name: 'letter',
  description: 'The finished email.',
  input_schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'A 2–4 word name for the letter, e.g. "Pools Are Posted".' },
      subject: { type: 'string', description: 'The subject line.' },
      body: { type: 'string', description: 'The letter, plain text, with fill-in fields in braces.' },
    },
    required: ['name', 'subject', 'body'],
  },
}

/** The correction sent back when a draft uses {fields} the merge can't fill. The
 *  model invents one when the request asks for something no field covers (Bo's
 *  coach letter, Oct 12 2026, came back with {coachesRegistered}), and one more
 *  turn with this note is usually enough for it to write around the gap. */
export function fixFieldsNote(unknown: string[]): string {
  const one = unknown.length === 1
  return `${unknown.map(f => `{${f}}`).join(', ')} ${one ? 'is not a fill-in field' : 'are not fill-in fields'}, so ${one ? 'it' : 'they'} would reach every club exactly as typed. Call the "letter" tool again with the same letter, using only the fill-in fields in your instructions. Where it needed something none of them provide, say it in general words instead or leave it out. Change nothing else.`
}

/** Undo the Markdown a model sometimes adds anyway and hold the caps the send
 *  path keeps (subject 200, body 4000). */
export function tidyLetter(x: { name?: unknown; subject?: unknown; body?: unknown }): { name: string; subject: string; body: string } {
  const plain = (s: string) => s
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[ \t]*[-*][ \t]+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return {
    name: plain(String(x.name ?? '')).replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').slice(0, 40),
    subject: plain(String(x.subject ?? '')).replace(/\s+/g, ' ').slice(0, 200),
    body: plain(String(x.body ?? '')).slice(0, 4000),
  }
}

/** Fields the original letter used that the revision dropped — a rewrite that
 *  loses {requirements} or {checklist} loses the block the letter is built on. */
export function droppedFields(before: string, after: string): string[] {
  const now = fieldsIn(after)
  return fieldsIn(before).filter(f => !now.includes(f))
}
