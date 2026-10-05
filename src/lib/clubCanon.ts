// Canonical club-name key, shared by the club database and the prospect list so
// both sides dedupe identically. Pure string work — no imports, so a client
// component can use it without dragging Prisma into its bundle.
//
// Strips punctuation/case, then trims one trailing generic suffix ("Lacrosse
// Club", "LC", "Lax"…) so "Stuart Lacrosse Club" and "Stuart LC" land on the
// same key. Only one suffix is removed, and only when something meaningful is
// left behind, so a club genuinely named "Lax" keeps its name.
export function canon(name: string): string {
  let s = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const suf of ['lacrosseclub', 'lacrosse', 'laxclub', 'lax', 'lc', 'club']) {
    if (s.endsWith(suf) && s.length > suf.length + 2) { s = s.slice(0, -suf.length); break }
  }
  return s || (name || '').toLowerCase().trim()
}
