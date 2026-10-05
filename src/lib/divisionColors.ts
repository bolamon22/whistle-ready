// One color per division, the same on the Divisions page and the Scheduler.
//
// Both pages used to fall back to a 10-color palette by list position, so an
// event with 14 divisions repeated four colors (Monster Mash: BHSA and GHSB both
// blue, BHSB and GLS 7v7 both green...), and each page indexed a different list,
// so a division could even change color between them. Bo couldn't tell divisions
// apart on the Board (Oct 5 2026).
//
// Rules: a color saved on the Divisions page wins; if two divisions saved the
// same color, the first by name keeps it and the other gets a free one. Unsaved
// divisions take the first palette color nobody is using, in name order. The
// first ten palette entries are the old ones, so small events look as before.
export const DIVISION_PALETTE = [
  '#3b82f6', '#10b981', '#a855f7', '#f97316', '#ec4899',
  '#14b8a6', '#ef4444', '#b45309', '#6366f1', '#06b6d4',
  '#65a30d', '#d946ef', '#475569', '#ca8a04', '#1e3a8a', '#9f1239',
]

export function divisionColorMap(divisions: string[], saved: Record<string, string> = {}): Record<string, string> {
  const names = [...new Set(divisions.filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const out: Record<string, string> = {}
  const used = new Set<string>()
  const norm = (c: string) => c.trim().toLowerCase()
  for (const d of names) {
    const c = saved[d]
    if (c && !used.has(norm(c))) { out[d] = c; used.add(norm(c)) }
  }
  let i = 0
  for (const d of names) {
    if (out[d]) continue
    let pick = DIVISION_PALETTE.find(c => !used.has(norm(c)))
    if (!pick) pick = DIVISION_PALETTE[i++ % DIVISION_PALETTE.length]   // more divisions than colors
    out[d] = pick
    used.add(norm(pick))
  }
  return out
}
