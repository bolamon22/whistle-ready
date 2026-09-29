// THE REGISTRATION-STATUS BADGE — "Filling up", "Closes Oct 3", "Full".
//
// WHAT IT IS FOR. Clubs leave it late, and a nudge on the event page pulls the
// last few in. Bo already does this by hand at the end of a registration window;
// this is the same nudge, in the same place, on every surface at once.
//
// IT IS A SWITCH, NOT A REPORT. Nothing here counts registrations or compares
// against a cap. The organizer turns a state on, optionally rewrites the words,
// and that is what shows. That is deliberate: the badge is often flipped on
// BEFORE an event is really full, to get the stragglers moving, and a computed
// badge could not be used that way (Bo, Sep 29 2026).
//
// IT STILL NEVER BLOCKS ANYBODY, but it is no longer free of consequence.
// A division marked full accepts teams exactly as before -- teams drop late every
// year and the organizer would rather take the entry than turn a club away at the
// door. What changed on Sep 29 2026 is that such a team is recorded as WAITLISTED
// and left off the invoice until the organizer says otherwise.
//
// So one setting here does now move money: marking a division 'full'. Get it wrong
// and a club is under-billed until somebody notices, which is a real cost rather
// than just a story that isn't true. Every other state remains presentation only.
//
// Everything lives in the tournamentSite:{id} AppSetting blob alongside the rest
// of the public page content, so there is no migration and no new column.

export type RegState = 'filling' | 'closing' | 'full'
export type DivState = 'limited' | 'full'

export type RegStatusFields = {
  regStatus?: string
  /** Organizer's own wording. Overrides the default label entirely. */
  regStatusText?: string
  /** YYYY-MM-DD, for the "Closes ..." default. */
  regClosesOn?: string
  /** Division name (as stored in registrationDivisions) -> 'limited' | 'full'. */
  divisionStatus?: Record<string, string>
  /** Division name -> spots remaining, shown on a 'limited' pill. */
  divisionSpots?: Record<string, string>
}

export type BadgeTone = 'amber' | 'navy'
export type RegBadge = { tone: BadgeTone; label: string; state: RegState }

/** Tailwind for a soft status pill, matching the existing "Next up" recipe:
 *  tinted fill, one-step-darker border, dark text. */
export const TONE_CLASS: Record<BadgeTone, string> = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  navy: 'bg-slate-100 text-[#0b1f3a] border-slate-300',
}

/** Same pill over a dark photo/gradient hero, where a light fill would glare. */
export const TONE_CLASS_DARK: Record<BadgeTone, string> = {
  amber: 'bg-amber-700/35 text-amber-100 border-amber-200/55',
  navy: 'bg-white/15 text-white border-white/40',
}

const isState = (v: unknown): v is RegState => v === 'filling' || v === 'closing' || v === 'full'

/** "2026-10-03" -> "Oct 3". Parts are split rather than passed to new Date(),
 *  which reads a bare date as UTC midnight and prints the day before in the US. */
