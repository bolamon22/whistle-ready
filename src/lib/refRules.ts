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

function standardOf(payRates: unknown): number {
  try {
    const o = typeof payRates === 'string' ? JSON.parse(payRates || '{}') : payRates
    const n = Number((o as any)?.officialsConfig?.standardCount)
    return Number.isFinite(n) && n >= 1 && n <= 3 ? Math.round(n) : 2
  } catch { return 2 }
}

/** A division -> default ref count lookup for one tournament. */
export async function refsLookup(tournamentId: string): Promise<(division: string) => number> {
  try {
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { divisionRules: true, payRates: true } })
    const rules = parseDivisionRules(t?.divisionRules)
    const standard = standardOf(t?.payRates)
    return (division: string) => refsForDivision(division, rules, standard)
  } catch { return () => 2 }
}

/**
 * When the Officials rules change, move existing games that still sit at the
 * count the old rules gave them to what the new rules give. A game whose count
 * was changed by hand (a playoff with a second ref) no longer matches the old
 * default and is left alone. Championship games are skipped: the board gives
 * them their own minimum. Returns how many games changed.
 */
export async function applyRuleChange(tournamentId: string, oldRules: Record<string, number>, newRules: Record<string, number>, standard = 2): Promise<number> {
  const games = await prisma.game.findMany({ where: { tournamentId, isChampionship: false }, select: { id: true, division: true, refCount: true } })
  let changed = 0
  const byTarget = new Map<number, string[]>()
  for (const g of games) {
    const was = refsForDivision(g.division, oldRules, standard)
    const now = refsForDivision(g.division, newRules, standard)
    if (was === now || g.refCount !== was) continue
    if (!byTarget.has(now)) byTarget.set(now, [])
    byTarget.get(now)!.push(g.id)
  }
  for (const [n, ids] of byTarget) {
    const r = await prisma.game.updateMany({ where: { id: { in: ids } }, data: { refCount: n } })
    changed += r.count
  }
  return changed
}
