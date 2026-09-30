// What a follower hears when the schedule is published.
//
// Bo publishes the schedule several times the week of an event, moving games
// around each time. Followers must not get one alert per moved game -- five
// publishes could mean thirty pings, and "you moved my game five times" is the
// complaint this exists to avoid. So the unit is the TEAM, not the game: each
// affected team's followers get one message carrying that team's schedule as it
// stands now. A phone following two affected teams gets two messages, one per
// team, because the two kids play at different times.
//
// Pure: takes the games before and after, says who is affected and what to tell
// them. The route decides whether to send at all -- that is Bo's checkbox.

export type DigestGame = {
  id: string
  gameNumber?: string
  date: string
  startTime: string
  location: string
  division: string
  team1: string
  team2: string
  isCanceled?: boolean
}

/** Bracket slots ("Seed 3", "W-B2", "TBD") are positions, not teams. */
const PLACEHOLDER = /^(seed\s|w-b|l-b|bracket\b|winner\b|loser\b|tbd$)/i
export const isPlaceholder = (n: string) => !n || !n.trim() || PLACEHOLDER.test(n.trim())

const scheduled = (g: { date?: string; startTime?: string; location?: string }) => !!(g.date && g.startTime && g.location)

/** Minutes since midnight from either "09:40" or "9:40 AM"; games are sorted
 *  by this, never by the clock string -- "2:00 PM" sorts before "8:20 AM" as
 *  text, and the first version of this file did exactly that. */
export function toMinutes(time: string): number {
  let t = String(time || '').trim().toUpperCase(); let ap: 'AM' | 'PM' | null = null
  if (t.endsWith('AM')) { ap = 'AM'; t = t.slice(0, -2).trim() } else if (t.endsWith('PM')) { ap = 'PM'; t = t.slice(0, -2).trim() }
  const [hs, ms] = t.split(':'); let h = parseInt(hs) || 0; const mm = parseInt(ms) || 0
  if (ap === 'PM' && h < 12) h += 12
  if (ap === 'AM' && h === 12) h = 0
  return h * 60 + mm
}

/** "Sat 9:40 AM" from a YYYY-MM-DD and a time. Date parts are split by hand:
 *  new Date('2026-10-24') is UTC midnight and prints Friday in every US zone. */
export function fmtWhen(date: string, time: string): string {
  const [y, m, d] = String(date || '').split('-').map(Number)
  const day = y && m && d ? new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' }) : ''
  const mins = toMinutes(time); const h = Math.floor(mins / 60), mm = mins % 60
  const clock = `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
  return day ? `${day} ${clock}` : clock
}

const sortKey = (g: DigestGame) => `${g.date} ${String(toMinutes(g.startTime)).padStart(4, '0')}`

/**
 * Teams whose schedule changed between `before` (the last published snapshot,
 * keyed by game id) and `after` (the games as they are now). A game counts as
 * changed when it was placed, pulled, or moved to another date, time or field.
 * On a first publish (`before` is null) every team with a scheduled game is
 * affected -- that is the "schedule is out" moment.
 */
export function affectedTeams(
  before: Record<string, { date: string; startTime: string; location: string }> | null,
  after: DigestGame[],
): string[] {
  const teams = new Set<string>()
  for (const g of after) {
    if (g.isCanceled) continue
    const now = scheduled(g)
    const was = before ? scheduled(before[g.id] || {}) : false
    let changed: boolean
    if (!before) changed = now
    else if (now && was) { const b = before[g.id]; changed = b.date !== g.date || b.startTime !== g.startTime || b.location !== g.location }
    else changed = now !== was
    if (!changed) continue
    for (const t of [g.team1, g.team2]) if (!isPlaceholder(t)) teams.add(t.trim())
  }
  // A game that was published and has since been deleted outright: its teams
  // are affected too, but the game is not in `after` to tell us who they were.
  // The snapshot only stores times, not teams, so that case is invisible here;
  // deleting a team's games (lib/teamRename.removeTeamRefs) is the usual cause,
  // and that team has no followers to tell.
  return Array.from(teams).sort((a, b) => a.localeCompare(b))
}

export type TeamDigest = { team: string; title: string; body: string; tag: string }

const MAX_LINES = 3

/**
 * The message for one team: its scheduled games, soonest first, up to three,
 * then "+N more". Teams with nothing scheduled right now get no message --
 * there is nothing to tell them yet, and "no games" would read as bad news.
 */
export function teamDigest(team: string, games: DigestGame[], o: { tournamentId: string; tournamentName: string; firstPublish: boolean }): TeamDigest | null {
  const mine = games
    .filter(g => !g.isCanceled && scheduled(g) && (g.team1 === team || g.team2 === team))
    .sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1))
  if (!mine.length) return null
  const lines = mine.slice(0, MAX_LINES).map(g => {
    const opp = g.team1 === team ? g.team2 : g.team1
    const vs = isPlaceholder(opp) ? '' : ` vs ${opp}`
    return `${fmtWhen(g.date, g.startTime)} · ${g.location}${vs}`
  })
  if (mine.length > MAX_LINES) lines.push(`+${mine.length - MAX_LINES} more`)
  return {
    team,
    title: o.firstPublish ? `${o.tournamentName} schedule is out` : `${team}: schedule updated`,
    // The team leads the body on a first publish because the title names the
    // event, and a phone following two teams gets two of these.
    body: (o.firstPublish ? `${team}\n` : '') + lines.join('\n'),
    // One tag per team per event: a republish replaces the last alert on the
    // phone instead of stacking a new one under it.
    tag: `sched:${o.tournamentId}:${team}`,
  }
}
