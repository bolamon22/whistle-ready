import { prisma } from '@/lib/db'

// How many referees a game gets by default (Bo, Oct 6 2026: "7v7 games only
// have one referee per game").
//
// The rule lives in Setup > Officials: a standard count plus keyword exceptions
// ("7v7" -> 1), stored on the tournament as divisionRules {keyword: count}. Only
// the CSV import ever read it. Games made by the pool generator, the bracket
// builder or "add game" were all hard-coded to 2, so the rule did nothing for
// any schedule built in the app. Every create path now asks here.
//
// It sets the default only. Game.refCount is what the assigner board shows and
// edits, so a playoff game bumped to a second ref by hand keeps it.

export function parseDivisionRules(json: unknown): Record<string, number> {
  try {
    const o = typeof json === 'string' ? JSON.parse(json || '{}') : json
    if (!o || typeof o !== 'object' || Array.isArray(o)) return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const n = Number(v)
      if (k.trim() && Number.isFinite(n) && n >= 1 && n <= 3) out[k.trim()] = Math.round(n)
    }
    return out
  } catch { return {} }
}

/** First keyword the division name contains wins; otherwise the standard count. */
export function refsForDivision(division: string, rules: Record<string, number>, standard = 2): number {
  const d = (division || '').toLowerCase()
  for (const [kw, n] of Object.entries(rules)) if (d.includes(kw.toLowerCase())) return n
  return standard
}

// Championship games get one more ref than the division's usual count, up to 3
// (Bo, Oct 8 2026: "7v7 has two refs during championships, and the other games
// are supposed to have three"). With 7v7 = 1 and a standard of 2 that is 2 and 3.
// It used to be a floor of 3 applied on the assigner board and in Auto-assign,
// which put 3 on a 7v7 final and made a championship's minus button do nothing.
// It is now the default stored on the game, like any other count, and can be
// changed by hand either way.
export function championshipRefs(regular: number): number {
  return Math.min(3, Math.max(1, regular) + 1)
}

/** Default refs for a game in this division (a championship gets one more). */
export function defaultRefs(division: string, rules: Record<string, number>, standard = 2, championship = false): number {
  const n = refsForDivision(division, rules, standard)
  return championship ? championshipRefs(n) : n
}

function standardOf(payRates: unknown): number {
  try {
    const o = typeof payRates === 'string' ? JSON.parse(payRates || '{}') : payRates
    const n = Number((o as any)?.officialsConfig?.standardCount)
    return Number.isFinite(n) && n >= 1 && n <= 3 ? Math.round(n) : 2
  } catch { return 2 }
}

/** A division -> default ref count lookup for one tournament. */
export async function refsLookup(tournamentId: string): Promise<(division: string, championship?: boolean) => number> {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { divisionRules: true, payRates: true } })
    const rules = parseDivisionRules(t?.divisionRules)
    const standard = standardOf(t?.payRates)
    return (division: string, championship = false) => defaultRefs(division, rules, standard, championship)
  } catch { return (_d: string, championship = false) => (championship ? 3 : 2) }
}

/**
 * When the Officials rules change, move existing games that still sit at the
 * count the old rules gave them to what the new rules give. A game whose count
 * was changed by hand (a playoff with a second ref) no longer matches the old
 * default and is left alone. A championship game made before championships had
 * their own default still holds the division's usual count, so that counts as a
 * default for it too. Returns how many games changed.
 */
export async function applyRuleChange(tournamentId: string, oldRules: Record<string, number>, newRules: Record<string, number>, standard = 2): Promise<number> {
  const games = await prisma.game.findMany({ where: { tournamentId }, select: { id: true, division: true, refCount: true, isChampionship: true } })
  let changed = 0
  const byTarget = new Map<number, string[]>()
  for (const g of games) {
    const now = defaultRefs(g.division, newRules, standard, g.isChampionship)
    const was = g.isChampionship
      ? [defaultRefs(g.division, oldRules, standard, true), refsForDivision(g.division, oldRules, standard)]
      : [refsForDivision(g.division, oldRules, standard)]
    if (g.refCount === now || !was.includes(g.refCount)) continue
    if (!byTarget.has(now)) byTarget.set(now, [])
    byTarget.get(now)!.push(g.id)
  }
  for (const [n, ids] of byTarget) {
    const r = await prisma.game.updateMany({ where: { id: { in: ids } }, data: { refCount: n } })
    changed += r.count
  }
  return changed
}
