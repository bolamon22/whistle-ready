// Staff training videos (Oct 2026): short narrated how-tos filmed from the real
// Whistle Ready screens. The files are in public/training (<id>.mp4 + <id>.jpg
// poster). Each staff member sees the videos for their roles; watched ones are
// remembered per Worker (api/training) and counted on the Staff roster.
//
// Pure -- no database import -- so client pages can use it.

export type TrainingVideo = { id: string; num: string; title: string; blurb: string; secs: number; series?: 'staff' | 'ref' | 'assigner' }
export type TrainingGroup = { key: string; label: string; roles: string[] | null; ids: string[] }

export const TRAINING_VIDEOS: TrainingVideo[] = [
  { id: 'sign-up', num: '01', title: 'Sign up and get the app on your phone', blurb: 'The signup form, your photo, and adding Whistle Ready to your home screen.', secs: 59 },
  { id: 'home', num: '02', title: 'Your staff home page', blurb: 'Sign up to work an event, your W-9, Up next and your games.', secs: 50 },
  { id: 'staff-id', num: '03', title: 'Your staff ID', blurb: 'Apple Wallet, printing it, and wearing it all day.', secs: 38 },
  { id: 'keep-score', num: '04', title: 'Keep score live', blurb: 'Start the clock, add goals, fix a mistake, halftime and Save.', secs: 54 },
  { id: 'penalties', num: '05', title: 'Penalty time', blurb: 'Start a penalty, match the ref, and release the player.', secs: 48 },
  { id: 'scorer-settings', num: '05b', title: 'Scorer settings', blurb: 'Player numbers on goals, the penalty alert, keep screen on, period length.', secs: 50 },
  { id: 'post-final', num: '06', title: 'End the game and post the final', blurb: 'Check with the ref, ties and overtime, and posting the final.', secs: 47 },
  { id: 'field-request', num: '07', title: 'Send and answer a field request', blurb: 'Ask for a trainer, balls or a ref, and see who is on the way.', secs: 38 },
  { id: 'incidents', num: '08', title: 'Log an incident', blurb: 'Injuries, safety and facility problems, and complaints.', secs: 48 },
  { id: 'checklist', num: '09', title: 'The setup checklist', blurb: 'Check off setup items and add your own.', secs: 33 },
  { id: 'directory', num: '10', title: 'Find and call any staff member', blurb: 'Search the staff list, then call or text.', secs: 38 },
  { id: 'ref-games', num: 'R1', series: 'ref', title: 'Your games as a ref', blurb: 'Up next, your games by day, coaches, your crew to call or text, and your pay.', secs: 57 },
  { id: 'ref-find', num: 'R2', series: 'ref', title: 'Find your name on the schedule', blurb: 'All games with every official, Find my name, and search by team, coach or field.', secs: 40 },
  { id: 'ref-gameday', num: 'R3', series: 'ref', title: 'Game day as a ref', blurb: 'Field requests, staff contacts, live scoring if needed, rules and incidents.', secs: 48 },
  // Assigner training (Oct 13 2026): filmed on a computer screen, for the people who staff
  // Sunshine Events Group games.
  { id: 'asg-home', num: 'A01', series: 'assigner', title: 'Your assigner home', blurb: 'Your next event, how many games are reffed, and the five buttons.', secs: 50 },
  { id: 'asg-crew', num: 'A02', series: 'assigner', title: 'Build your crew', blurb: 'The Staff Pool, invites, the recruiting link and the letter to forward.', secs: 59 },
  { id: 'asg-roster', num: 'A03', series: 'assigner', title: 'Your tournament roster', blurb: 'Who is working the event, editing someone, filters and Exhibit A.', secs: 60 },
  { id: 'asg-out', num: 'A04', series: 'assigner', title: 'Who’s out', blurb: 'Mark officials out all day or for part of it.', secs: 32 },
  { id: 'asg-board', num: 'A05', series: 'assigner', title: 'Tour the Assigner board', blurb: 'Days, filters, min staff, density, folding and the other views.', secs: 63 },
  { id: 'asg-manual', num: 'A06', series: 'assigner', title: 'Assign officials manually', blurb: 'Drag a name or click a slot, busy and double-booked, refs per game.', secs: 65 },
  { id: 'asg-auto', num: 'A07', series: 'assigner', title: 'Auto-assign and Clear', blurb: 'Fill a day in seconds, preview the picks, and clearing a day.', secs: 63 },
  { id: 'asg-notify', num: 'A08', series: 'assigner', title: 'Notify your officials', blurb: 'Email each official their own games when the schedule is ready.', secs: 56 },
  { id: 'asg-check', num: 'A09', series: 'assigner', title: 'Check your work', blurb: 'By official: every crew, every person, and their pay.', secs: 37 },
  { id: 'asg-swaps', num: 'A10', series: 'assigner', title: 'Game-day swaps', blurb: 'Replace someone, fix a double-booking, lock the board.', secs: 43 },
  { id: 'asg-refneeded', num: 'A11', series: 'assigner', title: 'Ref needed alerts', blurb: 'Answer a Ref needed request on game day.', secs: 34 },
  { id: 'asg-pay', num: 'A12', series: 'assigner', title: 'Paying your officials', blurb: 'Totals, each official’s games, Mark Paid and CSV.', secs: 42 },
]

