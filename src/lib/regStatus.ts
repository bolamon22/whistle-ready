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
// IT NEVER BLOCKS ANYBODY. No state here is read by any registration route. A
// division marked full still accepts teams through the normal form -- teams drop
// late every year, and the organizer would rather take the entry and sort it out
// than turn a club away at the door. So this file has no authority over money or
// eligibility; the worst a wrong setting can do is tell a story that isn't true.
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
  const st = c.divisionStatus || {}
  return divisions.filter(d => st[d] !== 'full').length
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

/** The state of one division's pill, or null to leave it as it is today. */
export function divisionBadge(name: string, c: RegStatusFields | null | undefined): DivBadge | null {
  const raw = c?.divisionStatus?.[name]
  if (raw === 'full') return { tone: 'navy', suffix: 'Full' }
  if (raw === 'limited') {
    const n = String(c?.divisionSpots?.[name] ?? '').trim()
    const num = Number(n)
    if (n && Number.isFinite(num) && num > 0) return { tone: 'amber', suffix: `${num} spot${num === 1 ? '' : 's'}` }
    return { tone: 'amber', suffix: 'Last spots' }
  }
  return null
}

/** Shown under the divisions when any is marked full, so a club reading "Full"
 *  knows the form is still open to them rather than giving up on the page. */
export const FULL_DIVISION_NOTE =
  'Divisions marked full are at capacity, but teams do drop. You can still register and we will be in touch about a spot.'
