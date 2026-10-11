import { getTemplate } from '@/lib/bracketTemplates'

// The bracket generator, shared by the bracket API (which builds the games) and
// the Bracket tab (which counts them before anything is built, Bo Oct 11 2026:
// "I kind of want to know going into it, like how many total games it might be").
// No database access here, so the browser can run it too.

// ── Algorithmic bracket generator (any team count) ─────────────────────────
export type Sect = 'winners' | 'losers' | 'consolation' | 'championship'
export interface Gen { gameNumber: number; round: number; section: Sect; t1: string; t2: string; label: string }

export function generateSEGames(teamCount: number, consolationCount: number): Gen[] {
  const n = Math.max(2, teamCount)
  const games: Gen[] = []
  let gn = 1

  if (n === 2) {
    games.push({ gameNumber: gn++, round: 1, section: 'championship', t1: 'seed:1', t2: 'seed:2', label: 'Championship' })
  } else {
    let slots = 2
    while (slots < n) slots *= 2
    const byes = slots - n
    const byeSeeds = Array.from({ length: byes }, (_, i) => `seed:${i + 1}`)
    const r1Seeds = Array.from({ length: n - byes }, (_, i) => i + byes + 1)
    const equalByes = byes === r1Seeds.length / 2

    const r1Winners: string[] = []
    const mid = r1Seeds.length / 2
    for (let i = 0; i < r1Seeds.length / 2; i++) {
      const s1 = equalByes ? r1Seeds[mid - 1 - i] : r1Seeds[i]
      const s2 = equalByes ? r1Seeds[mid + i] : r1Seeds[r1Seeds.length - 1 - i]
      games.push({ gameNumber: gn, round: 1, section: 'winners', t1: `seed:${s1}`, t2: `seed:${s2}`, label: '' })
      r1Winners.push(`winner:${gn}`)
      gn++
    }

    let sources: string[]
    if (equalByes) {
      sources = []
      for (let i = 0; i < byeSeeds.length; i++) sources.push(byeSeeds[i], r1Winners[i])
    } else {
      sources = [...byeSeeds, ...r1Winners]
    }
    let round = 2
    let firstRound = true
    while (sources.length > 1) {
      const next: string[] = []
      const adj = equalByes && firstRound
      for (let i = 0; i < Math.floor(sources.length / 2); i++) {
        const s1 = adj ? sources[2 * i] : sources[i]
        const s2 = adj ? sources[2 * i + 1] : sources[sources.length - 1 - i]
        const isChamp = sources.length === 2
        games.push({ gameNumber: gn, round, section: isChamp ? 'championship' : 'winners', t1: s1, t2: s2, label: isChamp ? 'Championship' : '' })
        next.push(`winner:${gn}`)
        gn++
      }
      sources = next
      round++
      firstRound = false
    }
  }

  for (let i = 0; i < consolationCount; i++) {
    const s1 = n + 1 + i * 2
    const s2 = n + 2 + i * 2
    games.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `seed:${s1}`, t2: `seed:${s2}`, label: consolationCount > 1 ? `Consolation ${i + 1}` : 'Consolation' })
  }

  return games
}