// roles: null = everyone. Worker roles: ref, scorekeeper, field_ops, athletic_trainer.
export const TRAINING_GROUPS: TrainingGroup[] = [
  { key: 'start', label: 'Start here', roles: null, ids: ['sign-up', 'home', 'staff-id', 'field-request', 'directory'] },
  { key: 'scorekeepers', label: 'Scorekeepers', roles: ['scorekeeper'], ids: ['keep-score', 'penalties', 'scorer-settings', 'post-final'] },
  { key: 'refs', label: 'Refs', roles: ['ref'], ids: ['ref-games', 'ref-find', 'ref-gameday', 'incidents'] },
  { key: 'fieldops', label: 'Field ops', roles: ['field_ops'], ids: ['checklist', 'incidents'] },
  { key: 'trainers', label: 'Athletic trainers', roles: ['athletic_trainer'], ids: ['incidents'] },
  { key: 'assigners', label: 'Assigners', roles: ['assigner'], ids: ['ref-games', 'ref-find', 'ref-gameday', 'asg-home', 'asg-crew', 'asg-roster', 'asg-out', 'asg-board', 'asg-manual', 'asg-auto', 'asg-notify', 'asg-check', 'asg-swaps', 'asg-refneeded', 'asg-pay'] },
]

export const trainingVideo = (id: string) => TRAINING_VIDEOS.find(v => v.id === id) || null
// Served only to signed-in staff (api/training/video/[id]), from videos/training -- not
// public/ -- so the videos can't be passed around or downloaded by link (Bo, Oct 13 2026).
export const videoSrc = (id: string) => `/api/training/video/${encodeURIComponent(id)}`
export const posterSrc = (id: string) => `/training/${id}.jpg`
export const minutesLabel = (secs: number) => (secs < 60 ? '1 min' : `${Math.round(secs / 60)} min`)

/** The groups a person with these roles should watch. No roles (a director, or a login
 *  without a Staff Pool record) = every group. */
export function groupsFor(roles: string[] | null | undefined): TrainingGroup[] {
  if (!roles || !roles.length) return TRAINING_GROUPS
  return TRAINING_GROUPS.filter(g => !g.roles || g.roles.some(r => roles.includes(r)))
}

/** The distinct video ids a person with these roles should watch, in order. */
export function videosFor(roles: string[] | null | undefined): string[] {
  return Array.from(new Set(groupsFor(roles).flatMap(g => g.ids)))
}

/** A Staff Pool person's training roles: their roles (JSON) or main role, plus 'assigner'
 *  when they assign. Takes the raw Worker row. */
export function workerRoles(w: { roles?: unknown; defaultRole?: unknown; isAssigner?: unknown }): string[] {
  let roles: string[] = []
  try { const r = JSON.parse(String(w.roles ?? '[]')); if (Array.isArray(r)) roles = r.map(String) } catch { /* none */ }
  if (!roles.length && w.defaultRole) roles = [String(w.defaultRole)]
  if (w.isAssigner === true || Number(w.isAssigner) === 1) roles.push('assigner')
  return Array.from(new Set(roles))
}

/** Who a video is for, in words, from the groups it's in. */
export const TRAINING_ROLE_LABELS: Record<string, string> = { ref: 'Refs', scorekeeper: 'Scorekeepers', field_ops: 'Field ops', athletic_trainer: 'Athletic trainers', assigner: 'Assigners' }
export function audienceFor(id: string): string {
  const gs = TRAINING_GROUPS.filter(g => g.ids.includes(id))
  if (gs.some(g => !g.roles)) return 'All staff'
  return Array.from(new Set(gs.flatMap(g => g.roles || []).map(r => TRAINING_ROLE_LABELS[r] || r))).join(', ')
}
