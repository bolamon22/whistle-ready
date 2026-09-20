import type { Client } from '@libsql/client'

// THE ORG'S TRACK RECORD, COMPUTED ONCE.
//
// The front page band and /stats both show "tournaments run" and "games played", and
// they disagreed: 71 / 7,608 on the home page against 70 / 10,791 on the stats page, on
// the same day, for the same organization. Neither was lying -- they were two different
// sums. /stats folds an estimate for the editions that predate online scorekeeping into
// its headline (and says so underneath); the home page band counted only what is in the
// game table, and took its event count from the number typed into site settings rather
// than the one the series origins compute. A visitor comparing the two just sees a
// business that cannot count its own tournaments.
//
// The stats page had already learned this lesson internally -- its own headline and its
// per-series cards drifted apart once, for the same reason, and the fix was to derive
// both from one place. This is that fix applied across the two pages. Anything showing
// these numbers calls this; nothing recomputes them.
//
// Cheap enough for the front door: two aggregates over the org's own games, cached by
// each page's own revalidate.

// Bracket slots that were never filled are stored as the placeholder the bracket drew
// ("Seed 4", "W-B3", "Bracket Winner B7"). They are not teams and must not be counted
// as ones.
export const NOT_A_TEAM = `team <> '' AND team NOT LIKE 'TBD%' AND team NOT LIKE 'Bracket %'
  AND team NOT LIKE 'Seed %' AND team NOT LIKE 'W-B%' AND team NOT LIKE 'L-B%'
  AND team NOT LIKE 'Winner%' AND team NOT LIKE 'Loser%'`

const SERIES: [RegExp, string][] = [
  [/monster mash/i, 'Monster Mash'],
  [/fall classic/i, 'Fall Classic'],
  [/jingle brawl/i, 'Jingle Brawl'],
  [/summer kick ?off|sunshine state games/i, 'Summer Kick Off'],
]
export function seriesOf(name: string) { for (const [re, l] of SERIES) if (re.test(name)) return l; return 'Other' }

// When each series actually started, and the field it drew in the years before there was
// anything online to import. One edition a year, which is how these ran until 2015.
// Owner's recollection, not a record.
export const ORIGINS: Record<string, { from: number; teams: number; known?: Record<number, number> }> = {
  // `known` is a year counted off the paper records in the Drive archive but not imported
  // here, because that year's scoresheets were never filled in. The team count is a fact;
  // the result is not, so the year stays out of the game table.
  'Jingle Brawl':    { from: 2007, teams: 60, known: { 2010: 28, 2012: 53, 2013: 68, 2014: 57 } },
  'Summer Kick Off': { from: 2009, teams: 90 },
  'Monster Mash':    { from: 2009, teams: 60 },
  'Fall Classic':    { from: 2010, teams: 60 },
}

// Which editions are missing from the counted years, and roughly how many teams they
// brought. Derived from the years actually in the game table rather than from a start
// year, because the archive fills in from both ends: Jingle Brawl 2011 is imported while
// 2012-2014 are not, so "everything before the first counted year" would quietly drop
// three events. Import another year and this shrinks by itself.
export function priorTo(o: { from: number; teams: number; known?: Record<number, number> } | undefined,
                        counted: Set<string>, last: string) {
  if (!o) return { events: 0, teams: 0 }
  const end = Number(last) || new Date().getFullYear()
  const missing: number[] = []
  for (let y = o.from; y <= end; y++) if (!counted.has(String(y))) missing.push(y)
  // An unrecorded year is sized by the smallest year we do have a count for, not by the
  // typical field: these events grew, so the earliest ones were the smallest.
  const knownVals = Object.values(o.known || {})
  const floor = knownVals.length ? Math.min(...knownVals) : o.teams
  const teams = missing.reduce((sum, y) => sum + (o.known?.[y] ?? floor), 0)
  return { events: missing.length, teams }
}

export type Agg = { games: number; scored: number; goals: number; champs: number; teams: number; divisions: number }
export type SeriesAgg = { events: number; games: number; teams: number; champs: number; first: string; last: string; years: Set<string> }
export type PastEvent = { id: unknown; name?: unknown; startDate?: unknown; location?: unknown }

export type OrgHistory = {
  /** Straight from the game table — every figure here can be opened and checked. */
  counted: Agg
  per: Record<string, Agg>
  byYear: Map<string, { teams: number; games: number }>
  seriesRows: [string, SeriesAgg][]
  years: string[]
  venues: Set<string>
  firstCounted: string
  avgTeams: number
  goalsPerGame: string
  /** The estimate for editions that predate the scoresheets. */
  priorEvents: number
  priorTeams: number
  priorGames: number
  /** What the headline shows: counted plus estimate, except champions. */
  totalEvents: number
  totalGames: number
  totalTeams: number
  /** Never estimated — a winner cannot be guessed at. */
  champs: number
  estimated: boolean
}

const n = (v: unknown) => Number(v || 0)
const blank = (): Agg => ({ games: 0, scored: 0, goals: 0, champs: 0, teams: 0, divisions: 0 })

