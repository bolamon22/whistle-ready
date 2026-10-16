// A person's name from a spreadsheet row (Staff Pool → Bulk Import): one Full name
// column, or First name and Last name columns (Bo, Oct 16 2026: "there was a first and
// last name, and we were unable to map them"). A full name written "Last, First" is
// turned around. No database import: the Staff Pool page uses it.

const SUFFIX = /^(jr|sr|ii|iii|iv|v)\.?$/i

/** "Smith, John" -> "John Smith". "John Smith, Jr." and anything with no comma or more
 *  than one stays as written (spaces tidied). */
export function flipLastFirst(full: string): string {
  const s = String(full ?? '').trim().replace(/\s+/g, ' ')
  const parts = s.split(',')
  if (parts.length !== 2) return s
  const last = parts[0].trim(), first = parts[1].trim()
  if (!last || !first || SUFFIX.test(first)) return s
  return `${first} ${last}`
}

/** The name to import: the full name when there is one, else first and last together. */
export function importName(full: unknown, first: unknown, last: unknown): string {
  const f = String(full ?? '').trim()
  if (f) return flipLastFirst(f)
  return [first, last].map(x => String(x ?? '').trim().replace(/\s+/g, ' ')).filter(Boolean).join(' ')
}
