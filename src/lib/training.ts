// Staff training videos (Oct 2026): short narrated how-tos filmed from the real
// Whistle Ready screens. The files are in public/training (<id>.mp4 + <id>.jpg
// poster). Each staff member sees the videos for their roles; watched ones are
// remembered per Worker (api/training) and counted on the Staff roster.
//
// Pure -- no database import -- so client pages can use it.

export type TrainingVideo = { id: string; num: string; title: string; blurb: string; secs: number; series?: 'staff' | 'ref' | 'assigner' | 'director' | 'scheduler' }
export type TrainingGroup = { key: string; label: string; roles: string[] | null; ids: string[] }

export const TRAINING_VIDEOS: TrainingVideo[] = [
  { id: 'sign-up', num: '01', title: 'Sign up and get the app on your phone', blurb: 'The signup form, your photo, and adding Whistle Ready to your home screen.', secs: 59 },
  { id: 'home', num: '02', title: 'Your staff home page', blurb: 'Sign up to work an event and answer its days, your W-9, Up next and your games.', secs: 68 },
  { id: 'availability', num: '02b', title: 'Set your availability', blurb: 'Answer each day: All day, Morning, Afternoon or Can’t work, or narrow a day to the times you’re free. Each day locks 48 hours before it.', secs: 64 },
  { id: 'staff-id', num: '03', title: 'Your staff ID', blurb: 'Apple Wallet, printing it, and wearing it all day.', secs: 38 },
  { id: 'keep-score', num: '04', title: 'Keep score live', blurb: 'Start the clock, add goals, fix a mistake, halftime and Save.', secs: 54 },
  { id: 'penalties', num: '05', title: 'Penalty time', blurb: 'Start a penalty, match the ref, and release the player.', secs: 48 },
  { id: 'scorer-settings', num: '05b', title: 'Scorer settings', blurb: 'Player numbers on goals, the penalty alert, keep screen on, period length.', secs: 50 },
  { id: 'post-final', num: '06', title: 'End the game and post the final', blurb: 'Check with the ref, ties and overtime, and posting the final.', secs: 47 },
  { id: 'field-request', num: '07', title: 'Send and answer a field request', blurb: 'Ask for a trainer, balls or a ref, see who is on the way, and what to do if no one answers.', secs: 46 },
  { id: 'incidents', num: '08', title: 'Log an incident', blurb: 'Injuries, safety and facility problems, and complaints.', secs: 48 },
  { id: 'checklist', num: '09', title: 'The setup checklist', blurb: 'Check off setup items and add your own.', secs: 34 },
  { id: 'directory', num: '10', title: 'Find and call any staff member', blurb: 'Search the staff list, then call or text.', secs: 38 },
  { id: 'injury-report', num: '11', title: 'Log an injury', blurb: 'Who was hurt, a suspected concussion, treatment, parent told, follow-ups and the injury log.', secs: 74 },
  { id: 'trainer-call', num: '12', title: 'Answer a trainer call', blurb: 'Turn on game-day alerts, get the call, tap Respond, then log the injury.', secs: 58 },
  { id: 'game-day-prep', num: '13', title: 'Game day prep for scorekeepers', blurb: 'When to arrive, checking your field and its flip score chart, covering breaks, and what to bring for a day outside.', secs: 83 },
  { id: 'ref-games', num: 'R1', series: 'ref', title: 'Your games as a ref', blurb: 'Up next, your games by day, coaches, your crew to call or text, and your pay.', secs: 58 },
  { id: 'ref-find', num: 'R2', series: 'ref', title: 'Find your name on the schedule', blurb: 'All games with every official, Find my name, and search by team, coach or field.', secs: 41 },
  { id: 'ref-gameday', num: 'R3', series: 'ref', title: 'Game day as a ref', blurb: 'Field requests, staff contacts, live scoring if needed, rules and incidents.', secs: 49 },
  // Assigner training (Oct 13 2026): filmed on a computer screen, for the people who staff
  // Sunshine Events Group games.
  { id: 'asg-home', num: 'A01', series: 'assigner', title: 'Your assigner home', blurb: 'Your next event, how many games are reffed, and the six buttons.', secs: 55 },
  { id: 'asg-crew', num: 'A02', series: 'assigner', title: 'Build your crew', blurb: 'The Staff Pool, invites, the recruiting link and the letter to forward.', secs: 61 },
  { id: 'asg-roster', num: 'A03', series: 'assigner', title: 'Your tournament roster', blurb: 'Who is working the event, editing someone, filters and Exhibit A.', secs: 62 },
  { id: 'asg-out', num: 'A04', series: 'assigner', title: 'Who can work, and who hasn’t answered', blurb: 'The Availability page: who answered, ref coverage, setting an answer for someone, and emailing who hasn’t answered.', secs: 65 },
  { id: 'asg-board', num: 'A05', series: 'assigner', title: 'Tour the Assigner board', blurb: 'Days, Needs crew and Conflicts, card size, the Layout menu, the Staffing panel and the other views.', secs: 83 },
  { id: 'asg-manual', num: 'A06', series: 'assigner', title: 'Assign officials manually', blurb: 'Open Staffing, drag a name or click a slot, busy and double-booked, refs per game.', secs: 68 },
  { id: 'asg-auto', num: 'A07', series: 'assigner', title: 'Auto-assign and Clear', blurb: 'Tick what to fill, preview the picks, and Clear assignments from the more menu.', secs: 70 },
  { id: 'asg-notify', num: 'A08', series: 'assigner', title: 'Notify your officials', blurb: 'Email each official their own games, and ask them to confirm by a date.', secs: 67 },
  { id: 'asg-check', num: 'A09', series: 'assigner', title: 'Check your work', blurb: 'By official: every crew, every person, and their pay.', secs: 39 },
  { id: 'asg-swaps', num: 'A10', series: 'assigner', title: 'Game-day swaps', blurb: 'Replace someone, fix a conflict, and Lock editing from the more menu.', secs: 46 },
  { id: 'asg-refneeded', num: 'A11', series: 'assigner', title: 'Ref needed alerts', blurb: 'Answer a Ref needed request on game day.', secs: 36 },
  { id: 'asg-pay', num: 'A12', series: 'assigner', title: 'Paying your officials', blurb: 'Totals, each official’s games, Mark Paid and CSV.', secs: 44 },
  { id: 'asg-print', num: 'A14', series: 'assigner', title: 'Print the schedule', blurb: 'The printer button: one day or every day as a grid, lists by time or field, filters, Save as PDF and More print choices.', secs: 70 },
  { id: 'asg-checkpoints', num: 'A15', series: 'assigner', title: 'Checkpoints: who had each game', blurb: 'See who was on a game before it moved, compare then and now, save a checkpoint and print it.', secs: 51 },
  // Tournament director training (Oct 13 2026: "how to set up a tournament, for future
  // tournament directors"). Computer videos; in the Video library, not in a staff group.
  { id: 'dir-create', num: 'D01', series: 'director', title: 'Create a tournament', blurb: 'Name, dates, park and fields, game slots, team fee, logo, divisions, and copying last year’s event.', secs: 88 },
  { id: 'dir-setup', num: 'D02', series: 'director', title: 'Tournament setup: the basics', blurb: 'The setup page, divisions and their Full badges, venues, field hours, and game timing.', secs: 76 },
  { id: 'dir-money', num: 'D03', series: 'director', title: 'Tournament setup: fees, pay and standings', blurb: 'Team fees and division rates, the confirmation letter, registration types, staff pay, officials per game, and tiebreakers.', secs: 74 },
  { id: 'dir-divisions', num: 'D04', series: 'director', title: 'Divisions, pools and brackets', blurb: 'Pools, auto-assigning teams, generating games, the bracket, Bulk Generate, and showing pools publicly.', secs: 71 },
  { id: 'dir-schedule', num: 'D05', series: 'director', title: 'Build and publish the schedule', blurb: 'The Board view: placing games, Auto-fill, the Issues panel, weather delays, closing a field, and Publish.', secs: 96 },
  { id: 'dir-registrations', num: 'D06', series: 'director', title: 'Team registrations and payments', blurb: 'Totals, balances, filtering, recording a check, the Pay link, Email clubs, and adding or importing teams.', secs: 67 },
  // Scheduler training (Bo, Oct 14 2026: "they would be similar to the tournament director
  // but they would need all things with scheduling seeding etc. they just don't have the
  // money aspect"). The money-free director videos (D02, D04, D05) are in their group too.
  { id: 'sch-home', num: 'S01', series: 'scheduler', title: 'Your scheduler home', blurb: 'Your tournaments, the Setup sections you use, and the Setup and Live menus.', secs: 55 },
  { id: 'sch-timing', num: 'S02', series: 'scheduler', title: 'Game timing and tiebreakers', blurb: 'The schedule increment, game format, how teams advance, and the tiebreaker order.', secs: 61 },
  { id: 'sch-brackets', num: 'S03', series: 'scheduler', title: 'Brackets and seeding', blurb: 'Formats, the 2-game guarantee, seeding from standings, the preview, and flights.', secs: 82 },
  { id: 'sch-fixes', num: 'S04', series: 'scheduler', title: 'Bracket games and fixes', blurb: 'Placing bracket games, Seeding time, moving and swapping games, exact times, and Undo.', secs: 63 },
  { id: 'sch-weather', num: 'S05', series: 'scheduler', title: 'Weather delays and field closures', blurb: 'Delay or shorten the day, Revert, closing a field, and publishing the changes.', secs: 70 },
  { id: 'asg-send', num: 'A13', series: 'assigner', title: 'Send training videos to your refs', blurb: 'Pick the event and your refs, the message, the preview, and Who’s watched.', secs: 59 },
]

