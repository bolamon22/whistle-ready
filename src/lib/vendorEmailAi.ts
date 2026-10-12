// The AI half of the vendor email dialog (components/contacts/VendorEmailDialog).
// Bo, Oct 12 2026: "Can we also [add] a dictation and a AI assist to help write
// these letters that are in the tasks?" -- he had to tell a company we couldn't
// take them as a vendor because of our food vendor's contract, and none of the
// ready-made emails covers that.
//
// Pure (no SDK, no db) so the prompt can be tested; /api/contacts/email-ai makes
// the call. Unlike the club letters this is one email to one person, written out
// in full, so there are no fill-in fields. The rule that matters is the same:
// it writes the words and never makes up a price, date, quantity, term or promise.

import { CONTACT_CATEGORIES } from '@/lib/contactTypes'
import { greeting } from '@/lib/contactSend'
import type { LetterTone } from '@/lib/customLetters'

export type VendorAiInput = {
  mode: 'write' | 'rewrite'
  /** What the email should say (write), or how to change it (rewrite). */
  prompt: string
  tone?: LetterTone | ''
  subject?: string
  body?: string
  contactName: string
  company: string
  /** ContactCategory key ('food', 'rentals', ...). */
  category: string
  eventName: string
  eventDates: string
  place: string
  /** The signed-in sender. They sign with their first name, like the ready-made emails. */
  signer: string
  orgName: string
}

const TONE_NOTES: Record<string, string> = {
  Friendly: 'warm and personable, still clear about anything you need from them',
  Firm: 'direct and businesslike: say exactly what is needed and by when, polite with no padding',
  Urgent: 'time-sensitive: lead with what has to happen and why it matters now',
}

/** A first name to sign with, or '' when all we have is an email address. */
export function signerFirst(signer: string): string {
  const s = String(signer || '').trim()
  if (!s || s.includes('@')) return ''
  return s.split(/\s+/)[0]
}

export function vendorEmailPrompt(i: VendorAiInput): { system: string; user: string } {
  const hi = greeting([{ name: i.contactName }])
  const me = signerFirst(i.signer)
  const cat = CONTACT_CATEGORIES.find(c => c.key === i.category)?.label || ''
  const who = [i.contactName.trim(), i.company.trim() ? `at ${i.company.trim()}` : ''].filter(Boolean).join(' ')
  const about = [i.eventName.trim(), i.eventDates ? `(${i.eventDates})` : '', i.place.trim() ? `in ${i.place.trim()}` : ''].filter(Boolean).join(' ')
  const tone = i.tone && TONE_NOTES[i.tone] ? `\nTone: ${TONE_NOTES[i.tone]}.` : ''

  const system = `You write emails for ${me || 'a tournament organizer'}${i.orgName ? ` of ${i.orgName}` : ''}, who runs youth sports tournaments. This email goes to ${who || 'a vendor'}${cat ? ` (${cat.toLowerCase()})` : ''}${about ? `, about ${about}` : ''}.

Rules:
- Facts: use only what the request says and the details above. Never invent prices, quantities, dates, deadlines, contract terms, policies, names or promises. Keep any date, amount or name the request gives exactly as given.
- Anything in square brackets, like [teams], is a blank the sender fills in later: keep it exactly as it is.
- Plain text only: no Markdown, no asterisks, no headings. Short paragraphs separated by one blank line. For a list, put each item on its own line starting with "- ".
- Start with "${hi}" on its own line. End with a short sign-off${me ? ` and "${me}" on its own line` : ''}.
- American English. Courteous and businesslike, the way an event organizer writes to a vendor or partner they deal with every season. Usually under 150 words unless the request needs more.
- Subject: under 70 characters, specific to the email, no ALL CAPS, no emoji.${tone}
${i.mode === 'rewrite'
    ? `
You are revising an existing email. Apply the instruction and change nothing it doesn't call for:
- Keep every fact, date, amount, item and promise it already has, and add none.
- Keep its greeting, lists and sign-off unless the instruction is about them.
Return the complete revised subject and email.`
    : ''}
Reply only by calling the "email" tool.`

  const user = i.mode === 'rewrite'
    ? `Instruction: ${i.prompt}\n\nCurrent subject:\n${i.subject || ''}\n\nCurrent email:\n${i.body || ''}`
    : `What this email should say:\n${i.prompt}`
  return { system, user }
}

/** The tool the model must answer with, so the reply is always a subject and a body. */
export const EMAIL_TOOL = {
  name: 'email',
  description: 'The finished email.',
  input_schema: {
    type: 'object' as const,
    properties: {
      subject: { type: 'string', description: 'The subject line.' },
      body: { type: 'string', description: 'The email, plain text.' },
    },
    required: ['subject', 'body'],
  },
}

/** Undo any Markdown and hold the caps the send route keeps (subject 200,
 *  message 8000). Lists stay "- " lists, like the ready-made emails. */
export function tidyEmail(x: { subject?: unknown; body?: unknown }): { subject: string; body: string } {
  const plain = (s: string) => s
    .replace(/\r\n/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[ \t]*[*•][ \t]+/gm, '- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return {
    subject: plain(String(x.subject ?? '')).replace(/\s+/g, ' ').slice(0, 200),
    body: plain(String(x.body ?? '')).slice(0, 8000),
  }
}
