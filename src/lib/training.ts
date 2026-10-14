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
  { id: 'availability', num: '02b', title: 'Set your availability', blurb: 'Tell the assigner which days and game times you can work.', secs: 43 },
  { id: 'staff-id', num: '03', title: 'Your staff ID', blurb: 'Apple Wallet, printing it, and wearing it all day.', secs: 38 },
  { id: 'keep-score', num: '04', title: 'Keep score live', blurb: 'Start the clock, add goals, fix a mistake, halftime and Save.', secs: 54 },
  { id: 'penalties', num: '05', title: 'Penalty time', blurb: 'Start a penalty, match the ref, and release the player.', secs: 48 },
  { id: 'scorer-settings', num: '05b', title: 'Scorer settings', blurb: 'Player numbers on goals, the penalty alert, keep screen on, period length.', secs: 50 },
  { id: 'post-final', num: '06', title: 'End the game and post the final', blurb: 'Check with the ref, ties and overtime, and posting the final.', secs: 47 },
  { id: 'field-request', num: '07', title: 'Send and answer a field request', blurb: 'Ask for a trainer, balls or a ref, see who is on the way, and what to do if no one answers.', secs: 45 },
  { id: 'incidents', num: '08', title: 'Log an incident', blurb: 'Injuries, safety and facility problems, and complaints.', secs: 48 },
  { id: 'checklist', num: '09', title: 'The setup checklist', blurb: 'Check off setup items and add your own.', secs: 33 },
  { id: 'directory', num: '10', title: 'Find and call any staff member', blurb: 'Search the staff list, then call or text.', secs: 38 },
  { id: 'injury-report', num: '11', title: 'Log an injury', blurb: 'Who was hurt, a suspected concussion, treatment, parent told, follow-ups and the injury log.', secs: 73 },
  { id: 'trainer-call', num: '12', title: 'Answer a trainer call', blurb: 'Turn on game-day alerts, get the call, tap Respond, then log the injury.', secs: 57 },
  { id: 'game-day-prep', num: '13', title: 'Game day prep for scorekeepers', blurb: 'When to arrive, checking your field, covering breaks, and what to bring for a day outside.', secs: 76 },
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
  { id: 'asg-send', num: 'A13', series: 'assigner', title: 'Send training videos to your refs', blurb: 'Pick the event and your refs, the message, the preview, and Who’s watched.', secs: 58 },
]

// roles: null = everyone. Worker roles: ref, scorekeeper, field_ops, athletic_trainer.
export const TRAINING_GROUPS: TrainingGroup[] = [
  { key: 'start', label: 'Start here', roles: null, ids: ['sign-up', 'home', 'availability', 'staff-id', 'field-request', 'directory'] },
  { key: 'scorekeepers', label: 'Scorekeepers', roles: ['scorekeeper'], ids: ['game-day-prep', 'keep-score', 'penalties', 'scorer-settings', 'post-final'] },
  { key: 'refs', label: 'Refs', roles: ['ref'], ids: ['ref-games', 'ref-find', 'ref-gameday', 'incidents'] },
  { key: 'fieldops', label: 'Field ops', roles: ['field_ops'], ids: ['checklist', 'incidents'] },
  { key: 'trainers', label: 'Athletic trainers', roles: ['athletic_trainer'], ids: ['trainer-call', 'injury-report', 'incidents', 'field-request', 'directory'] },
  { key: 'assigners', label: 'Assigners', roles: ['assigner'], ids: ['ref-games', 'ref-find', 'ref-gameday', 'asg-home', 'asg-crew', 'asg-roster', 'asg-out', 'asg-board', 'asg-manual', 'asg-auto', 'asg-notify', 'asg-check', 'asg-swaps', 'asg-refneeded', 'asg-pay', 'asg-send'] },
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
export const TRAINING_ROLE_LABELS: Record<string, string> = { ref: 'Refs', ref_boys: 'Boys refs', ref_girls: 'Girls refs', scorekeeper: 'Scorekeepers', field_ops: 'Field ops', athletic_trainer: 'Athletic trainers', assigner: 'Assigners' }

/** Who a training email can go to. Refs split by the games they work (Bo, Oct 13 2026:
 *  a boys assigner and a girls assigner each send to their own refs). A ref set to
 *  "both" is in both groups. */
export const SEND_GROUPS = ['scorekeeper', 'ref_boys', 'ref_girls', 'field_ops', 'athletic_trainer', 'assigner']
export function inSendGroup(roles: string[], gender: unknown, key: string): boolean {
  const g = String(gender || 'both')
  if (key === 'ref_boys') return roles.includes('ref') && g !== 'girls'
  if (key === 'ref_girls') return roles.includes('ref') && g !== 'boys'
  return roles.includes(key)
}
export function audienceFor(id: string): string {
  const gs = TRAINING_GROUPS.filter(g => g.ids.includes(id))
  if (gs.some(g => !g.roles)) return 'All staff'
  return Array.from(new Set(gs.flatMap(g => g.roles || []).map(r => TRAINING_ROLE_LABELS[r] || r))).join(', ')
}

/** The suggested training email, filled in for the event and roles picked (Bo, Oct 13
 *  2026: "pre-filled ... pertinent to each event or the role", and he sees exactly what
 *  goes out). Only {firstName} is left to fill per person, at send time. The email's
 *  footer already says "Questions? Reply to this email", so the letter doesn't. */
const ROLE_LINES: Record<string, string> = {
  scorekeeper: 'They show when to arrive and what to bring, how to run the game clock, keep score, and post the final score from your phone.',
  ref: 'They show how to find your games and your crew, find your name on the schedule, and what to do on game day.',
  field_ops: 'They show the setup checklist, field requests, and how to reach anyone on staff.',
  athletic_trainer: 'They show how to log an injury report, field requests, and how to reach anyone on staff.',
  assigner: 'They walk through building your crew and assigning officials.',
}
export function trainingLetter(o: { eventName?: string; dates?: string; roles: string[]; sender?: string; count: number }): { subject: string; body: string } {
  const PLURAL: Record<string, string> = { ref_boys: 'officials for the boys\u2019 games', ref_girls: 'officials for the girls\u2019 games' }
  const plural = o.roles.length === 1 ? (PLURAL[o.roles[0]] || (TRAINING_ROLE_LABELS[o.roles[0]] || '').toLowerCase()) : ''
  const these = o.count === 1 ? 'this short video' : 'these short videos'
  const thanks = o.eventName
    ? `Thanks for working ${o.eventName}${o.dates ? ` (${o.dates})` : ''}${plural ? ` as one of our ${plural}` : ''}. Please watch ${these} before the event.`
    : `Please watch ${these} before your next event${plural ? ` as one of our ${plural}` : ''}.`
  const line = (o.roles.length === 1 && (ROLE_LINES[o.roles[0]] || ROLE_LINES[o.roles[0].replace(/_(boys|girls)$/, '')])) || 'They show exactly what you’ll do in the app on game day.'
  const body = [`Hi {firstName},`, `${thanks} Each one is about a minute. ${line}`, o.sender ? `Thanks,\n${o.sender}` : ''].filter(Boolean).join('\n\n')
  const subject = o.eventName ? `${o.eventName}: your training videos` : 'Your Whistle Ready training videos'
  return { subject, body }
}