// roles: null = everyone. Worker roles: ref, scorekeeper, field_ops, athletic_trainer.
export const TRAINING_GROUPS: TrainingGroup[] = [
  { key: 'start', label: 'Start here', roles: null, ids: ['sign-up', 'home', 'availability', 'staff-id', 'field-request', 'directory'] },
  { key: 'scorekeepers', label: 'Scorekeepers', roles: ['scorekeeper'], ids: ['game-day-prep', 'keep-score', 'penalties', 'scorer-settings', 'post-final'] },
  { key: 'refs', label: 'Refs', roles: ['ref'], ids: ['ref-games', 'ref-find', 'ref-gameday', 'incidents'] },
  { key: 'fieldops', label: 'Field ops', roles: ['field_ops'], ids: ['checklist', 'incidents'] },
  { key: 'trainers', label: 'Athletic trainers', roles: ['athletic_trainer'], ids: ['trainer-call', 'injury-report', 'incidents', 'field-request', 'directory'] },
  { key: 'schedulers', label: 'Schedulers', roles: ['scheduler'], ids: ['sch-home', 'dir-setup', 'sch-timing', 'dir-divisions', 'sch-brackets', 'dir-schedule', 'sch-fixes', 'sch-weather'] },
  { key: 'assigners', label: 'Assigners', roles: ['assigner'], ids: ['ref-games', 'ref-find', 'ref-gameday', 'asg-home', 'asg-crew', 'asg-roster', 'asg-out', 'asg-board', 'asg-manual', 'asg-auto', 'asg-notify', 'asg-check', 'asg-swaps', 'asg-refneeded', 'asg-print', 'asg-checkpoints', 'asg-pay', 'asg-send'] },
]

