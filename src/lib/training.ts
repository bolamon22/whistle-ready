// Staff training videos (Oct 2026): short narrated how-tos filmed from the real
// Whistle Ready screens. The files are in public/training (<id>.mp4 + <id>.jpg
// poster). Each staff member sees the videos for their roles; watched ones are
// remembered per Worker (api/training) and counted on the Staff roster.
//
// Pure -- no database import -- so client pages can use it.

export type TrainingVideo = { id: string; num: string; title: string; blurb: string; secs: number }
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
]

// roles: null = everyone. Worker roles: ref, scorekeeper, field_ops, athletic_trainer.
export const TRAINING_GROUPS: TrainingGroup[] = [
  { key: 'start', label: 'Start here', roles: null, ids: ['sign-up', 'home', 'staff-id', 'field-request', 'directory'] },
  { key: 'scorekeepers', label: 'Scorekeepers', roles: ['scorekeeper'], ids: ['keep-score', 'penalties', 'scorer-settings', 'post-final'] },
  { key: 'refs', label: 'Refs', roles: ['ref'], ids: ['incidents'] },
  { key: 'fieldops', label: 'Field ops', roles: ['field_ops'], ids: ['checklist', 'incidents'] },
  { key: 'trainers', label: 'Athletic trainers', roles: ['athletic_trainer'], ids: ['incidents'] },
]

export const trainingVideo = (id: string) => TRAINING_VIDEOS.find(v => v.id === id) || null
export const videoSrc = (id: string) => `/training/${id}.mp4`
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