export function shortDay(d?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''))
  if (!m) return ''
  const dt = new Date(+m[1], +m[2] - 1, +m[3])
  if (isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** How many of this event's divisions are not marked full. */
export function openDivisionCount(c: RegStatusFields, divisions: string[]): number {
  return divisions.filter(d => !isDivisionFull(d, c)).length
}

/**
 * What the badge should say, or null for no badge.
 *
 * The default label counts what is OPEN, never what is gone. "11 divisions open"
 * and "3 divisions full" are the same fact, but one points at the door and the
 * other at the wall -- and this badge goes on a page whose whole job is to get
 * one more club to register.
 */
export function regBadge(c: RegStatusFields | null | undefined, divisions: string[] = []): RegBadge | null {
  if (!c) return null
  const state = c.regStatus
  if (!isState(state)) return null

  const custom = String(c.regStatusText || '').trim()
  if (custom) return { tone: state === 'full' ? 'navy' : 'amber', label: custom, state }

  if (state === 'full') return { tone: 'navy', label: 'Full', state }

  if (state === 'closing') {
    const day = shortDay(c.regClosesOn)
    return { tone: 'amber', label: day ? `Closes ${day}` : 'Closing soon', state }
  }

  const open = openDivisionCount(c, divisions)
  const label = divisions.length && open > 0
    ? `Filling up · ${open} division${open === 1 ? '' : 's'} open`
    : 'Filling up'
  return { tone: 'amber', label, state }
}

export type DivBadge = { tone: BadgeTone; suffix: string }

// THE WORDING IS THE SETTING. Rather than one "limited" state with a wording
// baked in here, the organizer picks the phrase itself -- different divisions
// want different pressure, and the only person who knows which is the one
// looking at the entries.
//
// The stored value is a slug, not the label, so rewording an option later does
// not orphan the divisions already set to it. 'limited' and 'full' keep the
// values they shipped with, so nothing already saved has to be migrated.
//
// Amber for anything still taking teams, navy for Full -- see TONE_CLASS. No
// "Waiting list" option: there is no waiting list to join yet, and a pill must
// not promise a thing the site cannot do.
export const DIVISION_STATES: ReadonlyArray<{ value: string; label: string; tone: BadgeTone }> = [
  { value: 'limited',     label: 'Limited',      tone: 'amber' },
  { value: 'almostfull',  label: 'Almost full',  tone: 'amber' },
  { value: 'fewleft',     label: 'Few left',     tone: 'amber' },
  { value: 'lastspots',   label: 'Last spots',   tone: 'amber' },
  { value: 'fillingfast', label: 'Filling fast', tone: 'amber' },
  { value: 'full',        label: 'Full',         tone: 'navy' },
]

export const divisionState = (v: unknown) => DIVISION_STATES.find(s => s.value === String(v ?? '')) || null

// The status map is keyed by the division name as the builder had it, but the
// name arrives from three places that normalize differently: the public form
// sends what the picker held, the API stores cleanName()'d text, and the staff
// page edits it by hand. An exact hit wins; this is the fallback so a stray
// space can never be the difference between billing a team and not.
const normKey = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** The key this division is filed under in divisionStatus / divisionSpots. */
function statusKey(name: string, c: RegStatusFields | null | undefined): string | null {
  const map = c?.divisionStatus
  if (!map) return null
  if (Object.prototype.hasOwnProperty.call(map, name)) return name
  const want = normKey(name)
  return Object.keys(map).find(k => normKey(k) === want) || null
}

/** Is this division at capacity? The one question with money attached -- a team
 *  registering into it is recorded as waitlisted and left off the invoice. */
export const isDivisionFull = (name: string, c: RegStatusFields | null | undefined): boolean => {
  const k = statusKey(name, c)
  return !!k && String(c?.divisionStatus?.[k] ?? '') === 'full'
}

/** The state of one division's pill, or null to leave it as it is today. */
export function divisionBadge(name: string, c: RegStatusFields | null | undefined): DivBadge | null {
  const key = statusKey(name, c)
  const state = key ? divisionState(c?.divisionStatus?.[key]) : null
  if (!state) return null
  // A real count beats any of the phrases: "2 spots" is the same urgency and
  // says something the club can act on. The phrase is the fallback for when the
  // organizer would rather not commit to a number.
  if (state.tone === 'amber') {
    const n = String(c?.divisionSpots?.[key as string] ?? '').trim()
    const num = Number(n)
    if (n && Number.isFinite(num) && num > 0) return { tone: 'amber', suffix: `${num} spot${num === 1 ? '' : 's'}` }
  }
  return { tone: state.tone, suffix: state.label }
}

/** Shown under the divisions when any is marked full. A club that reads "Full"
 *  decides in that second whether to close the tab, so this has to be visible
 *  without a hover (most of them are on a phone) and has to end somewhere they
 *  can act rather than at a full stop. */
export const FULL_DIVISION_TITLE = 'Full divisions accept waitlist entries.'
// Bo's words, Sep 29 2026. What was here opened with "Teams drop most years",
// which was meant to say a waitlist is worth joining and instead told every club
// reading it that teams bail on this event. A full division is evidence of demand
// and the copy should carry itself that way: what the club needs is that the door
// is open, that sitting in line costs nothing, and that someone will come back to
// them. Nothing about anybody else's teams.
export const FULL_DIVISION_NOTE =
  'Register your team as you normally would and we\u2019ll hold your place in line. There\u2019s no charge to join the list \u2014 you\u2019re billed only if a spot opens, and we\u2019ll contact you as soon as one does.'
