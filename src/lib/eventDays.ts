// One place to answer "how far away is this event?".
//
// Every countdown in the app used to do its own date math, and they disagreed:
// the nav header read one day fewer than the dashboard card, every day, and the
// public org page read one fewer than both after 8pm Eastern. Two separate causes:
//
//   1. `new Date('2026-10-24')` is parsed as UTC midnight, not local midnight.
//      In Eastern that instant is 8pm on Oct 23, so any code that then called
//      .setHours(0,0,0,0) landed on the 23rd and came up a day short.
//   2. The org homepage is a server component, so its `Date.now()` is Vercel's
//      clock in UTC. After 8pm Eastern the server's calendar has already flipped
//      to tomorrow while the viewer's has not.
//
// The fix for (1) is here: parse the parts by hand and anchor both ends of the
// subtraction at local noon, which leaves an hour of slack on either side so a
// daylight-saving boundary can't round the wrong way. The fix for (2) is to call
// daysUntil in the browser — see <DaysAway>.

/** 'YYYY-MM-DD' (or a longer ISO string) -> [y, m, d], or null if unparseable. */
function parts(dateStr: string): [number, number, number] | null {
  if (!dateStr) return null
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return [y, m, d]
}

/** Local midnight of a date string, in ms. For live hh:mm:ss countdowns. */
export function localMidnight(dateStr: string): number | null {
  const p = parts(dateStr)
  return p ? new Date(p[0], p[1] - 1, p[2]).getTime() : null
}

/** Local noon of a date string, in ms. The safe anchor for whole-day math. */
function localNoon(dateStr: string): number | null {
  const p = parts(dateStr)
  return p ? new Date(p[0], p[1] - 1, p[2], 12).getTime() : null
}

/**
 * Whole calendar days from today to `dateStr`, in the caller's own time zone.
 * Positive = future, 0 = today, negative = past. null if the date is unusable.
 */
export function daysUntil(dateStr: string, now: number = Date.now()): number | null {
  const target = localNoon(dateStr)
  if (target === null) return null
  const t = new Date(now)
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12).getTime()
  return Math.round((target - today) / 86400000)
}

export type EventPhase = 'in-progress' | 'today' | 'tomorrow' | 'upcoming' | 'yesterday' | 'past'

/** The single source of truth for the countdown wording on every surface. */
export function eventStatus(startDate: string, endDate?: string, now: number = Date.now()):
  { phase: EventPhase; days: number; label: string } | null {
  const days = daysUntil(startDate, now)
  if (days === null) return null
  const endDays = (endDate ? daysUntil(endDate, now) : null) ?? days
  if (days <= 0 && endDays >= 0) return { phase: 'in-progress', days, label: days === 0 ? 'Today' : 'In progress' }
  if (days === 1)  return { phase: 'tomorrow',  days, label: 'Tomorrow' }
  if (days > 1)    return { phase: 'upcoming',  days, label: `${days} days away` }
  if (days === -1) return { phase: 'yesterday', days, label: 'Yesterday' }
  return { phase: 'past', days, label: `${Math.abs(days)} days ago` }
}

/**
 * The days of an event, 'YYYY-MM-DD', sorted: every day from startDate to endDate,
 * any day in the old `dates` list, and any day a game already sits on.
 *
 * The Assigner, Availability and Time entries built their day tabs from `dates`
 * alone. Setup now saves start/end dates and leaves `dates` as "[]", so those pages
 * had no days at all and the Assigner grid showed the unscheduled games instead of
 * the schedule. The Scheduler already worked from start/end plus game dates; this
 * is that rule, in one place.
 */
export function eventDayList(
  t: { dates?: string | null; startDate?: string | null; endDate?: string | null } | null | undefined,
  gameDates: (string | null | undefined)[] = [],
): string[] {
  const out = new Set<string>()
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const a = parts(String(t?.startDate || '')), b = parts(String(t?.endDate || t?.startDate || ''))
  if (a && b) {
    const d = new Date(a[0], a[1] - 1, a[2], 12), end = new Date(b[0], b[1] - 1, b[2], 12)
    for (let n = 0; d <= end && n < 14; n++, d.setDate(d.getDate() + 1)) out.add(ymd(d))
  }
  try {
    const listed = JSON.parse(String(t?.dates || '[]'))
    if (Array.isArray(listed)) for (const x of listed) if (parts(String(x))) out.add(String(x).slice(0, 10))
  } catch { /* not a list: ignore */ }
  for (const g of gameDates) if (g && parts(g)) out.add(g.slice(0, 10))
  return [...out].sort()
}
