// Name hygiene for club / team / person fields.
//
// Registrations arrive from the public form, the staff drawer, imports and the
// divisions tool, and the names they carry are used as string keys all over the
// app (pools, games, brackets, waivers, follows). A trailing space or a doubled
// space turns one club into two ("LaxManiax" vs "LaxManiax "), so every write
// path runs through cleanName() and the forms warn when a typed name is only
// cosmetically different from one already on file.

/** Trim, collapse runs of whitespace, drop zero-width / nbsp characters. Keeps case and punctuation. */
export function cleanName(v: unknown, max = 200): string {
  return String(v ?? '')
    .replace(/[\u00a0\u2007\u202f]/g, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

/** Loose comparison key: case-, accent-, whitespace- and punctuation-insensitive. */
export function nameKey(v: unknown): string {
  return cleanName(v)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * One team at one event is a (division, name) pair, never a name alone: a club
 * fields "Miami Reign" in Boys HS A, Boys HS B and Boys U14 B, and those are
 * three teams with three schedules. Anything keyed by team -- follows, follower
 * counts, alerts -- keys by this. Loose on both parts, like nameKey.
 */
export const teamRefKey = (division: unknown, team: unknown): string => `${nameKey(division)}|${nameKey(team)}`

/** Even looser club key: also ignores the usual "Lacrosse / Lax / LC / Club" tails. */
export function clubKey(v: unknown): string {
  const k = nameKey(v)
  return k.replace(/(lacrosseclub|lacrosse|laxclub|lax|lc|club)$/, '') || k
}

/**
 * An existing name that is the "same" club as `typed` but spelled differently
 * (case, spacing, punctuation, or a Lacrosse/Lax/LC tail) — or null when the
 * typed name is new, or already an exact match with something on file.
 */
export function findNearMatch(typed: string, existing: string[]): string | null {
  const t = cleanName(typed)
  if (t.length < 3) return null
  const strict = nameKey(t)
  if (!strict) return null
  if (existing.some(e => e === t)) return null
  const loose = clubKey(t)
  let fallback: string | null = null
  for (const e of existing) {
    if (nameKey(e) === strict) return e
    if (!fallback && loose.length >= 4 && clubKey(e) === loose) fallback = e
  }
  return fallback
}

// Short form of a division name for tight spaces (a schedule tile, a bracket label):
//   Boys High School A        -> BHSA
//   Girls Middle School B     -> GMSB
//   Boys U14 A                -> B U14A
//   Boys U10 (7v7)            -> B U10 7v7
//   Girls Lower School (7v7)  -> GLS 7v7
// Gender becomes one letter; an age group keeps its U-number with its letter; other
// words contribute their initial; a parenthetical format is kept as a suffix.
export function divisionAbbr(name: string): string {
  const raw = String(name || '').trim()
  if (!raw) return ''
  let suffix = ''
  const body = raw.replace(/\(([^)]*)\)/g, (_m, inner) => { suffix += ' ' + String(inner).replace(/\s+/g, ''); return ' ' })
  const words = body.split(/\s+/).filter(Boolean)
  let gender = ''
  const rest: string[] = []
  for (const w of words) {
    if (/^boys?$/i.test(w) && !gender) gender = 'B'
    else if (/^girls?$/i.test(w) && !gender) gender = 'G'
    else if (/^co-?ed$/i.test(w) && !gender) gender = 'C'
    else rest.push(w)
  }
  const ageIdx = rest.findIndex(w => /^U\d{1,2}[A-Z]?$/i.test(w))
  let core: string
  if (ageIdx >= 0) {
    let age = rest[ageIdx].toUpperCase()
    const next = rest[ageIdx + 1]
    if (next && /^[A-Z]$/i.test(next)) age += next.toUpperCase()
    core = (gender ? gender + ' ' : '') + age
  } else if (!gender && rest.length === 1) {
    core = rest[0].toUpperCase().slice(0, 6) // "8U", "Open": nothing to shorten
  } else {
    const initials = rest.map(w => w.replace(/[^a-zA-Z0-9]/g, '')).filter(Boolean).map(w => w[0].toUpperCase()).join('')
    core = gender + initials
  }
  return (core + suffix).trim() || raw.slice(0, 4).toUpperCase()
}
