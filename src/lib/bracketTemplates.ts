// Bracket template definitions for single/double elimination and 2-game guarantee

export interface GameTemplate {
  gameNumber: number
  round: number
  section: 'winners' | 'losers' | 'consolation' | 'championship'
  t1: string   // 'seed:N', 'winner:N', 'loser:N'
  t2: string
  label?: string
}

export interface TemplateCatalogEntry {
  key: string
  label: string
  teamCount: number
  gameCount: number
  description: string
  format: 'single' | 'double' | '2gg'
}

// ── Single Elimination ──────────────────────────────────────────────

const SE4: GameTemplate[] = [
  { gameNumber: 1, round: 1, section: 'winners', t1: 'seed:1', t2: 'seed:4' },
  { gameNumber: 2, round: 1, section: 'winners', t1: 'seed:2', t2: 'seed:3' },
  { gameNumber: 3, round: 2, section: 'championship', t1: 'winner:1', t2: 'winner:2', label: 'Championship' },
]

const SE8: GameTemplate[] = [
  { gameNumber: 1, round: 1, section: 'winners', t1: 'seed:1', t2: 'seed:8' },
  { gameNumber: 2, round: 1, section: 'winners', t1: 'seed:4', t2: 'seed:5' },
  { gameNumber: 3, round: 1, section: 'winners', t1: 'seed:2', t2: 'seed:7' },
  { gameNumber: 4, round: 1, section: 'winners', t1: 'seed:3', t2: 'seed:6' },
  { gameNumber: 5, round: 2, section: 'winners', t1: 'winner:1', t2: 'winner:2' },
  { gameNumber: 6, round: 2, section: 'winners', t1: 'winner:3', t2: 'winner:4' },
  { gameNumber: 7, round: 3, section: 'championship', t1: 'winner:5', t2: 'winner:6', label: 'Championship' },
]

const SE16: GameTemplate[] = [
  { gameNumber: 1,  round: 1, section: 'winners', t1: 'seed:1',  t2: 'seed:16' },
  { gameNumber: 2,  round: 1, section: 'winners', t1: 'seed:8',  t2: 'seed:9'  },
  { gameNumber: 3,  round: 1, section: 'winners', t1: 'seed:4',  t2: 'seed:13' },
  { gameNumber: 4,  round: 1, section: 'winners', t1: 'seed:5',  t2: 'seed:12' },
  { gameNumber: 5,  round: 1, section: 'winners', t1: 'seed:2',  t2: 'seed:15' },
  { gameNumber: 6,  round: 1, section: 'winners', t1: 'seed:7',  t2: 'seed:10' },
  { gameNumber: 7,  round: 1, section: 'winners', t1: 'seed:3',  t2: 'seed:14' },
  { gameNumber: 8,  round: 1, section: 'winners', t1: 'seed:6',  t2: 'seed:11' },
  { gameNumber: 9,  round: 2, section: 'winners', t1: 'winner:1', t2: 'winner:2' },
  { gameNumber: 10, round: 2, section: 'winners', t1: 'winner:3', t2: 'winner:4' },
  { gameNumber: 11, round: 2, section: 'winners', t1: 'winner:5', t2: 'winner:6' },
  { gameNumber: 12, round: 2, section: 'winners', t1: 'winner:7', t2: 'winner:8' },
  { gameNumber: 13, round: 3, section: 'winners', t1: 'winner:9',  t2: 'winner:10' },
  { gameNumber: 14, round: 3, section: 'winners', t1: 'winner:11', t2: 'winner:12' },
  { gameNumber: 15, round: 4, section: 'championship', t1: 'winner:13', t2: 'winner:14', label: 'Championship' },
]

// ── Single Elim + 3rd Place ─────────────────────────────────────────

const SE4_CON: GameTemplate[] = [
  { gameNumber: 1, round: 1, section: 'winners', t1: 'seed:1', t2: 'seed:4' },
  { gameNumber: 2, round: 1, section: 'winners', t1: 'seed:2', t2: 'seed:3' },
  { gameNumber: 3, round: 2, section: 'championship', t1: 'winner:1', t2: 'winner:2', label: 'Championship' },
  { gameNumber: 4, round: 2, section: 'consolation', t1: 'loser:1',  t2: 'loser:2',  label: '3rd Place' },
]

