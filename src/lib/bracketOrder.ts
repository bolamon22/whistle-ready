// When a bracket game may start (Bo, Oct 11 2026: "after the regular round ends,
// we need time to seed them. That would be one game slot. Then also we have to
// make sure we play the lead-in games before the next").
//
// Two rules, shared by the Board's placing hints, the Issues list, the Time
// editor and Auto-fill so they never disagree:
//   - Lead-in games: a game fed by "W-B5" / "L-B5" starts once B5 has ended,
//     i.e. at least one slot (the schedule increment) after B5 starts.
//   - Seeding: a game with a seeded slot ("Seed 3") waits for the division's pool
//     play to end plus one empty slot to seed it: at least two slots after the
//     last pool game starts. Pool play ending on an earlier day is fine.
// Times are "HH:MM", dates "YYYY-MM-DD"; the increment is minutes per slot.

export interface BOGame { id?: string; division: string; gameNumber: string; team1: string; team2: string; date?: string | null; startTime?: string | null }
export interface BracketWait { kind: 'feeder' | 'seeding'; ref: string; date: string; atMin: number; why: string }

export const toMin = (t: string) => { const [h, m] = String(t || '').split(':'); return (parseInt(h) || 0) * 60 + (parseInt(m) || 0) }
const fmt = (min: number) => { const h = Math.floor(min / 60), m = min % 60; return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` }
export const feederNum = (team: string): string | null => { const m = (team || '').trim().match(/^[WL]-(B\d+)$/i); return m ? m[1].toUpperCase() : null }
export const isSeedSlot = (team: string) => /^Seed \d+$/i.test((team || '').trim())
export const isBracketNum = (gameNumber: string) => /^B\d+$/i.test(gameNumber || '')
const placed = (g: BOGame) => !!(g.date && g.startTime)

/**
 * What `g` waits for, and what can't be known yet (a lead-in game or pool games
 * not placed). `games` is the whole schedule; only `g`'s division is read.
 */
export function bracketWaits(g: BOGame, games: BOGame[], increment: number): { waits: BracketWait[]; unknown: string[] } {
  const waits: BracketWait[] = [], unknown: string[] = []
  if (!isBracketNum(g.gameNumber)) return { waits, unknown }
  const mine = games.filter(x => x.division === g.division && x.gameNumber !== g.gameNumber)
  for (const t of [g.team1, g.team2]) {
    const n = feederNum(t)
    if (!n) continue
    const f = mine.find(x => x.gameNumber.toUpperCase() === n)
    if (!f) continue
    if (!placed(f)) { unknown.push(`${n} isn't placed yet (it must finish before ${g.gameNumber})`); continue }
    const at = toMin(f.startTime!) + increment
    waits.push({ kind: 'feeder', ref: n, date: f.date!, atMin: at, why: `${n} has to finish first (${fmt(toMin(f.startTime!))}, done by ${fmt(at)})` })
  }
  if ([g.team1, g.team2].some(isSeedSlot)) {
    const pools = mine.filter(x => !isBracketNum(x.gameNumber))
    const open = pools.filter(x => !placed(x)).length
    if (open) unknown.push(`${open} pool game${open === 1 ? '' : 's'} not placed yet, so seeding time isn't known`)
    const last = pools.filter(placed).sort((a, b) => (a.date! < b.date! ? -1 : a.date! > b.date! ? 1 : toMin(a.startTime!) - toMin(b.startTime!))).pop()
    if (last) {
      const at = toMin(last.startTime!) + 2 * increment
      waits.push({ kind: 'seeding', ref: 'seeding', date: last.date!, atMin: at, why: `pool play ends with ${last.gameNumber} at ${fmt(toMin(last.startTime!))}; with a slot to seed, seeded games start ${fmt(at)} or later` })
    }
  }
  return { waits, unknown }
}

/** The first rule a start at (date, time) breaks, or null. */
export function brokenWait(waits: BracketWait[], date: string, time: string): BracketWait | null {
  const t = toMin(time)
  return waits.find(w => date < w.date || (date === w.date && t < w.atMin)) ?? null
}
