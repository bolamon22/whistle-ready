// Tasks: the vocabulary every task page shares, and the starter checklist.
//
// Pure -- no database import -- so client pages (the task board, the starter
// dialog, the template page) can use it without pulling Prisma into the
// browser bundle. The server side lives in lib/tasks.ts.
//
// The starter checklist is what Bo's events have actually needed (Oct 4, 2026):
// field permits from cities and counties, rentals, grant paperwork, club emails.
// Each item's due date counts back from the first game day, so the same list
// lands sensibly on an event 12 weeks out or 3 weeks out. Some items only apply
// to some events (Martin County wants a notarized affidavit, only grant events
// owe a post-event report); those carry `only` and come unticked in the starter
// dialog unless the event's name suggests them.
//
// The setup checklist is NOT an item here. It is the existing shared list
// (AppSetting checklists:{id}) that staff check off on their phones, shown
// inside Tasks as its own checklist, due the day before.

// ── What the task pages pass around ───────────────────────────────────────────

export type TaskStep = { id: string; text: string; done: boolean }

export type TaskView = {
  id: string
  /** 'checklist' is a tournament's shared setup checklist, shown as one row. */
  kind: 'task' | 'checklist'
  /** '' for a task that isn't tied to one event (General). */
  tournamentId: string
  title: string
  category: string
  /** YYYY-MM-DD, or '' for no date. */
  dueDate: string
  notes: string
  steps: TaskStep[]
  templateKey: string
  link: { label: string; href: string } | null
  done: boolean
  doneAt: string
  doneBy: string
  /** What the app can see about it ("4 clubs unpaid"); null when it isn't tracked. */
  tracked: { label: string; done?: boolean } | null
  /** Checklist rows: items checked off out of how many. */
  progress?: { done: number; total: number }
  /** The event contact this task depends on (Event contacts), or ''. */
  contactId?: string
  contactName?: string
}

export type TaskTournament = { id: string; name: string; logoUrl: string; firstDay: string; lastDay: string; location: string }

export type TaskCategory = 'venue' | 'rentals' | 'staff' | 'comms' | 'grants' | 'awards' | 'gameday' | 'wrap' | 'other'

export const TASK_CATEGORIES: { key: TaskCategory; label: string }[] = [
  { key: 'venue', label: 'Venue & permits' },
  { key: 'rentals', label: 'Rentals & logistics' },
  { key: 'staff', label: 'Staff & officials' },
  { key: 'comms', label: 'Teams & communication' },
  { key: 'grants', label: 'Grants & sponsors' },
  { key: 'awards', label: 'Awards & merch' },
  { key: 'gameday', label: 'Game day' },
  { key: 'wrap', label: 'After the event' },
  { key: 'other', label: 'Other' },
]

export function isCategory(v: unknown): v is TaskCategory {
  return TASK_CATEGORIES.some(c => c.key === v)
}

export function categoryLabel(key: string): string {
  return TASK_CATEGORIES.find(c => c.key === key)?.label ?? 'Other'
}

/** The page in the app where a task actually gets done. */
export const TASK_LINKS: Record<string, { label: string; path: (tournamentId: string) => string }> = {
  registrations: { label: 'Registrations', path: t => `/tournaments/${t}/registrations` },
  emailClubs: { label: 'Email clubs', path: t => `/tournaments/${t}/registrations` },
  returningTeams: { label: 'Returning teams', path: t => `/tournaments/${t}/returning-teams` },
  travel: { label: 'Travel & hotels', path: t => `/tournaments/${t}/travel` },
  eventPage: { label: 'Event page', path: t => `/tournaments/${t}/event-page` },
  documents: { label: 'Documents', path: t => `/tournaments/${t}/documents` },
  photoBookings: { label: 'Photo bookings', path: t => `/tournaments/${t}/photo-requests` },
  exhibitA: { label: 'Exhibit A', path: t => `/tournaments/${t}/roster/exhibit-a` },
  staffRoster: { label: 'Staff roster', path: t => `/tournaments/${t}/roster` },
  playerWaivers: { label: 'Player waivers', path: t => `/tournaments/${t}/player-waivers` },
  scheduler: { label: 'Scheduler', path: t => `/tournaments/${t}/scheduler` },
  assigner: { label: 'Assigner', path: t => `/tournaments/${t}` },
  broadcast: { label: 'Broadcast', path: t => `/tournaments/${t}/broadcast` },
  payReport: { label: 'Staff pay', path: t => `/tournaments/${t}/pay-summary` },
  financials: { label: 'Financials', path: t => `/tournaments/${t}/financials` },
}

