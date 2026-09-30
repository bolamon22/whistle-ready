import { prisma } from '@/lib/db'
import { sendPushToFollowers } from '@/lib/follows'
import { isRealTeam } from '@/lib/autoSchedule'
import { nameKey } from '@/lib/names'
import { todayET } from '@/lib/publicView'

// Finals reach the phones following either team, the moment the score lands.
//
// Bo: "once the tournament's happening, they could be more automatic as games
// end." Schedule changes go through Publish because the week before an event
// is all shuffling; a final is different -- the game is over, the number is
// the number, and the parent in the parking lot wants it now. So this hangs
// off the score writes themselves, with three guards instead of a dialog:
//
//   * only when a final lands or changes (both scores set now, and either they
//     were not both set before or a number moved) -- a blur that re-saves the
//     same score, or one that fills in the first of two boxes, sends nothing;
//   * only during the event's dates, so scores typed in to test the page the
//     week before reach nobody;
//   * one tag per game, so a corrected score replaces the earlier alert on the
//     phone instead of stacking a second, contradictory one.
//
// Two tables hold finals -- Game (pool play and the scheduler's B# mirror of
// the bracket) and BracketGame (the bracket page) -- and nothing keeps their
// scores in step. The tag is built from tournament + division + game number,
// which both share, so a game scored in both places still shows once.

export type ScoreState = { score1?: number | null; score2?: number | null }

export type FinalGame = ScoreState & {
  tournamentId: string
  division: string
  /** "P12" for pool play, "B3" for a bracket game -- the scheduler's numbering. */
  gameNumber: string
  team1: string
  team2: string
  pool?: string | null
  /** YYYY-MM-DD; used only when the tournament has no dates of its own. */
  date?: string | null
  isCanceled?: boolean
  /** Where a tap lands. Defaults to the event's public page. */
  url?: string
}

const scored = (s: ScoreState) => s.score1 != null && s.score2 != null

/** Did this write make a final, or change one? */
export function finalChanged(before: ScoreState, after: ScoreState): boolean {
  if (!scored(after)) return false
  if (!scored(before)) return true
  return before.score1 !== after.score1 || before.score2 !== after.score2
}

/**
 * Is `today` one of the event's days? Uses startDate..endDate plus any listed
 * dates; a tournament with no dates at all falls back to the game's own date.
 * All plain YYYY-MM-DD strings, which compare correctly as text.
 */
export function duringEvent(
  t: { startDate?: string | null; endDate?: string | null; dates?: string | null },
  today: string,
  gameDate?: string | null,
): boolean {
  const valid = (d: unknown): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)
  let listed: unknown[] = []
  try { listed = JSON.parse(t.dates || '[]') } catch { /* ignore */ }
  const days = [t.startDate, t.endDate, ...(Array.isArray(listed) ? listed : [])].filter(valid).map(d => d.slice(0, 10)).sort()
  if (days.length) return today >= days[0] && today <= days[days.length - 1]
  return valid(gameDate) && gameDate.slice(0, 10) === today
}

export const finalTag = (g: Pick<FinalGame, 'tournamentId' | 'division' | 'gameNumber'>) =>
  `final:${g.tournamentId}:${nameKey(g.division)}:${g.gameNumber}`

export function finalPayload(g: FinalGame, tournamentName: string): { title: string; body: string; url: string; tag: string } {
  const where = [g.division, g.pool || (g.gameNumber.startsWith('B') ? 'Bracket' : ''), g.gameNumber ? `Game ${g.gameNumber}` : ''].filter(Boolean)
  return {
    title: `Final: ${g.team1} ${g.score1}, ${g.team2} ${g.score2}`,
    body: [tournamentName, ...where].join(' · '),
    url: g.url || `/tournaments/${g.tournamentId}/public`,
    tag: finalTag(g),
  }
}

/**
 * Tell the followers of both teams about a final, if this write made one.
 * Never throws and never blocks a score from saving: the score is the record,
 * the alert is a courtesy.
 */
export async function notifyFinal(before: ScoreState, after: FinalGame): Promise<{ sent: number; failed: number } | null> {
  try {
    if (after.isCanceled || !finalChanged(before, after)) return null
    if (!isRealTeam(after.team1) || !isRealTeam(after.team2)) return null
    const t = await prisma.tournament.findUnique({
      where: { id: after.tournamentId },
      select: { name: true, startDate: true, endDate: true, dates: true },
    })
    if (!t || !duringEvent(t, todayET(), after.date)) return null
    return await sendPushToFollowers(after.tournamentId, [after.team1, after.team2], finalPayload(after, t.name))
  } catch (e) {
    console.error('[finalAlerts] notifyFinal failed (non-blocking):', e)
    return null
  }
}
