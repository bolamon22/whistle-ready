// What a parent can change on their own child's player waiver from their parent
// account (Bo, Oct 9 2026: parents set up an account at the end of the waiver
// "that way they don't have to go back later when they want to make edits").
//
// Pure: no database import, so the waiver form and the parent page can use it in
// the browser.
//
// Left out on purpose, staff only (Player waivers page):
//   - player name, date of birth, gender: who signed up, and the age and gender
//     rules a division is built on;
//   - club and team: placement belongs to the club director and the office;
//   - parent email: it is the login, and the address the office writes to;
//   - home town: what the grant reports count;
//   - signature and agreement: never edited after signing.
// The photo and the QR link live on the player card page (/pass/<token>).
import { USA_LACROSSE_LABEL } from '@/lib/usaLacrosse'

export type ParentField = {
  key: string
  label: string
  type?: 'text' | 'email' | 'tel' | 'select'
  options?: readonly string[]
  /** The waiver form requires it, so it can be changed but not emptied. */
  required?: boolean
  /** Shown only when another field has this value (where they're staying, only when staying over). */
  when?: { key: string; is: string }
  placeholder?: string
}

// Same lists as the waiver form (PlayerRegForm POSITIONS and GRADES).
export const PLAYER_POSITIONS = ['Attack', 'Midfield', 'Defense', 'Goalie', 'FOGO', 'LSM', 'Multiple / not sure'] as const
export const PLAYER_GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const

export const PARENT_FIELD_GROUPS: { title: string; fields: ParentField[] }[] = [
  {
    title: 'Player',
    fields: [
      { key: 'jerseyNumber', label: 'Jersey number', placeholder: 'e.g. 12' },
      { key: 'position', label: 'Position', type: 'select', options: PLAYER_POSITIONS },
      { key: 'grade', label: 'Grade', type: 'select', options: PLAYER_GRADES, required: true },
      { key: 'usLacrosse', label: USA_LACROSSE_LABEL, required: true },
      { key: 'playerEmail', label: 'Player email', type: 'email' },
    ],
  },
  {
    title: 'Parents',
    fields: [
      { key: 'parentName', label: 'Parent name', required: true },
      { key: 'parentPhone', label: 'Parent mobile phone', type: 'tel', required: true },
      { key: 'parent2Name', label: 'Parent 2 name' },
      { key: 'parent2Email', label: 'Parent 2 email', type: 'email' },
      { key: 'parent2Phone', label: 'Parent 2 mobile phone', type: 'tel' },
    ],
  },
  {
    title: 'Emergency contact',
    fields: [
      { key: 'emergencyName', label: 'Emergency contact name', required: true },
      { key: 'emergencyPhone', label: 'Emergency contact phone', type: 'tel', required: true },
    ],
  },
  {
    title: 'Hotel',
    fields: [
      { key: 'hotel', label: 'Staying at a hotel or vacation rental?', type: 'select', options: ['Yes', 'No', 'Maybe'], required: true },
      { key: 'hotelName', label: 'Where are you staying?', when: { key: 'hotel', is: 'Yes' }, placeholder: 'Hotel or rental name' },
    ],
  },
]

export const PARENT_FIELDS: ParentField[] = PARENT_FIELD_GROUPS.flatMap(g => g.fields)
export const PARENT_FIELD_KEYS: readonly string[] = PARENT_FIELDS.map(f => f.key)

// The waiver form's switches (Forms > Player waiver), with the defaults the
// waiver page uses when an org never set them (DEFAULT_FIELDS in
// app/tournaments/[id]/player-waiver/page.tsx).
const ASKED_BY: Record<string, { flag: string; byDefault: boolean }> = {
  grade: { flag: 'grade', byDefault: true },
  position: { flag: 'position', byDefault: true },
  parent2Name: { flag: 'parent2', byDefault: true },
  parent2Email: { flag: 'parent2', byDefault: true },
  parent2Phone: { flag: 'parent2', byDefault: true },
  hotel: { flag: 'hotelQuestion', byDefault: false },
  hotelName: { flag: 'hotelQuestion', byDefault: false },
}

/**
 * The fields to show a parent for one waiver: the ones the org's waiver form
 * asks, plus any the waiver already has an answer in. An org that never asks
 * about hotels doesn't get a hotel question on the parent page.
 */
export function shownParentFields(formFields: Record<string, unknown> | null | undefined, data: Record<string, unknown> | null | undefined): string[] {
  return PARENT_FIELD_KEYS.filter(k => {
    const a = ASKED_BY[k]
    if (!a) return true
    if (String(data?.[k] ?? '').trim()) return true
    const v = formFields?.[a.flag]
    return v === undefined || v === null ? a.byDefault : !!v
  })
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * A parent's changes, cleaned: only the keys above, trimmed and capped, the
 * jersey as the waiver form takes it (digits, up to 3), select fields limited to
 * their choices, required fields not emptied. Returns the cleaned changes, or an
 * error naming the field to fix.
 */
export function cleanParentChanges(raw: unknown): { changes: Record<string, string> } | { error: string } {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  const changes: Record<string, string> = {}
  for (const f of PARENT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(src, f.key)) continue
    let v = String(src[f.key] ?? '').trim().slice(0, 200)
    if (f.key === 'jerseyNumber') v = v.replace(/\D/g, '').slice(0, 3)
    if (f.required && !v) return { error: `${f.label} can’t be blank` }
    if (f.type === 'email' && v && !EMAIL.test(v)) return { error: `Check the ${f.label.toLowerCase()}` }
    if (f.type === 'select' && v && f.options && !f.options.includes(v)) return { error: `Pick one of the choices for “${f.label}”` }
    changes[f.key] = v
  }
  return { changes }
}

/** The editable values on a waiver, as strings. */
export function pickParentFields(data: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of PARENT_FIELD_KEYS) out[k] = String(data?.[k] ?? '')
  return out
}

/**
 * What the waiver's thank-you screen offers (lib/parentWaivers accountOffer):
 *   - linked: the person signed in is the waiver's parent, so it is already in
 *     their account;
 *   - token: a one-time key for "create a password" (or, when `existing`, for
 *     "enter your password") on the waiver's parent email.
 */
export type AccountOffer =
  | { linked: true; email: string }
  | { token: string; email: string; existing: boolean }