export function generateOwes2(teamCount: number): Gen[] {
  // Three teams can't pair losers without a rematch or leaving the 1 seed on
  // one game, so the 1 seed plays the loser of 2 v 3 and then the final.
  if (teamCount === 3) return [
    { gameNumber: 1, round: 1, section: 'winners', t1: 'seed:2', t2: 'seed:3', label: '' },
    { gameNumber: 2, round: 1, section: 'consolation', t1: 'seed:1', t2: 'loser:1', label: 'Consolation' },
    { gameNumber: 3, round: 2, section: 'championship', t1: 'seed:1', t2: 'winner:1', label: 'Championship' },
  ]
  const games = generateSEGames(teamCount, 0)
  let gn = games.length + 1
  const isSeed = (x: string) => x.startsWith('seed:')
  const seedNum = (x: string) => parseInt(x.split(':')[1])
  const winnerFeeders = (g: Gen) => [g.t1, g.t2].filter(s => s.startsWith('winner:')).map(s => parseInt(s.split(':')[1]))
  // Two consolation entrants could replay their last game if one game's winner
  // feeds the other (e.g. L-B3 vs L-B4 where B3's winner plays in B4). Avoid those.
  const conflict = (a: Gen, b: Gen) => winnerFeeders(a).includes(b.gameNumber) || winnerFeeders(b).includes(a.gameNumber)
  const strength = (g: Gen) => { const s = [g.t1, g.t2].filter(isSeed).map(seedNum); return s.length ? Math.min(...s) : 999 }
  const both = (g: Gen) => isSeed(g.t1) && isSeed(g.t2)
  // Candidate games are those whose loser is owed a 2nd game (round-1 games and
  // the first game a bye seed plays). Pair them strongest-first, skipping rematches.
  const candidates = games.filter(g => isSeed(g.t1) || isSeed(g.t2)).sort((a, b) => strength(a) - strength(b))
  const extra: Gen[] = []
  const used = new Set<number>()
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i]
    if (used.has(a.gameNumber)) continue
    let partner: Gen | null = null
    for (let j = i + 1; j < candidates.length; j++) { const b = candidates[j]; if (used.has(b.gameNumber)) continue; if (!conflict(a, b)) { partner = b; break } }
    if (!partner) { for (let j = i + 1; j < candidates.length; j++) { const b = candidates[j]; if (!used.has(b.gameNumber)) { partner = b; break } } }
    if (partner) {
      used.add(a.gameNumber); used.add(partner.gameNumber)
      // A first-round loser always has just one game, so any game with one in it
      // is always played: it is a consolation game, not "If needed". (It was
      // labeled If needed unless BOTH sides were first-round losers, which told
      // the Scheduler a game a team is owed might be dropped.)
      const guaranteed = both(a) || both(partner)
      extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${a.gameNumber}`, t2: `loser:${partner.gameNumber}`, label: guaranteed ? 'Consolation' : 'If needed' })
    }
  }
  // Odd leftover: a contingency game against a non-conflicting opponent.
  const leftover = candidates.find(g => !used.has(g.gameNumber))
  if (leftover) {
    const opp = candidates.find(g => g.gameNumber !== leftover.gameNumber && !conflict(leftover, g)) || candidates.find(g => g.gameNumber !== leftover.gameNumber)
    if (opp) extra.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `loser:${leftover.gameNumber}`, t2: `loser:${opp.gameNumber}`, label: both(leftover) ? 'Consolation' : 'If needed' })
  }
  const consN = extra.filter(g => g.label === 'Consolation').length
  let cn = 1
  if (consN > 1) for (const g of extra) if (g.label === 'Consolation') g.label = `Consolation ${cn++}`
  return [...games, ...extra]
}

// Build a bracket template for one bracket (single flight or whole division).
export function buildTemplate(format: string, teamCount: number, consolationCount: number, loserConsolation: boolean): Gen[] {
  if (loserConsolation) return generateOwes2(teamCount)
  const rawTemplate = getTemplate(format, teamCount)
  // 2GG only has fixed templates for 4, 8 and 16 teams. Any other count fell
  // through to plain single elimination with no consolation games, so a 7-team
  // flight picked as 2GG left its first-round losers on one bracket game (Bo,
  // Oct 11 2026: "we need to guarantee 4 total games ... 2 bracket, 2 pool").
  // Build it with loser-fed consolation games instead, which gives every team
  // at least 2 bracket games for any count.
  if (!rawTemplate && format === '2gg') return generateOwes2(teamCount)
  if (rawTemplate) {
    const base: Gen[] = rawTemplate.map((g) => ({
      gameNumber: g.gameNumber, round: g.round,
      section: g.section as Sect, t1: g.t1, t2: g.t2, label: g.label || '',
    }))
    let gn = base.length + 1
    const cons: Gen[] = []
    for (let i = 0; i < consolationCount; i++) {
      cons.push({ gameNumber: gn++, round: 1, section: 'consolation', t1: `seed:${teamCount + 1 + i * 2}`, t2: `seed:${teamCount + 2 + i * 2}`, label: consolationCount > 1 ? `Consolation ${i + 1}` : 'Consolation' })
    }
    return [...base, ...cons]
  }
  return generateSEGames(teamCount, consolationCount)
}


/**
 * What a bracket would give: how many games, how many of them are "If needed",
 * and the fewest bracket games any team can end up with. A team's minimum
 * follows it through the bracket losing or winning whichever way leaves it
 * playing the least; "If needed" games count as played, because one is only
 * dropped when everyone in it already has enough. `teams` is how many teams the
 * division sends to this bracket: seeds the template never uses play 0 games.
 */
export interface BracketStats { games: number; ifNeeded: number; minPerTeam: number; short: number }
export function bracketStats(template: Gen[], teams: number, need = 2): BracketStats {
  const ifNeeded = template.filter(g => /\bif[\s-]*(needed|necessary)\b/i.test(g.label || '')).length
  const from = (src: string, depth: number): number => {
    if (depth > 12) return 0
    let total = 0
    for (const g of template) {
      if (g.t1 !== src && g.t2 !== src) continue
      total += 1 + Math.min(from(`winner:${g.gameNumber}`, depth + 1), from(`loser:${g.gameNumber}`, depth + 1))
    }
    return total
  }
  let minPerTeam = Infinity, short = 0
  for (let k = 1; k <= Math.max(1, teams); k++) {
    const n = from(`seed:${k}`, 0)
    minPerTeam = Math.min(minPerTeam, n)
    if (n < need) short++
  }
  return { games: template.length, ifNeeded, minPerTeam: minPerTeam === Infinity ? 0 : minPerTeam, short }
}