export function linkFor(key: string, tournamentId: string): { label: string; href: string } | null {
  const l = key && tournamentId ? TASK_LINKS[key] : undefined
  return l ? { label: l.label, href: l.path(tournamentId) } : null
}

export type TemplateItem = {
  key: string
  title: string
  category: TaskCategory
  /** Days from the first game day: -28 is four weeks before, 2 is two days after. */
  offset: number
  /** Only some events need it. Shown on the template; unticked in the starter dialog. */
  only?: string
  /** Lower-case name fragments that tick an `only` item by default. */
  suggest?: string[]
  link?: keyof typeof TASK_LINKS
  steps?: string[]
  /** The app can tell how this one is going (see lib/taskSignals.ts). */
  tracked?: boolean
}

export const STARTER_TEMPLATE: TemplateItem[] = [
  { key: 'fields', title: 'Reserve the fields (city or county application)', category: 'venue', offset: -112, link: 'documents' },
  { key: 'grant', title: 'Apply for the sports-tourism grant', category: 'grants', offset: -84, only: 'Events with a grant', suggest: ['monster mash', 'fall classic'] },
  { key: 'reg', title: 'Open registration', category: 'comms', offset: -84, link: 'registrations' },
  { key: 'block', title: 'Hotel block with the housing partner', category: 'comms', offset: -84, link: 'travel' },
  { key: 'invite', title: 'Invite past clubs', category: 'comms', offset: -70, link: 'returningTeams' },
  { key: 'logos', title: 'Grant partner logo on the event page', category: 'grants', offset: -70, only: 'Events with a grant', suggest: ['monster mash', 'fall classic'], link: 'eventPage' },
  // Bo, Oct 5 2026: "make sure we save that website for COI for all future events".
  { key: 'coi', title: 'Insurance certificate to the venue and grant partners', category: 'venue', offset: -70, link: 'documents', steps: [
    'Request it at usalacrosse.com/xtc2627: Tournament, Third Party / Additional Insured, one request per holder',
    'List every additional insured, plus the event, dates and venue, in Special instructions',
    'When WTW emails it back: Contacts > Send a document > Certificate of insurance',
  ] },
  { key: 'assigner', title: 'Confirm the officials assigner and rates', category: 'staff', offset: -56 },
  { key: 'awards', title: 'Order awards and banners (Lacrossewear)', category: 'awards', offset: -56 },
  { key: 'photo', title: 'Book the photographer', category: 'staff', offset: -56, link: 'photoBookings' },
  { key: 'permit', title: 'Permit packet signed and returned', category: 'venue', offset: -42, link: 'documents' },
  { key: 'staffhotel', title: 'Staff hotel rooms', category: 'staff', offset: -42, only: 'Away events', suggest: ['fall classic'] },
  { key: 'tents', title: 'Book tents', category: 'rentals', offset: -28 },
  { key: 'carts', title: 'Reserve golf carts', category: 'rentals', offset: -28 },
  { key: 'truck', title: 'Box truck rental', category: 'rentals', offset: -28 },
  { key: 'affidavit', title: 'Background check and concussion affidavit, notarized, with Exhibit A', category: 'venue', offset: -28, only: 'Martin County venues', suggest: ['fall classic'], link: 'exhibitA', tracked: true },
  { key: 'toilets', title: 'Portable toilets and dumpster', category: 'rentals', offset: -21, only: 'Venues that need them', suggest: ['fall classic'] },
  { key: 'sheriff', title: 'Confirm the Sheriff’s detail', category: 'venue', offset: -21, only: 'Martin County venues', suggest: ['fall classic'] },
  { key: 'trainers', title: 'Book athletic trainers', category: 'staff', offset: -21, link: 'staffRoster', tracked: true },
  { key: 'payrem', title: 'Payment reminder to unpaid clubs', category: 'comms', offset: -21, link: 'emailClubs', tracked: true },
  { key: 'plans', title: 'Site, accessibility and EMS-access plans', category: 'venue', offset: -21, only: 'Martin County venues', suggest: ['fall classic'], link: 'documents' },
  { key: 'signs', title: 'Field maps and signage', category: 'gameday', offset: -21, steps: ['Field number flags', 'Lot-full signs', 'Staff parking passes', 'Field map on the event page'] },
  { key: 'crowd', title: 'Crowd manager certificate on file', category: 'venue', offset: -21, only: 'Tamarac', suggest: ['jingle brawl'], link: 'documents' },
  { key: 'letter', title: 'Send the 2-weeks-out letter to clubs', category: 'comms', offset: -14, link: 'emailClubs' },
  { key: 'waivers', title: 'Chase teams with missing player waivers', category: 'comms', offset: -14, link: 'playerWaivers', tracked: true },
  { key: 'walk', title: 'Pre-event walkthrough with the venue', category: 'venue', offset: -14, only: 'Martin County venues', suggest: ['fall classic'] },
  { key: 'staffsched', title: 'Staff schedule', category: 'staff', offset: -14, link: 'assigner' },
  { key: 'publish', title: 'Publish the schedule', category: 'comms', offset: -7, link: 'scheduler', tracked: true },
  { key: 'refs', title: 'Officials assigned to every game', category: 'staff', offset: -3, link: 'assigner', tracked: true },
  { key: 'sheets', title: 'Print score sheets', category: 'gameday', offset: -2 },
  { key: 'weather', title: 'Weather check and Broadcast plan', category: 'gameday', offset: -1, link: 'broadcast' },
  { key: 'load', title: 'Load the box truck', category: 'rentals', offset: -1 },
  { key: 'goals', title: 'Bring our own goals', category: 'gameday', offset: -1, only: 'Venues without goals', suggest: ['fall classic'] },
  { key: 'banner', title: 'Grant partner banner on site', category: 'grants', offset: 0, only: 'Events with a grant', suggest: ['monster mash'] },
  { key: 'return', title: 'Return the rentals', category: 'wrap', offset: 2 },
  { key: 'thanks', title: 'Thank-you email and results to clubs', category: 'wrap', offset: 3, link: 'emailClubs' },
  { key: 'payrefs', title: 'Pay officials and the assigner', category: 'wrap', offset: 5, link: 'payReport' },
  { key: 'rooms', title: 'Room-night report from the housing partner', category: 'wrap', offset: 14, link: 'travel', tracked: true },
  { key: 'unpaid', title: 'Collect unpaid balances', category: 'wrap', offset: 14, link: 'financials', tracked: true },
  { key: 'deposit', title: 'Get the venue deposit back', category: 'wrap', offset: 21, only: 'Venues with a deposit', suggest: ['fall classic'] },
  { key: 'report', title: 'Grant post-event report', category: 'grants', offset: 31, only: 'Events with a grant', suggest: ['monster mash', 'fall classic'], link: 'travel', tracked: true },
]

