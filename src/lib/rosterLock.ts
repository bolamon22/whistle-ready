// WHEN A CLUB DIRECTOR STOPS BEING ABLE TO MOVE THEIR OWN PLAYERS.
//
// Directors can fix their own rosters right up until the event starts, and then they
// cannot.
//
// THE REASON IS COMPETITIVE INTEGRITY, and only that. Once results exist, moving a
// strong player between your own two teams is roster manipulation, and a tournament
// that cannot say no to it has no answer for the club that complains.
//
// (Printed badges go stale on a late move too, but badges are a keepsake here rather
// than a gate credential, so they are not what sets this timing -- Bo, Sep 18 2026.
// If they ever become the thing staff check people in with, the lock may want to move
// earlier, to whenever they are printed.)
//
// THE LOCK IS EVENT-WIDE, NOT PER TEAM, and that is deliberate. Locking each team at
// its own first game sounds fairer and is the opposite: the club whose second team
// plays Sunday would get to watch Saturday's results and then shuffle before its own
// lock fell. Per-team locking opens the window it is meant to close. One moment, same
// rule for every club, defensible when one of them complains (Bo, Sep 18 2026).
//
// TWO THINGS A DIRECTOR MIGHT DO, AND THE LOCK ONLY STOPS ONE OF THEM.
//
//   PLACING an unmatched waiver onto one of their teams stays open forever. The player
//   is on no roster, so there is nothing to shift them off; a family that registers on
//   Saturday morning and mis-types the team is the ordinary case, and sending that to
//   the organizer on a game day helps nobody. Registration itself is untouched by any
//   of this — the waiver form keeps accepting players throughout (Bo, Sep 18 2026).
//
//   MOVING a player already on one of their teams onto another is what stops. That is
//   the shifting the lock exists for, and it is the only thing it prevents.
//
// STAFF ARE NEVER LOCKED OUT AT ALL. This gates the club-director endpoint only; the
// staff waivers page keeps moving anyone anywhere at any time, because rosters
// genuinely do need fixing on game day and somebody has to be able to do it.
import { prisma } from './db'

// THE EVENT'S WALL CLOCK, NOT THE SERVER'S.
//
// Every date and time in this app is a naive string an organizer typed -- "2026-10-24",
// "8:00 AM" -- with no zone on it. Turning one of those into an instant reads it in the
// SERVER's zone, and the server is Vercel, which is UTC. A Florida event with an 8:00 AM
// opener would have locked at 08:00 UTC = 4:00 AM on the field: four hours early, on the
// one morning a director most needs to fix a roster. Caught in test, Sep 18 2026.
//
// So nothing here becomes an instant at all. "Now" is rendered into the event's own wall
// clock and compared naively against the stored strings, like with like. Eastern is the
// default because that is where these events are; EVENT_TZ overrides it, and is the one
// line to change when an org runs somewhere else.
const EVENT_TZ = String(process.env.EVENT_TZ || 'America/New_York')

/** `now` as the wall clock in `tz`: { date: "YYYY-MM-DD", minutes: since midnight }. */
export function wallClock(now: Date, tz = EVENT_TZ): { date: string; minutes: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now)
    const p: Record<string, string> = {}
    for (const x of parts) p[x.type] = x.value
    const h = Number(p.hour) % 24          // some engines render midnight as "24"
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: h * 60 + Number(p.minute) }
  } catch {
    // An unknown zone must not lock anybody out; fall back to UTC.
    return { date: now.toISOString().slice(0, 10), minutes: now.getUTCHours() * 60 + now.getUTCMinutes() }
  }
}

export type RosterLock = {
  locked: boolean
  /** ISO-ish "YYYY-MM-DD HH:MM" the lock falls, or '' when nothing dates the event yet. */
  at: string
  /** Plain English, shown to the director. They are being told no; say why. */
  why: string
}

/** "9:05 AM" / "09:05" / "9:05" -> minutes since midnight. NaN-safe, 0 when unreadable. */
export function minutesOfDay(raw: string): number {
  const s = String(raw || '').trim()
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(s)
  if (!m) return 0
  let h = Number(m[1]) % 12
  const min = Number(m[2])
  const ap = (m[3] || '').toLowerCase()
  if (ap === 'pm') h += 12
  else if (!ap) h = Number(m[1])        // 24-hour clock, leave it alone
  return h * 60 + (Number.isFinite(min) ? min : 0)
}

/** Compare two "YYYY-MM-DD" + time pairs. Dates are stored as strings, so sort as strings. */
function earlier(a: { date: string; startTime: string }, b: { date: string; startTime: string }) {
  if (a.date !== b.date) return a.date < b.date ? a : b
  return minutesOfDay(a.startTime) <= minutesOfDay(b.startTime) ? a : b
}

/**
 * When do this tournament's rosters lock, and are they locked now?
 *
 * The first scheduled game is the moment. Canceled games do not count — a canceled
 * opener must not lock everyone early. When nothing is scheduled yet the event's own
 * start date stands in, at midnight, so an event with no schedule still locks on the
 * day it runs rather than never.
 *
 * NOTHING DATED AT ALL = NOT LOCKED. An event with no games and no start date is one
 * being set up, and refusing a director there would be a lock with no reason behind it.
 */
export async function rosterLock(tournamentId: string, now = new Date()): Promise<RosterLock> {
  let first: { date: string; startTime: string } | null = null
  try {
    const games = await prisma.game.findMany({
      where: { tournamentId, isCanceled: false },
      select: { date: true, startTime: true },
    })
    for (const g of games) {
      const d = String(g.date || '').trim()
      if (!d) continue
      const row = { date: d, startTime: String(g.startTime || '') }
      first = first ? earlier(first, row) : row
    }
  } catch { /* no games table yet; the start date below stands in */ }

  let at = ''
  let label = ''
  if (first) {
    at = `${first.date} ${String(first.startTime || '').trim()}`.trim()
    label = `the first game of the event (${at})`
  } else {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        'SELECT startDate FROM "Tournament" WHERE id = ?', tournamentId)
      const sd = String(rows?.[0]?.startDate || '').trim()
      if (sd) { at = sd; label = `the event start (${sd})` }
    } catch { /* leave it unlocked rather than guess */ }
  }

  if (!at) return { locked: false, at: '', why: 'Nothing has been scheduled yet, so rosters are open.' }

  // Naive comparison, both sides in the event's wall clock. Date first, then the clock.
  const lockDate = first ? first.date : at
  const lockMin = first ? minutesOfDay(first.startTime) : 0
  const cur = wallClock(now)
  const locked = cur.date > lockDate || (cur.date === lockDate && cur.minutes >= lockMin)
  return {
    locked,
    at,
    why: locked
      ? `Rosters locked at ${label.replace(/^the /, '')}. You can still place a player who is not on a team yet — ask the organizer to move anyone already on one.`
      : `You can move players between your teams until ${label}.`,
  }
}
