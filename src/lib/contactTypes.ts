// Event contacts: the vocabulary the contact pages share.
//
// Pure -- no database import -- so the directory, the tournament Contacts tab
// and the task board can use it in the browser. The server side lives in
// lib/contacts.ts.
//
// Bo, Oct 5 2026: "a contact list page so I always have each tournament's
// setup contacts: city, Parks & Rec, county, sports commission, food vendors,
// golf cart and tent rentals ... anyone I get things from or provide
// information to." Each contact says what we get from them and what they need
// from us, and is tagged with the events it serves (or every event).

export type ContactCategory =
  | 'venue' | 'county' | 'commission' | 'safety' | 'rentals' | 'food' | 'officials' | 'insurance' | 'housing' | 'other'

export const CONTACT_CATEGORIES: { key: ContactCategory; label: string; dot: string }[] = [
  { key: 'venue', label: 'Venue & city', dot: 'bg-teal-500' },
  { key: 'county', label: 'County', dot: 'bg-emerald-500' },
  { key: 'commission', label: 'Sports commission', dot: 'bg-indigo-500' },
  { key: 'safety', label: 'Safety & medical', dot: 'bg-red-500' },
  { key: 'rentals', label: 'Rentals', dot: 'bg-amber-500' },
  { key: 'food', label: 'Food & vendors', dot: 'bg-orange-500' },
  { key: 'officials', label: 'Officials', dot: 'bg-violet-500' },
  { key: 'insurance', label: 'Insurance', dot: 'bg-slate-500' },
  { key: 'housing', label: 'Housing', dot: 'bg-sky-500' },
  { key: 'other', label: 'Other', dot: 'bg-slate-300' },
]

export function isContactCategory(v: unknown): v is ContactCategory {
  return CONTACT_CATEGORIES.some(c => c.key === v)
}
export function contactCategory(key: string) {
  return CONTACT_CATEGORIES.find(c => c.key === key) || CONTACT_CATEGORIES[CONTACT_CATEGORIES.length - 1]
}

/** Who the ball is with: '' nobody, 'us' we owe them a reply, 'them' we're waiting on them. */
export type Waiting = '' | 'us' | 'them'
export const isWaiting = (v: unknown): v is Waiting => v === '' || v === 'us' || v === 'them'

export type ContactView = {
  id: string
  name: string
  /** Their title ("Athletic Programs Manager"). */
  role: string
  /** Their organization ("Village of Wellington"). */
  company: string
  category: string
  phone: string
  email: string
  address: string
  /** What we get from them. */
  gives: string
  /** What they need from us. */
  needs: string
  notes: string
  /** Tournament ids this contact serves. */
  events: string[]
  /** Serves every event (insurance, housing, referee assignors). */
  everyEvent: boolean
  waiting: Waiting
  /** YYYY-MM-DD the waiting started, or ''. */
  waitingSince: string
  /** YYYY-MM-DD of the last email or call, or ''. */
  lastContact: string
}

/** An open task that depends on this contact. */
export type ContactTask = { id: string; title: string; dueDate: string; tournamentId: string }

export type ContactRow = ContactView & { openTasks: ContactTask[] }

/** Waiting on them this many days or more counts as "no reply". */
export const NO_REPLY_DAYS = 14

export function initials(name: string): string {
  return name.split(/[\s,]+/).filter(w => /[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

/** A tel: link from whatever was typed ("561-791-4741 x230" dials the main number). */
export function telHref(phone: string): string {
  const main = phone.split(/x|ext|,|;|\//i)[0]
  const digits = main.replace(/[^\d+]/g, '')
  return digits.length >= 7 ? `tel:${digits}` : ''
}

/** Whole days from a to b (YYYY-MM-DD), or null. */
export function daysFrom(a: string, b: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)
}

export function isNoReply(c: Pick<ContactView, 'waiting' | 'waitingSince'>, today: string): boolean {
  if (c.waiting !== 'them') return false
  const d = daysFrom(c.waitingSince, today)
  return d !== null && d >= NO_REPLY_DAYS
}

/** "Waiting on them since Sep 18" / "We owe a reply" -- the flag on a contact, or ''. */
export function waitingLabel(c: Pick<ContactView, 'waiting' | 'waitingSince'>, shortDate: (ymd: string) => string): string {
  if (c.waiting === 'us') return 'We owe a reply'
  if (c.waiting === 'them') return c.waitingSince ? `No reply since ${shortDate(c.waitingSince)}` : 'Waiting on them'
  return ''
}

/** Search text for one contact. */
export function contactHaystack(c: ContactView): string {
  return [c.name, c.role, c.company, c.phone, c.email, c.gives, c.needs, c.notes].join(' ').toLowerCase()
}