export const trainingVideo = (id: string) => TRAINING_VIDEOS.find(v => v.id === id) || null

// The plan group (lib/orgPlans) a video's pages belong to. An organization whose plan has
// that group off doesn't get the video: not in the Video library, on the Training page,
// in what a person is counted against, or in a send (Bo, Oct 16 2026, about the Assigner
// plan: "It should just have ones that pertain to referees, scorekeepers. How to do the
// assigning grid ... minimize that to just the necessary videos per organization type and
// subscription"). Unlisted videos are officials work, which every plan has: signing up,
// the staff home, availability and the staff ID, the ref series and the assigner series.
// Game day prep is Sunshine's game-day routine (arrival, the field's flip chart, breaks),
// so it goes with Game-day tools.
const VIDEO_NEEDS: Record<string, string[]> = {
  'keep-score': ['scores'], 'penalties': ['scores'], 'scorer-settings': ['scores'], 'post-final': ['scores'],
  'game-day-prep': ['gameday'], 'field-request': ['gameday'], 'incidents': ['gameday'], 'checklist': ['gameday'],
  'directory': ['gameday'], 'injury-report': ['gameday'], 'trainer-call': ['gameday'], 'asg-refneeded': ['gameday'],
  'dir-create': ['scheduling'], 'dir-setup': ['scheduling'], 'dir-divisions': ['scheduling'], 'dir-schedule': ['scheduling'],
  'dir-money': ['scheduling', 'money'], 'dir-registrations': ['registration'],
  'sch-home': ['scheduling'], 'sch-timing': ['scheduling'], 'sch-brackets': ['scheduling'], 'sch-fixes': ['scheduling'], 'sch-weather': ['scheduling'],
}
/** False when the organization's plan has switched off a group this video needs.
 *  `planOff` is the plan's off groups (session.user.planOff, lib/orgPlanStore planOffFor). */
