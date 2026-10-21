// Sorting people by last name (James Vacco, head assigner, Oct 21 2026: "sort staff by
// last name in alphabetical order. Assign by last name also. Right now it's by first
// name only."). A person's name is one string ("Chris Cox"), so the last name is its
// last word, skipping a suffix ("Mike Smith Jr." is Smith). Pure; client pages use it.

const SUFFIX = /^(jr|sr|ii|iii|iv|v|md|phd)\.?$/i
const words = (name: string) => String(name || '').trim().split(/\s+/).filter(Boolean)

/** { first, last } of a one-string name; a single word is the last name. */
export function nameParts(name: string): { first: string; last: string; suffix: string } {
  const w = words(name)
  const suffix = w.length > 2 && SUFFIX.test(w[w.length - 1]) ? w.pop()! : ''
  const last = w.pop() || ''
  return { first: w.join(' '), last, suffix }
}

/** "Cox, Chris" (and "Smith Jr., Mike"); a single word stays as it is. */
export function lastFirst(name: string): string {
  const { first, last, suffix } = nameParts(name)
  const l = suffix ? `${last} ${suffix}` : last
  return first ? `${l}, ${first}` : l
}

/** A–Z by last name, then first name; case and accents ignored. */
export function byLastName(a: string, b: string): number {
  const x = nameParts(a), y = nameParts(b)
  return x.last.localeCompare(y.last, undefined, { sensitivity: 'base' })
    || x.first.localeCompare(y.first, undefined, { sensitivity: 'base' })
    || String(a).localeCompare(String(b))
}
