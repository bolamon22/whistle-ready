// BOYS OR GIRLS, READ OFF THE DIVISION NAME.
//
// Nothing in the database records a division's gender -- not on the division, not
// on the team. Worker.gender is staff, PlayerRegistration.gender is a player and
// lives in a store the waiver form does not write to. So the only place the answer
// exists is inside the name, and this reads it out of there (Bo, Sep 28 2026).
//
// THAT IS A GUESS, AND IT SAYS SO. Anything this cannot place comes back 'other'
// rather than being forced into a bucket, and every caller shows the leftover
// instead of hiding it. A split that quietly stops adding up to the team count is
// worse than no split at all: "43 and 27" reads as authoritative whether or not it
// covers all 70. If the unclassified tail ever starts showing up regularly, that is
// the signal to put a real gender field on the division and delete this file.

export type DivisionGender = 'boys' | 'girls' | 'other'

// Word-boundary matches, searched anywhere in the name rather than anchored to the
// front: "Boys High School A" and "HS Boys" are both in use in the wild, and the
// second would be missed by a ^ anchor.
const BOYS  = /\b(boys?|mens?|men's|male)\b/i
const GIRLS = /\b(girls?|womens?|women's|female|ladies)\b/i

/**
 * Which side of the draw a division belongs to.
 * 'other' means genuinely unknown -- unnamed, coed, or naming both.
 */
export function genderOf(division: unknown): DivisionGender {
  const s = String(division ?? '')
  if (!s.trim()) return 'other'
  // Coed first: a coed division may well spell out both, and it is neither.
  if (/\b(coed|co-ed|mixed)\b/i.test(s)) return 'other'
  const b = BOYS.test(s), g = GIRLS.test(s)
  if (b && g) return 'other'   // "Boys/Girls U8" -- a real thing at small events
  if (b) return 'boys'
  if (g) return 'girls'
  return 'other'
}

export type GenderSplit = {
  boys: number; girls: number; other: number; total: number
  boysDivisions: number; girlsDivisions: number; otherDivisions: number
  /** True when every division was placed, i.e. the split covers the whole event. */
  complete: boolean
}

/** Totals across [divisionName, teamCount] pairs. */
export function splitByGender(rows: [string, number][]): GenderSplit {
  const out: GenderSplit = {
    boys: 0, girls: 0, other: 0, total: 0,
    boysDivisions: 0, girlsDivisions: 0, otherDivisions: 0, complete: true,
  }
  for (const [name, countRaw] of rows || []) {
    const count = Number(countRaw) || 0
    out.total += count
    const g = genderOf(name)
    if (g === 'boys')  { out.boys  += count; out.boysDivisions++ }
    else if (g === 'girls') { out.girls += count; out.girlsDivisions++ }
    else { out.other += count; out.otherDivisions++ }
  }
  out.complete = out.other === 0
  return out
}

/** Sentence-case label for a group heading. */
export function genderLabel(g: DivisionGender): string {
  return g === 'boys' ? 'Boys' : g === 'girls' ? 'Girls' : 'Other divisions'
}
