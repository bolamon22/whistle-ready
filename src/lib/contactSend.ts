// Sending a document to an event contact: the ready-made emails.
//
// Pure -- no database import -- so the Send dialog can draft the message in the
// browser and the server can rebuild nothing it doesn't need to.
//
// Bo, Oct 5 2026: "I received ... an email with the Palm Beach County
// Certificate of Insurance. Are we able to create a way for me to send it
// directly from the system to the correct person ... So the email is basically
// set up. All I have to do is hit send or send it to my Gmail and then send it."

import type { ContactView } from '@/lib/contactTypes'
import type { TaskTournament } from '@/lib/taskTemplate'

export type DocKind = 'coi' | 'w9' | 'other'

export const DOC_KINDS: { key: DocKind; label: string; docCategory: string; words: RegExp }[] = [
  { key: 'coi', label: 'Certificate of insurance', docCategory: 'Insurance', words: /\b(coi|insurance|certificate)\b/i },
  { key: 'w9', label: 'W-9', docCategory: 'Financial', words: /\bw-?9\b/i },
  { key: 'other', label: 'Other document', docCategory: 'Other', words: /$^/ },
]
export const docKind = (k: string) => DOC_KINDS.find(d => d.key === k) || DOC_KINDS[2]

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 24–25, 2026", "Oct 31 – Nov 1, 2026", "Oct 24, 2026", or ''. */
export function eventDates(t: Pick<TaskTournament, 'firstDay' | 'lastDay'>): string {
  const re = /^(\d{4})-(\d{2})-(\d{2})$/
  const a = re.exec(t.firstDay || ''), b = re.exec(t.lastDay || t.firstDay || '')
  if (!a) return ''
  const am = MON[+a[2] - 1], ad = +a[3]
  if (!b || b[0] === a[0]) return `${am} ${ad}, ${a[1]}`
  const bm = MON[+b[2] - 1], bd = +b[3]
  if (a[1] !== b[1]) return `${am} ${ad}, ${a[1]} – ${bm} ${bd}, ${b[1]}`
  return am === bm ? `${am} ${ad}–${bd}, ${a[1]}` : `${am} ${ad} – ${bm} ${bd}, ${a[1]}`
}

// Contact "names" that are a desk or a company, not a person to greet.
const NOT_A_PERSON = /\b(desk|service|services|center|centre|carts?|rental|rentals|media|haul|golf|customer|parks|county|certificate|accounting|office|team|officials)\b/i

/** The greeting: one person's first name, "all" for several, nothing when unknown. */
export function greeting(people: Pick<ContactView, 'name'>[]): string {
  if (people.length > 1) return 'Hi all,'
  const n = (people[0]?.name || '').replace(/,.*$/, '').trim()
  const words = n.split(/\s+/).filter(Boolean)
  if (!words.length || words.length > 3 || NOT_A_PERSON.test(n)) return 'Hi,'
  return `Hi ${words[0]},`
}

/** The ready-made subject and message. The sender signs with their first name. */
export function draftEmail(o: {
  kind: DocKind
  event: Pick<TaskTournament, 'name' | 'firstDay' | 'lastDay' | 'location'> | null
  people: Pick<ContactView, 'name'>[]
  fileName: string
  signer: string
}): { subject: string; message: string } {
  const ev = o.event
  const when = ev ? eventDates(ev) : ''
  const name = ev?.name.trim() || ''
  const forEvent = name ? ` for ${name}${when ? ` (${when}${ev?.location ? `, ${ev.location}` : ''})` : ''}` : ''
  const sign = `Thanks,\n${(o.signer || '').trim().split(/\s+/)[0] || ''}`.trim()
  const hi = greeting(o.people)
  if (o.kind === 'coi') {
    return {
      subject: `Certificate of insurance${name ? ` – ${name}` : ''}${when ? `, ${when}` : ''}`,
      message: `${hi}\n\nAttached is the certificate of insurance${forEvent}.\n\nLet me know if you need anything else.\n\n${sign}`,
    }
  }
  if (o.kind === 'w9') {
    return {
      subject: `W-9 – Sunshine Events Group${name ? ` (${name})` : ''}`,
      message: `${hi}\n\nAttached is our W-9${name ? ` for ${name}` : ''}.\n\n${sign}`,
    }
  }
  const doc = o.fileName.replace(/\.[a-z0-9]+$/i, '') || 'the document'
  return {
    subject: `${name ? `${name}: ` : ''}${doc}`,
    message: `${hi}\n\nAttached is ${doc}${forEvent}.\n\n${sign}`,
  }
}

/** Contacts this kind of document usually goes to: their gives/needs mention it. */
export function wantsDoc(c: Pick<ContactView, 'needs' | 'gives' | 'category'>, kind: DocKind): boolean {
  if (kind === 'other') return false
  if (kind === 'coi' && c.category === 'insurance') return false   // the insurer sends it, they don't need it
  return docKind(kind).words.test(c.needs)
}

export const isEmail = (s: string) => /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(s.trim())

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/** Where a new certificate of insurance is requested (USA Lacrosse's form; WTW emails it back). Bo, Oct 5 2026. */
export const COI_REQUEST_URL = 'https://www.usalacrosse.com/xtc2627'