const SE8_CON: GameTemplate[] = [
  { gameNumber: 1, round: 1, section: 'winners', t1: 'seed:1', t2: 'seed:8' },
  { gameNumber: 2, round: 1, section: 'winners', t1: 'seed:4', t2: 'seed:5' },
  { gameNumber: 3, round: 1, section: 'winners', t1: 'seed:2', t2: 'seed:7' },
  { gameNumber: 4, round: 1, section: 'winners', t1: 'seed:3', t2: 'seed:6' },
  { gameNumber: 5, round: 2, section: 'winners', t1: 'winner:1', t2: 'winner:2' },
  { gameNumber: 6, round: 2, section: 'winners', t1: 'winner:3', t2: 'winner:4' },
  { gameNumber: 7, round: 3, section: 'championship', t1: 'winner:5', t2: 'winner:6', label: 'Championship' },
  { gameNumber: 8, round: 3, section: 'consolation',  t1: 'loser:5',  t2: 'loser:6',  label: '3rd Place' },
]

const SE16_CON: GameTemplate[] = [
  { gameNumber: 1,  round: 1, section: 'winners', t1: 'seed:1',  t2: 'seed:16' },
  { gameNumber: 2,  round: 1, section: 'winners', t1: 'seed:8',  t2: 'seed:9'  },
  { gameNumber: 3,  round: 1, section: 'winners', t1: 'seed:4',  t2: 'seed:13' },
  { gameNumber: 4,  round: 1, section: 'winners', t1: 'seed:5',  t2: 'seed:12' },
  { gameNumber: 5,  round: 1, section: 'winners', t1: 'seed:2',  t2: 'seed:15' },
  { gameNumber: 6,  round: 1, section: 'winners', t1: 'seed:7',  t2: 'seed:10' },
  { gameNumber: 7,  round: 1, section: 'winners', t1: 'seed:3',  t2: 'seed:14' },
  { gameNumber: 8,  round: 1, section: 'winners', t1: 'seed:6',  t2: 'seed:11' },
  { gameNumber: 9,  round: 2, section: 'winners', t1: 'winner:1', t2: 'winner:2' },
  { gameNumber: 10, round: 2, section: 'winners', t1: 'winner:3', t2: 'winner:4' },
  { gameNumber: 11, round: 2, section: 'winners', t1: 'winner:5', t2: 'winner:6' },
  { gameNumber: 12, round: 2, section: 'winners', t1: 'winner:7', t2: 'winner:8' },
  { gameNumber: 13, round: 3, section: 'winners', t1: 'winner:9',  t2: 'winner:10' },
  { gameNumber: 14, round: 3, section: 'winners', t1: 'winner:11', t2: 'winner:12' },
  { gameNumber: 15, round: 4, section: 'championship', t1: 'winner:13', t2: 'winner:14', label: 'Championship' },
  { gameNumber: 16, round: 4, section: 'consolation',  t1: 'loser:13',  t2: 'loser:14',  label: '3rd Place' },
]

// ── Double Elimination ──────────────────────────────────────────────

const DE4: GameTemplate[] = [
  { gameNumber: 1, round: 1, section: 'winners', t1: 'seed:1', t2: 'seed:4' },
  { gameNumber: 2, round: 1, section: 'winners', t1: 'seed:2', t2: 'seed:3' },
  { gameNumber: 3, round: 2, section: 'winners',  t1: 'winner:1', t2: 'winner:2', label: "Winners' Final" },
  { gameNumber: 4, round: 2, section: 'losers',   t1: 'loser:1',  t2: 'loser:2'  },
  { gameNumber: 5, round: 3, section: 'losers',   t1: 'loser:3',  t2: 'winner:4', label: "Losers' Final" },
  { gameNumber: 6, round: 4, section: 'championship', t1: 'winner:3', t2: 'winner:5', label: 'Championship' },
]

const DE8: GameTemplate[] = [
  { gameNumber: 1, round: 1, section: 'winners', t1: 'seed:1', t2: 'seed:8' },
  { gameNumber: 2, round: 1, section: 'winners', t1: 'seed:4', t2: 'seed:5' },
  { gameNumber: 3, round: 1, section: 'winners', t1: 'seed:2', t2: 'seed:7' },
  { gameNumber: 4, round: 1, section: 'winners', t1: 'seed:3', t2: 'seed:6' },
  { gameNumber: 5, round: 2, section: 'winners', t1: 'winner:1', t2: 'winner:2' },
  { gameNumber: 6, round: 2, section: 'winners', t1: 'winner:3', t2: 'winner:4' },
  { gameNumber: 7, round: 3, section: 'winners', t1: 'winner:5', t2: 'winner:6', label: "Winners' Final" },
  { gameNumber: 8,  round: 2, section: 'losers', t1: 'loser:1',  t2: 'loser:2'  },
  { gameNumber: 9,  round: 2, section: 'losers', t1: 'loser:3',  t2: 'loser:4'  },
  { gameNumber: 10, round: 3, section: 'losers', t1: 'loser:5',  t2: 'winner:8' },
  { gameNumber: 11, round: 3, section: 'losers', t1: 'loser:6',  t2: 'winner:9' },
  { gameNumber: 12, round: 4, section: 'losers', t1: 'winner:10', t2: 'winner:11' },
  { gameNumber: 13, round: 5, section: 'losers', t1: 'loser:7',   t2: 'winner:12', label: "Losers' Final" },
  { gameNumber: 14, round: 6, section: 'championship', t1: 'winner:7', t2: 'winner:13', label: 'Championship' },
]

