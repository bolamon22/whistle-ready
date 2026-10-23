// Game day mode (Bo, Oct 23 2026): on a phone, from two days before an event through
// its last day, the event's public pages open straight to the Game day screen
// (/tournaments/<id>/today) — most visitors that close to an event just want their
// team's schedule. Phones only, decided on the phone (components/GameDayGate), with
// one switch per event for staff (api/tournaments/[id]/game-day) to turn it off.

/** Days before the start date that game day mode begins. */
export const GAME_DAY_LEAD_DAYS = 2

/** The AppSetting key for one event's switch: 'off' turns game day mode off. */
export const gameDayKey = (tournamentId: string) => `gameDayMode:${tournamentId}`

/** Today's date (YYYY-MM-DD) in Florida, where the events are. */
export function eventToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

function addDays(d: string, n: number): string {
  const dt = new Date(d + 'T12:00:00Z')
  dt.setUTCDate(dt.getUTCDate() + n)
  return dt.toISOString().slice(0, 10)
}

/** The dates game day mode runs for an event, or null without a start date. */
export function gameDayWindow(startDate: string, endDate: string): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(startDate || '')) return null
  const start = startDate.slice(0, 10)
  const end = /^\d{4}-\d{2}-\d{2}/.test(endDate || '') ? endDate.slice(0, 10) : start
  return { from: addDays(start, -GAME_DAY_LEAD_DAYS), to: end < start ? start : end }
}

/** Whether today falls in the event's game day window. */
export function inGameDayWindow(startDate: string, endDate: string, today: string = eventToday()): boolean {
  const w = gameDayWindow(startDate, endDate)
  return !!w && today >= w.from && today <= w.to
}
