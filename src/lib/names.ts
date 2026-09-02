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