// ── 2-Game Guarantee ────────────────────────────────────────────────
// Every team plays at least 2 games. R1 losers get a consolation game.

const GG2_4: GameTemplate[] = [
  { gameNumber: 1, round: 1, section: 'winners',      t1: 'seed:1',   t2: 'seed:4'   },
  { gameNumber: 2, round: 1, section: 'winners',      t1: 'seed:2',   t2: 'seed:3'   },
  { gameNumber: 3, round: 2, section: 'championship', t1: 'winner:1', t2: 'winner:2', label: 'Championship' },
  { gameNumber: 4, round: 2, section: 'consolation',  t1: 'loser:1',  t2: 'loser:2',  label: '3rd Place' },
]

const GG2_8: GameTemplate[] = [
  // Round 1 — seeded
  { gameNumber: 1, round: 1, section: 'winners', t1: 'seed:1', t2: 'seed:8' },
  { gameNumber: 2, round: 1, section: 'winners', t1: 'seed:4', t2: 'seed:5' },
  { gameNumber: 3, round: 1, section: 'winners', t1: 'seed:2', t2: 'seed:7' },
  { gameNumber: 4, round: 1, section: 'winners', t1: 'seed:3', t2: 'seed:6' },
  // Round 2 — winners bracket semis
  { gameNumber: 5, round: 2, section: 'winners', t1: 'winner:1', t2: 'winner:2' },
  { gameNumber: 6, round: 2, section: 'winners', t1: 'winner:3', t2: 'winner:4' },
  // Round 2 — consolation (R1 losers guaranteed 2nd game)
  { gameNumber: 7, round: 2, section: 'consolation', t1: 'loser:1', t2: 'loser:2' },
  { gameNumber: 8, round: 2, section: 'consolation', t1: 'loser:3', t2: 'loser:4' },
  // Round 3 — championship + placements
  { gameNumber: 9,  round: 3, section: 'championship', t1: 'winner:5', t2: 'winner:6', label: 'Championship' },
  { gameNumber: 10, round: 3, section: 'consolation',  t1: 'loser:5',  t2: 'loser:6',  label: '3rd Place' },
  { gameNumber: 11, round: 3, section: 'consolation',  t1: 'winner:7', t2: 'winner:8', label: 'Consolation Championship' },
]

const GG2_16: GameTemplate[] = [
  // Round 1
  { gameNumber: 1,  round: 1, section: 'winners', t1: 'seed:1',  t2: 'seed:16' },
  { gameNumber: 2,  round: 1, section: 'winners', t1: 'seed:8',  t2: 'seed:9'  },
  { gameNumber: 3,  round: 1, section: 'winners', t1: 'seed:4',  t2: 'seed:13' },
  { gameNumber: 4,  round: 1, section: 'winners', t1: 'seed:5',  t2: 'seed:12' },
  { gameNumber: 5,  round: 1, section: 'winners', t1: 'seed:2',  t2: 'seed:15' },
  { gameNumber: 6,  round: 1, section: 'winners', t1: 'seed:7',  t2: 'seed:10' },
  { gameNumber: 7,  round: 1, section: 'winners', t1: 'seed:3',  t2: 'seed:14' },
  { gameNumber: 8,  round: 1, section: 'winners', t1: 'seed:6',  t2: 'seed:11' },
  // Round 2 — winners bracket quarters
  { gameNumber: 9,  round: 2, section: 'winners', t1: 'winner:1', t2: 'winner:2' },
  { gameNumber: 10, round: 2, section: 'winners', t1: 'winner:3', t2: 'winner:4' },
  { gameNumber: 11, round: 2, section: 'winners', t1: 'winner:5', t2: 'winner:6' },
  { gameNumber: 12, round: 2, section: 'winners', t1: 'winner:7', t2: 'winner:8' },
  // Round 2 — consolation (R1 losers guaranteed 2nd game)
  { gameNumber: 13, round: 2, section: 'consolation', t1: 'loser:1', t2: 'loser:2' },
  { gameNumber: 14, round: 2, section: 'consolation', t1: 'loser:3', t2: 'loser:4' },
  { gameNumber: 15, round: 2, section: 'consolation', t1: 'loser:5', t2: 'loser:6' },
  { gameNumber: 16, round: 2, section: 'consolation', t1: 'loser:7', t2: 'loser:8' },
  // Round 3 — winners bracket semis
  { gameNumber: 17, round: 3, section: 'winners', t1: 'winner:9',  t2: 'winner:10' },
  { gameNumber: 18, round: 3, section: 'winners', t1: 'winner:11', t2: 'winner:12' },
  // Round 3 — consolation semis
  { gameNumber: 19, round: 3, section: 'consolation', t1: 'winner:13', t2: 'winner:14' },
  { gameNumber: 20, round: 3, section: 'consolation', t1: 'winner:15', t2: 'winner:16' },
  // Round 4 — championship + placements
  { gameNumber: 21, round: 4, section: 'championship', t1: 'winner:17', t2: 'winner:18', label: 'Championship' },
  { gameNumber: 22, round: 4, section: 'consolation',  t1: 'loser:17',  t2: 'loser:18',  label: '3rd Place' },
  { gameNumber: 23, round: 4, section: 'consolation',  t1: 'winner:19', t2: 'winner:20', label: 'Consolation Championship' },
]