export async function computeOrgHistory(client: Client, past: PastEvent[], content: any): Promise<OrgHistory> {
  const ids = past.map(t => String(t.id))
  const per: Record<string, Agg> = {}
  const holes = ids.map(() => '?').join(',')

  if (ids.length) {
    const gRes = await client.execute({
      sql: `SELECT tournamentId,
              COUNT(*) AS games,
              SUM(CASE WHEN score1 IS NOT NULL AND score2 IS NOT NULL THEN 1 ELSE 0 END) AS scored,
              SUM(COALESCE(score1,0) + COALESCE(score2,0)) AS goals,
              SUM(CASE WHEN isChampionship = 1 AND score1 IS NOT NULL AND score2 IS NOT NULL AND score1 <> score2 THEN 1 ELSE 0 END) AS champs,
              COUNT(DISTINCT division) AS divisions
            FROM "Game" WHERE tournamentId IN (${holes}) AND (isCanceled IS NULL OR isCanceled = 0)
            GROUP BY tournamentId`, args: ids })
    for (const r of gRes.rows as any[]) {
      const a = per[String(r.tournamentId)] ||= blank()
      a.games = n(r.games); a.scored = n(r.scored); a.goals = n(r.goals); a.champs = n(r.champs); a.divisions = n(r.divisions)
    }
    // A team counted once per division per event: a club fielding a boys and a girls side
    // is two entries, the same side across nine games is one.
    const tmRes = await client.execute({
      sql: `SELECT tournamentId, COUNT(*) AS teams FROM (
              SELECT DISTINCT tournamentId, division, team FROM (
                SELECT tournamentId, division, TRIM(team1) AS team FROM "Game" WHERE tournamentId IN (${holes}) AND (isCanceled IS NULL OR isCanceled = 0)
                UNION
                SELECT tournamentId, division, TRIM(team2) AS team FROM "Game" WHERE tournamentId IN (${holes}) AND (isCanceled IS NULL OR isCanceled = 0)
              ) WHERE ${NOT_A_TEAM}
            ) GROUP BY tournamentId`, args: [...ids, ...ids] })
    for (const r of tmRes.rows as any[]) { const a = per[String(r.tournamentId)] ||= blank(); a.teams = n(r.teams) }
  }

  const counted = blank()
  const byYear = new Map<string, { teams: number; games: number }>()
  const bySeries = new Map<string, SeriesAgg>()
  const venues = new Set<string>()
  for (const t of past) {
    const a = per[String(t.id)] || blank()
    counted.games += a.games; counted.scored += a.scored; counted.goals += a.goals
    counted.champs += a.champs; counted.teams += a.teams; counted.divisions += a.divisions
    const y = String(t.startDate || '').slice(0, 4)
    if (y) { const e = byYear.get(y) || { teams: 0, games: 0 }; e.teams += a.teams; e.games += a.games; byYear.set(y, e) }
    const s = seriesOf(String(t.name || ''))
    const e = bySeries.get(s) || { events: 0, games: 0, teams: 0, champs: 0, first: '9999', last: '0', years: new Set<string>() }
    e.events++; e.games += a.games; e.teams += a.teams; e.champs += a.champs
    if (y) e.years.add(y)
    if (y && y < e.first) e.first = y
    if (y && y > e.last) e.last = y
    bySeries.set(s, e)
    const loc = String(t.location || '').split(/[,\/]/)[0].trim()
    if (loc) venues.add(loc)
  }

  const years = [...byYear.keys()].sort()
  const seriesRows = [...bySeries.entries()].sort((a, b) => b[1].games - a[1].games)

  // Summed from the same per-series gap the cards show, so the headline and the cards can
  // never disagree. The typed settings remain the fallback for an org with no ORIGINS entry.
  const gaps = seriesRows.map(([nm, v]) => priorTo(ORIGINS[nm], v.years, v.last))
  const gapEvents = gaps.reduce((a, g) => a + g.events, 0)
  const gapTeams = gaps.reduce((a, g) => a + g.teams, 0)
  const typed = (k: string) => Math.max(0, Number(String(content?.[k] || '').replace(/[^0-9]/g, '')) || 0)
  const priorEvents = gapEvents || typed('priorEvents')
  const priorTeams = gapTeams || typed('priorTeams')
  // Prior games are derived from the counted games-per-team ratio, so the estimate scales
  // with the prior-teams figure it is shown beside.
  const priorGames = seriesRows.reduce((sum, [nm, v]) => {
    const g = priorTo(ORIGINS[nm], v.years, v.last)
    return sum + (v.teams > 0 ? Math.round((v.games / v.teams) * g.teams) : 0)
  }, 0)

  return {
    counted, per, byYear, seriesRows, years, venues,
    firstCounted: years[0] || '',
    avgTeams: past.length ? Math.round(counted.teams / past.length) : 0,
    goalsPerGame: counted.scored ? (counted.goals / counted.scored).toFixed(1) : '0',
    priorEvents, priorTeams, priorGames,
    totalEvents: past.length + priorEvents,
    totalGames: counted.games + priorGames,
    totalTeams: counted.teams + priorTeams,
    champs: counted.champs,
    estimated: priorEvents > 0 || priorTeams > 0,
  }
}
