// An org's tournaments repeat as a handful of named EVENTS across the years
// (Monster Mash, Summer Kick Off, Fall Classic, Jingle Brawl). Notification
// recipients are scoped to the EVENT, not to a dated tournament id, so a new
// yearly edition inherits its people automatically and nothing accumulates to
// clean up after an event is over. `seriesLabelOf` is the single source of truth
// for mapping a tournament name -> event label: it is used both to build the
// checkbox options in the editor AND to match at send time, so they can't drift.

const KNOWN: [RegExp, string][] = [
  [/monster mash/i, 'Monster Mash'],
  [/fall classic/i, 'Fall Classic'],
  [/jingle brawl/i, 'Jingle Brawl'],
  [/summer kick ?off|sunshine state games/i, 'Summer Kick Off'],
]

/** Map a tournament name to its recurring-event label. Known Sunshine series win;
 *  any other name falls back to itself with a trailing year / season token stripped,
 *  so "Spring Shootout 2027" and "Spring Shootout 2028" group as "Spring Shootout". */
export function seriesLabelOf(name: string): string {
  const s = String(name || '').trim()
  if (!s) return ''
  for (const [re, label] of KNOWN) if (re.test(s)) return label
  const base = s
    .replace(/\b(19|20)\d{2}\b/g, '')
    .replace(/\b(spring|summer|fall|autumn|winter)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s\-–—|:,]+$/, '')
    .trim()
  return base || s
}

/** Distinct event labels present across a set of tournament names, sorted. */
export function seriesLabelsFromNames(names: string[]): string[] {
  const seen = new Set<string>(); const out: string[] = []
  for (const n of names || []) { const l = seriesLabelOf(n); if (l && !seen.has(l)) { seen.add(l); out.push(l) } }
  return out.sort((a, b) => a.localeCompare(b))
}
