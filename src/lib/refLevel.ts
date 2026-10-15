// Ref level (Bo, Oct 15 2026: "The referee assigners would like ... level one, two, and
// three, with one being the lowest ... color-coded red, yellow, and green"). The
// assigners' own ranking of their refs, separate from the cert level (youth, high
// school, college), which sets pay.
//
// Stored in Worker.refLevel, a raw INTEGER column (null = not ranked; lib/refLevelDb
// adds it). Seen and set by the people who see staff pay (lib/roleScope
// canSeeRefLevel): admins, directors, and assigners for the staff groups they run.
// Refs never see their own. Pure: safe in client components.

export type RefLevel = 1 | 2 | 3

export const REF_LEVELS: { value: RefLevel; label: string; color: string; pill: string }[] = [
  { value: 3, label: 'Level 3', color: 'green', pill: 'bg-green-600 text-white' },
  { value: 2, label: 'Level 2', color: 'yellow', pill: 'bg-yellow-300 text-yellow-950' },
  { value: 1, label: 'Level 1', color: 'red', pill: 'bg-red-600 text-white' },
]

/** 1, 2 or 3, or null for anything else (not ranked). */
export function refLevelOf(v: unknown): RefLevel | null {
  const n = Number(v)
  return n === 1 || n === 2 || n === 3 ? n : null
}

/** "Level 2 (yellow)" for a select option or a tooltip. */
export function refLevelLabel(v: unknown): string {
  const l = REF_LEVELS.find(x => x.value === refLevelOf(v))
  return l ? `${l.label} (${l.color})` : 'Not ranked'
}
