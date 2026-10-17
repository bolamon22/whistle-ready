// Whether an event's Assigner board shows score boxes on its game cards (Bo, Oct 17
// 2026: "Many of the assigners do not need to have scores on their referee schedule.
// That's just our tournaments, so we probably should make that customizable ... kind of
// like how we did the men's, women's, boys, or girls"). Asked on New Tournament and
// Edit, next to Teams. Not answered yet: on when the organization has the Scores
// add-on (lib/orgPlans), off when it doesn't.
//
// Pure: no database import, so client pages use it too. Stored by
// lib/eventScoresStore (AppSetting `eventScores:{tournamentId}`).

/** true = show scores, false = hide them, null = not answered (follow the add-on). */
export type ScoresChoice = boolean | null

export function cleanScores(v: unknown): ScoresChoice {
  if (v === true || v === 'on' || v === 'true') return true
  if (v === false || v === 'off' || v === 'false') return false
  return null
}

/** What the board does: the event's answer, else the Scores add-on. */
export function scoresShown(choice: unknown, planOff: string[] | undefined): boolean {
  const c = cleanScores(choice)
  return c ?? !(planOff || []).includes('scores')
}