export function templateItem(key: string): TemplateItem | undefined {
  return STARTER_TEMPLATE.find(t => t.key === key)
}

// ── Dates ─────────────────────────────────────────────────────────────────────
// Due dates are plain YYYY-MM-DD strings, like game dates. All the math is in
// UTC so a date never shifts by a day across a time zone or a DST change.

const DAY = 86400000
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)

function utc(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(ymd: string, n: number): string {
  return new Date(utc(ymd) + n * DAY).toISOString().slice(0, 10)
}

/** b minus a, in whole days. */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / DAY)
}

/** "Oct 4" */
export function shortDate(ymd: string): string {
  if (!isYmd(ymd)) return ''
  const d = new Date(utc(ymd))
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** "Tue, Oct 6" */
export function dayDate(ymd: string): string {
  if (!isYmd(ymd)) return ''
  return `${DOW[new Date(utc(ymd)).getUTCDay()]}, ${shortDate(ymd)}`
}

/** Today in the browser's (or server's) local time zone, YYYY-MM-DD. */
export function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "4 weeks before", "the day before", "game day", "2 days after", "about a month after" */
export function timingLabel(offset: number): string {
  if (offset === 0) return 'game day'
  const a = Math.abs(offset)
  const side = offset < 0 ? 'before' : 'after'
  if (a === 1) return offset < 0 ? 'the day before' : 'the day after'
  if (a % 7 === 0) return `${a / 7} ${a === 7 ? 'week' : 'weeks'} ${side}`
  if (a >= 28) return `about a month ${side}`
  return `${a} days ${side}`
}

/** The first game day: startDate, else the earliest listed date. '' when there is none. */
export function firstGameDay(t: { startDate?: string | null; dates?: string | null }): string {
  const s = String(t.startDate || '').slice(0, 10)
  if (isYmd(s)) return s
  try {
    const list = JSON.parse(t.dates || '[]')
    if (Array.isArray(list)) {
      const days = list.map(d => String(d).slice(0, 10)).filter(isYmd).sort()
      if (days.length) return days[0]
    }
  } catch { /* no dates */ }
  return ''
}

/** The last game day: endDate, else the latest listed date, else the first. */
export function lastGameDay(t: { startDate?: string | null; endDate?: string | null; dates?: string | null }): string {
  const days: string[] = []
  for (const d of [t.startDate, t.endDate]) { const s = String(d || '').slice(0, 10); if (isYmd(s)) days.push(s) }
  try {
    const list = JSON.parse(t.dates || '[]')
    if (Array.isArray(list)) for (const d of list) { const s = String(d).slice(0, 10); if (isYmd(s)) days.push(s) }
  } catch { /* no dates */ }
  return days.sort().pop() || ''
}

/** Where a due date sits relative to today, for grouping and color. */
export type DueBucket = 'overdue' | 'week' | 'next' | 'later' | 'none'

export function dueBucket(due: string, today: string): DueBucket {
  if (!isYmd(due)) return 'none'
  const n = daysBetween(today, due)
  if (n < 0) return 'overdue'
  if (n <= 6) return 'week'
  if (n <= 13) return 'next'
  return 'later'
}

/** "3 days late", "Today", "Tomorrow", "Tue, Oct 6", "Oct 21", or '' for no date. */
export function dueLabel(due: string, today: string): string {
  if (!isYmd(due)) return ''
  const n = daysBetween(today, due)
  if (n < 0) return n === -1 ? '1 day late' : `${-n} days late`
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n <= 6) return dayDate(due)
  return shortDate(due)
}

