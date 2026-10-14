// The Website page's sponsor "Shows at" picker, as plain functions so the page and
// its tests read one set of rules. Client-safe on purpose: no database import. The
// Website admin is a client page, and Prisma in its import graph takes it down.
//
// Dates are grouped by EVENT (seriesLabelOf: "Monster Mash", "Fall Classic") because
// that is how sponsors are sold: Palm Beach Sports Commission backs Monster Mash and
// Summer Kick Off, Treasure Coast Sport Tourism backs the Martin County events. A row
// shows the dates coming up and from the past year. Older dates sit behind "Show older
// events" unless one is already picked, so nothing hidden is quietly switched on.

import { seriesLabelOf } from './eventSeries'

export type PickerEvent = { id: string | number; name?: unknown; startDate?: unknown; endDate?: unknown }
export type PickerSponsor = { eventIds?: string[]; series?: string[] }

/** The heading for single events that have finished and have no series of their own. */
export const OTHER_EVENTS = 'Other events'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (x: unknown) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(x ?? '').trim()); return m ? m[1] : '' }
const startOf = (t: PickerEvent) => day(t.startDate) || day(t.endDate)
const endOf = (t: PickerEvent) => day(t.endDate) || day(t.startDate)

/** True while the event hasn't finished: its last day is today or later. */
export function isUpcoming(t: PickerEvent, today: string): boolean {
  return endOf(t) >= today
}

/** The date 365 days before `today` (both YYYY-MM-DD). */
export function yearBefore(today: string): string {
  const ms = Date.parse(`${today}T00:00:00Z`)
  return Number.isFinite(ms) ? new Date(ms - 365 * 864e5).toISOString().slice(0, 10) : today
}

/** "Oct 24–25, 2026", "Oct 31 – Nov 1, 2026", "Dec 30, 2026 – Jan 1, 2027", or "" when the dates don't parse. */
export function eventWhen(start: unknown, end: unknown): string {
  const a = day(start), b = day(end) || a
  if (!a) return ''
  const [ay, am, ad] = a.split('-').map(Number), [by, bm, bd] = b.split('-').map(Number)
  const A = MON[am - 1], B = MON[bm - 1]
  if (!A || !B) return ''
  if (a === b) return `${A} ${ad}, ${ay}`
  if (ay !== by) return `${A} ${ad}, ${ay} – ${B} ${bd}, ${by}`
  if (am === bm) return `${A} ${ad}–${bd}, ${ay}`
  return `${A} ${ad} – ${B} ${bd}, ${ay}`
}

/** The event a tournament belongs to: its series label, or its own name when it has none. */
export function eventLabel(t: { name?: unknown }): string {
  const n = String(t?.name ?? '').trim()
  return seriesLabelOf(n) || n || 'Event'
}

export type PickerChip = {
  id: string
  name: string
  when: string
  start: string
  /** Shows at this event, picked by date or through Every year. */
  on: boolean
  /** On because the whole event is picked for every year, so the date can't be unticked alone. */
  byYear: boolean
  upcoming: boolean
  older: boolean
}
export type PickerRow = { label: string; recurring: boolean; everyYear: boolean; chips: PickerChip[] }

/**
 * The picker's rows for one sponsor.
 *
 * An event gets its own row, with an Every year switch, when it has more than one
 * tournament, one still coming up, or is already picked for every year; a single
 * finished tournament goes under OTHER_EVENTS. Rows run soonest-upcoming first, then
 * by when they last ran, OTHER_EVENTS last. Dates run newest first. `hiddenOlder`
 * counts the dates left out, for "Show N older events".
 */
export function pickerRows(ts: PickerEvent[], s: PickerSponsor, today: string, showOlder: boolean): { rows: PickerRow[]; hiddenOlder: number } {
  const yearAgo = yearBefore(today)
  const picked = new Set((s.eventIds || []).map(String))
  const yearly = new Set((s.series || []).map(String))
  const groups = new Map<string, PickerEvent[]>()
  for (const t of ts || []) {
    const k = eventLabel(t)
    const g = groups.get(k)
    if (g) g.push(t)
    else groups.set(k, [t])
  }
  const rows: (PickerRow & { next: string; last: string })[] = []
  const other: PickerChip[] = []
  let hiddenOlder = 0
  for (const [label, list] of Array.from(groups.entries())) {
    list.sort((a, b) => startOf(b).localeCompare(startOf(a)))
    const coming = list.filter(t => isUpcoming(t, today))
    const recurring = list.length > 1 || coming.length > 0 || yearly.has(label)
    const everyYear = recurring && yearly.has(label)
    const chips: PickerChip[] = []
    for (const t of list) {
      const id = String(t.id)
      const older = endOf(t) < yearAgo
      if (older && !showOlder && !picked.has(id)) { hiddenOlder++; continue }
      chips.push({
        id, name: String(t.name ?? '').trim(), when: eventWhen(t.startDate, t.endDate), start: startOf(t),
        on: everyYear || picked.has(id), byYear: everyYear, upcoming: isUpcoming(t, today), older,
      })
    }
    if (!recurring) { other.push(...chips); continue }
    if (!chips.length && !everyYear) continue
    rows.push({ label, recurring, everyYear, chips, next: coming.map(startOf).sort()[0] || '', last: endOf(list[0]) })
  }
  rows.sort((a, b) => (a.next && b.next) ? a.next.localeCompare(b.next) : a.next ? -1 : b.next ? 1 : b.last.localeCompare(a.last))
  const out: PickerRow[] = rows.map(({ next, last, ...r }) => r)
  if (other.length) out.push({ label: OTHER_EVENTS, recurring: false, everyYear: false, chips: other.sort((a, b) => b.start.localeCompare(a.start)) })
  return { rows: out, hiddenOlder }
}

/**
 * One line for a sponsor's row: where it shows, and whether that includes anything
 * still coming up. A sponsor whose picks have all finished shows at no event page
 * until someone picks the next one, which is easy to miss from the list alone.
 */
export function whereSummary(ts: PickerEvent[], s: PickerSponsor, today: string): { text: string; everyEvent: boolean; noUpcoming: boolean } {
  const picked = new Set((s.eventIds || []).map(String))
  const yearly = (s.series || []).map(String)
  if (!picked.size && !yearly.length) return { text: 'Every event', everyEvent: true, noUpcoming: false }
  const labels: { label: string; yearly: boolean }[] = []
  for (const r of pickerRows(ts, s, today, true).rows) {
    if (r.label === OTHER_EVENTS) { for (const c of r.chips) if (c.on) labels.push({ label: c.name, yearly: false }); continue }
    if (r.everyYear) labels.push({ label: r.label, yearly: true })
    else if (r.chips.some(c => c.on)) labels.push({ label: r.label, yearly: false })
  }
  for (const l of yearly) if (!labels.some(x => x.label === l)) labels.push({ label: l, yearly: true })
  const allYearly = labels.length > 0 && labels.every(x => x.yearly)
  const names = labels.map(x => (allYearly || !x.yearly) ? x.label : `${x.label} (every year)`)
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ')
  const yearlySet = new Set(yearly)
  const noUpcoming = !(ts || []).some(t => isUpcoming(t, today) && (picked.has(String(t.id)) || yearlySet.has(eventLabel(t))))
  return { text: shown ? shown + (allYearly ? ' · every year' : '') : 'No events', everyEvent: false, noUpcoming }
}