export function videoOnPlan(id: string, planOff?: readonly string[] | null): boolean {
  if (!planOff || !planOff.length) return true
  return !(VIDEO_NEEDS[id] || []).some(g => planOff.includes(g))
}
/** The Families & clubs how-to videos are about registration, waivers and the club portal. */
export const howToOnPlan = (planOff?: readonly string[] | null) => !planOff || !planOff.includes('registration')

/** The groups with only the videos on this plan, and none left empty. */
export function trainingGroups(planOff?: readonly string[] | null): TrainingGroup[] {
  if (!planOff || !planOff.length) return TRAINING_GROUPS
  return TRAINING_GROUPS.map(g => ({ ...g, ids: g.ids.filter(id => videoOnPlan(id, planOff)) })).filter(g => g.ids.length > 0)
}
// Served only to signed-in staff (api/training/video/[id]), from videos/training -- not
// public/ -- so the videos can't be passed around or downloaded by link (Bo, Oct 13 2026).
export const videoSrc = (id: string) => `/api/training/video/${encodeURIComponent(id)}`
export const posterSrc = (id: string) => `/training/${id}.jpg`
export const minutesLabel = (secs: number) => (secs < 60 ? '1 min' : `${Math.round(secs / 60)} min`)

/** The groups a person with these roles should watch. No roles (a director, or a login
 *  without a Staff Pool record) = every group. With `planOff`, only the videos on their
 *  organization's plan (videoOnPlan). */
export function groupsFor(roles: string[] | null | undefined, planOff?: readonly string[] | null): TrainingGroup[] {
  const gs = trainingGroups(planOff)
  if (!roles || !roles.length) return gs
  return gs.filter(g => !g.roles || g.roles.some(r => roles.includes(r)))
}

/** The distinct video ids a person with these roles should watch, in order. */
export function videosFor(roles: string[] | null | undefined, planOff?: readonly string[] | null): string[] {
  return Array.from(new Set(groupsFor(roles, planOff).flatMap(g => g.ids)))
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
export const TRAINING_ROLE_LABELS: Record<string, string> = { ref: 'Refs', ref_boys: 'Boys refs', ref_girls: 'Girls refs', scorekeeper: 'Scorekeepers', field_ops: 'Field ops', athletic_trainer: 'Athletic trainers', assigner: 'Assigners', scheduler: 'Schedulers' }

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