/** Due-date order: dated tasks soonest first, undated last; ties by title. */
export function byDue(a: Pick<TaskView, 'dueDate' | 'title'>, b: Pick<TaskView, 'dueDate' | 'title'>): number {
  const ad = isYmd(a.dueDate), bd = isYmd(b.dueDate)
  if (ad !== bd) return ad ? -1 : 1
  if (ad && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  return a.title.localeCompare(b.title)
}

export type TaskCounts = { open: number; overdue: number; week: number; done: number; total: number }

/** Open / overdue / due-in-the-next-7-days counts. The red badges count `overdue` only. */
export function countTasks(tasks: Pick<TaskView, 'done' | 'dueDate'>[], today: string): TaskCounts {
  let open = 0, overdue = 0, week = 0
  for (const t of tasks) {
    if (t.done) continue
    open++
    const b = dueBucket(t.dueDate, today)
    if (b === 'overdue') overdue++
    else if (b === 'week') week++
  }
  return { open, overdue, week, done: tasks.length - open, total: tasks.length }
}

/** Template phase headings: "16 weeks before" ... "Event week", "Game day", "After the event". */
export function phaseLabel(offset: number): string {
  if (offset <= -14) { const t = timingLabel(offset); return t.charAt(0).toUpperCase() + t.slice(1) }
  if (offset < 0) return 'Event week'
  if (offset === 0) return 'Game day'
  return 'After the event'
}

/** "Oct 24–25", "Oct 31 – Nov 1", "Oct 24" */
export function eventRange(first: string, last: string): string {
  if (!isYmd(first)) return ''
  if (!isYmd(last) || last === first) return shortDate(first)
  return first.slice(0, 7) === last.slice(0, 7) ? `${shortDate(first)}–${Number(last.slice(8, 10))}` : `${shortDate(first)} – ${shortDate(last)}`
}

/** "in 20 days", "tomorrow", "today", "underway", "over" */
export function eventWhen(first: string, last: string, today: string): string {
  if (!isYmd(first)) return ''
  const n = daysBetween(today, first)
  if (n > 1) return `in ${n} days`
  if (n === 1) return 'tomorrow'
  if (n === 0) return 'today'
  return isYmd(last) && last >= today ? 'underway' : 'over'
}

/** What a tracked task's live line means, shown in its details. */
export const TRACKED_NOTES: Record<string, string> = {
  payrem: 'Checks itself off when every club has paid.',
  unpaid: 'Checks itself off when every balance is paid.',
  publish: 'Checks itself off when you publish the schedule on the Scheduler.',
  refs: 'Checks itself off when every game has the refs it needs on the Assigner.',
  trainers: 'Counts the athletic trainers on this event’s staff roster.',
  waivers: 'Counts registered teams with no player waivers in yet.',
  affidavit: 'Counts rostered staff whose background check is missing or more than 12 months old, the same ones Exhibit A flags.',
  rooms: 'Room nights from Travel & hotels.',
  report: 'Room nights from Travel & hotels, the number the post-event report asks for.',
}

/** Let the nav badges and dashboards know the task list changed. `source` lets
 *  the component that made the change skip reloading for its own announcement. */
export function announceTasksChanged(source = ''): void {
  try { window.dispatchEvent(new CustomEvent('tasks-changed', { detail: { source } })) } catch { /* not in a browser */ }
}
