// Shared standings calculation (mirrors the public results page).
export type Game = {
  id: string; gameNumber: string; date: string; startTime: string; division: string
  pool: string | null; location: string; team1: string; team2: string
  score1: number | null; score2: number | null; isCanceled: boolean; isChampionship: boolean
}
export type Standing = { team: string; w: number; l: number; t: number; gf: number; ga: number; pts: number }

export const DEFAULT_TBS = ['record', 'goal_diff', 'goals_for']

export function calcStandings(games: Game[], division: string, pool?: string, tbs: string[] = DEFAULT_TBS): Standing[] {
  const map: Record<string, Standing> = {}
  const ensure = (t: string) => { if (!map[t]) map[t] = { team: t, w: 0, l: 0, t: 0, gf: 0, ga: 0, pts: 0 } }
  const rel = games.filter(g => g.division === division && !g.isCanceled && !g.isChampionship && (pool !== undefined ? g.pool === pool : true))
  rel.forEach(g => { ensure(g.team1); ensure(g.team2) })
  const scored = rel.filter(g => g.score1 !== null && g.score2 !== null)
  scored.forEach(g => {
    const s1 = g.score1!, s2 = g.score2!
    map[g.team1].gf += s1; map[g.team1].ga += s2; map[g.team2].gf += s2; map[g.team2].ga += s1
    if (s1 > s2) { map[g.team1].w++; map[g.team1].pts += 3; map[g.team2].l++ }
    else if (s2 > s1) { map[g.team2].w++; map[g.team2].pts += 3; map[g.team1].l++ }
    else { map[g.team1].t++; map[g.team1].pts++; map[g.team2].t++; map[g.team2].pts++ }
  })
  const mp = (x: Standing) => x.w + x.l + x.t
  const h2h = (aT: string, bT: string) => {
    let aP = 0, bP = 0, aGd = 0
    scored.filter(g => (g.team1 === aT && g.team2 === bT) || (g.team1 === bT && g.team2 === aT)).forEach(g => {
      const aS = g.team1 === aT ? g.score1! : g.score2!, bS = g.team1 === aT ? g.score2! : g.score1!
      aGd += aS - bS; if (aS > bS) aP += 3; else if (bS > aS) bP += 3; else { aP++; bP++ }
    })
    return { aP, bP, aGd }
  }
  const cmp = (a: Standing, b: Standing) => {
    for (const tb of tbs) {
      let d = 0
      if (tb === 'record') d = b.pts - a.pts
      else if (tb === 'win_pct') d = (b.w + 0.5 * b.t) / Math.max(1, mp(b)) - (a.w + 0.5 * a.t) / Math.max(1, mp(a))
      else if (tb === 'goal_diff') d = (b.gf - b.ga) - (a.gf - a.ga)
      else if (tb === 'goals_for') d = b.gf - a.gf
      else if (tb === 'goals_against') d = a.ga - b.ga
      else if (tb === 'head_to_head' || tb === 'h2h_two') { const h = h2h(a.team, b.team); d = h.bP - h.aP }
      else if (tb === 'h2h_gd') { const h = h2h(a.team, b.team); d = -2 * h.aGd }
      if (d) return d
    }
    return 0
  }
  return Object.values(map).sort(cmp)
}

// How teams reach the bracket (Bo, Oct 12 2026: "we determine it by division in
// this tournament ... we should be able to switch between"). Stored on the
// tournament's tiebreakers JSON as `advanceBy`; anything but 'pool' means division.
//   division - one ranking across every pool in the division; the top N seed.
//   pool     - each pool ranks its own teams; seeds go by place (every pool
//              winner, then every runner-up, ...), ties in a place broken by the
//              division ranking.
export type AdvanceBy = 'division' | 'pool'
export type StandingsRules = { pool: string[]; division: string[]; advanceBy: AdvanceBy }

export function parseStandingsRules(raw: unknown): StandingsRules {
  let o: any = raw
  if (typeof raw === 'string') { try { o = JSON.parse(raw || '{}') } catch { o = {} } }
  if (Array.isArray(o)) return { pool: o, division: o, advanceBy: 'division' }
  o = o || {}
  const pool: string[] = Array.isArray(o.pool) && o.pool.length ? o.pool : DEFAULT_TBS
  const division: string[] = Array.isArray(o.division) && o.division.length ? o.division : pool
  return { pool, division, advanceBy: o.advanceBy === 'pool' ? 'pool' : 'division' }
}

/** Teams in seed order for the bracket, by the tournament's advance rule. */
export function seedOrder(games: Game[], division: string, rules: StandingsRules): Standing[] {
  const overall = calcStandings(games, division, undefined, rules.division)
  if (rules.advanceBy !== 'pool') return overall
  const pools = Array.from(new Set(games.filter(g => g.division === division && !g.isChampionship && g.pool).map(g => g.pool as string)))
  if (pools.length < 2) return overall
  const place: Record<string, number> = {}
  for (const p of pools) calcStandings(games, division, p, rules.pool).forEach((s, i) => { if (place[s.team] === undefined) place[s.team] = i })
  const rank: Record<string, number> = {}
  overall.forEach((s, i) => { rank[s.team] = i })
  return [...overall].sort((a, b) => (place[a.team] ?? 99) - (place[b.team] ?? 99) || rank[a.team] - rank[b.team])
}