// ── Registry ────────────────────────────────────────────────────────

export const BRACKET_TEMPLATES: Record<string, GameTemplate[]> = {
  'single-4':      SE4,
  'single-8':      SE8,
  'single-16':     SE16,
  'single-4-con':  SE4_CON,
  'single-8-con':  SE8_CON,
  'single-16-con': SE16_CON,
  'double-4':      DE4,
  'double-8':      DE8,
  '2gg-4':         GG2_4,
  '2gg-8':         GG2_8,
  '2gg-16':        GG2_16,
}

export const TEMPLATE_CATALOG: TemplateCatalogEntry[] = [
  { key: 'single-4',      label: 'Single Elimination',       teamCount: 4,  gameCount: 3,  description: '3 games · 1 champion',                       format: 'single' },
  { key: 'single-8',      label: 'Single Elimination',       teamCount: 8,  gameCount: 7,  description: '7 games · 1 champion',                       format: 'single' },
  { key: 'single-16',     label: 'Single Elimination',       teamCount: 16, gameCount: 15, description: '15 games · 1 champion',                      format: 'single' },
  { key: 'single-4-con',  label: 'Single Elim + 3rd Place',  teamCount: 4,  gameCount: 4,  description: '4 games · championship + 3rd place',         format: 'single' },
  { key: 'single-8-con',  label: 'Single Elim + 3rd Place',  teamCount: 8,  gameCount: 8,  description: '8 games · championship + 3rd place',         format: 'single' },
  { key: 'single-16-con', label: 'Single Elim + 3rd Place',  teamCount: 16, gameCount: 16, description: '16 games · championship + 3rd place',        format: 'single' },
  { key: 'double-4',      label: 'Double Elimination',       teamCount: 4,  gameCount: 6,  description: '6 games · must lose twice to be eliminated',  format: 'double' },
  { key: 'double-8',      label: 'Double Elimination',       teamCount: 8,  gameCount: 14, description: '14 games · must lose twice to be eliminated', format: 'double' },
  { key: '2gg-4',         label: '2-Game Guarantee',         teamCount: 4,  gameCount: 4,  description: '4 games · every team plays at least 2',       format: '2gg'    },
  { key: '2gg-8',         label: '2-Game Guarantee',         teamCount: 8,  gameCount: 11, description: '11 games · every team plays at least 2',      format: '2gg'    },
  { key: '2gg-16',        label: '2-Game Guarantee',         teamCount: 16, gameCount: 23, description: '23 games · every team plays at least 2',      format: '2gg'    },
]

export function getTemplate(format: string, teamCount: number): GameTemplate[] | null {
  return BRACKET_TEMPLATES[`${format}-${teamCount}`] ?? null
}

export function resolveTeam(
  source: string,
  seeds: Record<string, string>,
  games: Array<{ gameNumber: number; winner: string; loser: string }>
): string {
  if (!source) return ''
  const [type, ref] = source.split(':')
  const n = parseInt(ref)
  if (type === 'seed')   return seeds[String(n)] || `Seed ${n}`
  if (type === 'winner') return games.find(g => g.gameNumber === n)?.winner || ''
  if (type === 'loser')  return games.find(g => g.gameNumber === n)?.loser  || ''
  return ''
}
