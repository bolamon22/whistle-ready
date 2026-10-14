// Staff availability: one answer per person per event day (Bo, Oct 14 2026).
//
// The head assigner reported that refs and staff had trouble listing their
// availability. Everyone counted as available until they marked themselves out, so
// tapping All day saved nothing and the assigner couldn't tell who had looked, and
// "Part of day" only worked once game times were posted, then asked for the times
// they CAN'T work. Now every day gets an answer and every answer is saved:
//   all    any game that day
//   am     games that start before noon
//   pm     games that start at noon or later
//   times  these start times only (offered once the schedule is posted)
//   no     not this day
// The schedule can still move after someone answers, so an answer becomes the
// "out at these start times" record the Assigner board and Auto-assign read only when
// it is read, against that day's game times at that moment (lib/availability).
//
// Pure: no database import, so the staff home, the assigner's Availability page and
// the API label and read answers the same way.

export type AvailAnswer = 'all' | 'am' | 'pm' | 'times' | 'no'
export const AVAIL_ANSWERS: AvailAnswer[] = ['all', 'am', 'pm', 'times', 'no']
export const isAvailAnswer = (v: unknown): v is AvailAnswer => AVAIL_ANSWERS.includes(v as AvailAnswer)

/** One person's day, as the staff home and the Availability page show it.
 *  `out` is an older "out at these start times" record from the old Unavailability
 *  grid, with no answer behind it. */
export type DayState = {
  a: AvailAnswer | 'out'
  /** Start times they CAN work for 'times'; times they can't for 'out'. */
  times: string[]
  /** 'self' when they answered it; otherwise who set it ('' when unknown). */
  by: string
  /** ISO time it was saved ('' when unknown). */
  at: string
}

/** Minutes after midnight for a stored start time ("9:00" or "09:00"), NaN if none. */
export function minutesOf(t: string): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN
}
/** Morning = a game that starts before noon. */
export const isMorning = (t: string): boolean => { const m = minutesOf(t); return Number.isFinite(m) && m < 12 * 60 }

/** Distinct start times in clock order (stored times aren't zero-padded, so a plain
 *  sort would put 10:00 before 9:00). */
export function sortTimes(ts: string[]): string[] {
  return Array.from(new Set(ts.filter(Boolean))).sort((a, b) => (minutesOf(a) - minutesOf(b)) || a.localeCompare(b))
}

/** Can someone with this day state work a game that starts at t? */
export function covers(s: Pick<DayState, 'a' | 'times'>, t: string): boolean {
  switch (s.a) {
    case 'all': return true
    case 'no': return false
    case 'am': return isMorning(t)
    case 'pm': return !isMorning(t)
    case 'times': return s.times.includes(t)
    case 'out': return !s.times.includes(t)
  }
}

/** The unavailability record an answer stands for on a day with these start times:
 *  null = available all day (no record), [] = out all day, [...] = out at those times.
 *  Before the schedule exists a Morning or Afternoon answer blocks nothing; it starts
 *  to count when games are posted. */
export function outTimesFor(a: AvailAnswer, times: string[], posted: string[]): string[] | null {
  if (a === 'all') return null
  if (a === 'no') return []
  const out = sortTimes(posted).filter(t => !covers({ a, times }, t))
  return out.length ? out : null
}

/** "9:00 AM" */
export function time12(t: string): string {
  const m = minutesOf(t)
  if (!Number.isFinite(m)) return t
  const h = Math.floor(m / 60), mm = m % 60
  return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
/** "8:00, 9:00, 10:00 AM and 12:00 PM" */
export function timesList(ts: string[]): string {
  const s = sortTimes(ts)
  const part = (xs: string[], suffix: string) => xs.length ? `${xs.map(t => time12(t).replace(/ [AP]M$/, '')).join(', ')} ${suffix}` : ''
  return [part(s.filter(isMorning), 'AM'), part(s.filter(t => !isMorning(t)), 'PM')].filter(Boolean).join(' and ')
}
// "8", "8:30"
const hourShort = (t: string) => { const m = minutesOf(t); const h = Math.floor(m / 60) % 12 || 12; return m % 60 ? `${h}:${String(m % 60).padStart(2, '0')}` : String(h) }
/** Short pill text for picked start times: "8–11 AM" when they run in a row on the
 *  day's schedule, "10 AM–1 PM" across noon, else "5 game times". */
export function timesShort(ts: string[], posted: string[]): string {
  const s = sortTimes(ts)
  if (!s.length) return 'No games'
  if (s.length === 1) return `Only ${time12(s[0])}`
  const day = sortTimes(posted)
  const idx = s.map(t => day.indexOf(t))
  const inRow = idx.every((v, i) => v >= 0 && (i === 0 || v === idx[i - 1] + 1))
  if (!inRow) return `${s.length} game times`
  const a = s[0], b = s[s.length - 1]
  const ap = (t: string) => (isMorning(t) ? 'AM' : 'PM')
  return ap(a) === ap(b) ? `${hourShort(a)}–${hourShort(b)} ${ap(b)}` : `${hourShort(a)} ${ap(a)}–${hourShort(b)} ${ap(b)}`
}

/** Pill text for a day: "All day", "Morning", "8–11 AM", "Can't work", "No answer". */
export function stateLabel(s: DayState | null | undefined, posted: string[] = []): string {
  if (!s) return 'No answer'
  switch (s.a) {
    case 'all': return 'All day'
    case 'am': return 'Morning'
    case 'pm': return 'Afternoon'
    case 'no': return "Can't work"
    case 'times': return timesShort(s.times, posted)
    case 'out': return s.times.length ? `Out ${timesShort(s.times, posted)}` : "Can't work"
  }
}
/** The color family a day's answer is shown in, the same on every screen. */
export function stateTone(s: DayState | null | undefined): 'yes' | 'part' | 'no' | 'none' {
  if (!s) return 'none'
  if (s.a === 'all') return 'yes'
  if (s.a === 'no' || (s.a === 'out' && !s.times.length)) return 'no'
  return 'part'
}

/** "Saturday, Oct 24" (long) or "Sat, Oct 24" (short), from a YYYY-MM-DD day. */
export function dayTitle(date: string, short = false): string {
  const t = new Date(`${String(date).slice(0, 10)}T12:00:00`)
  if (isNaN(t.getTime())) return date
  return t.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long', month: 'short', day: 'numeric' })
}

/** "Sat–Sun, Oct 24–25", "Sat, Oct 24", or "Sat, Oct 31 – Sun, Nov 1". */
export function eventRange(start?: string | null, end?: string | null): string {
  const at = (v?: string | null) => { const d = v ? new Date(`${String(v).slice(0, 10)}T12:00:00`) : null; return d && !isNaN(d.getTime()) ? d : null }
  const a = at(start), b = at(end)
  if (!a) return ''
  const wd = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
  const md = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (!b || b.getTime() <= a.getTime()) return `${wd(a)}, ${md(a)}`
  if (a.getMonth() === b.getMonth()) return `${wd(a)}–${wd(b)}, ${md(a)}–${b.getDate()}`
  return `${wd(a)}, ${md(a)} – ${wd(b)}, ${md(b)}`
}

/** "both days" / "all 3 days" / "this day" for the one-tap All day answer. */
export function allDaysPhrase(n: number): string {
  return n <= 1 ? 'this day' : n === 2 ? 'both days' : `all ${n} days`
}

const escHtml = (x: unknown) => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** The reminder the head assigner sends to people who haven't answered. `html` is the
 *  inside of the message; the route puts it in the org's email shell. */
export function availabilityLetter(o: {
  firstName: string; eventName: string; when: string; where?: string
  days: { label: string; answered: boolean }[]; link: string
}): { subject: string; text: string; html: string; button: string } {
  const open = o.days.filter(d => !d.answered).length
  const button = open === 1 ? 'Answer for my day' : `Answer for my ${open || o.days.length} days`
  const subject = `${o.eventName}: which days can you work?`
  const where = o.where ? ` in ${o.where}` : ''
  const intro = `You're on the staff for ${o.eventName}, ${o.when}${where}. The assigner is building game assignments and still needs to know when you can work.`
  const after = "For each day, tap All day, Morning, Afternoon or Can't work. You can change it any time before the event."
  const text = [
    `Hi ${o.firstName || 'there'},`, intro,
    o.days.map(d => `${d.label}: ${d.answered ? 'answered' : 'no answer yet'}`).join('\n'),
    `${button}: ${o.link}`, after,
  ].join('\n\n')
  const rows = o.days.map((d, i) => `<tr><td style="padding:11px 14px;font:700 14px/1.4 Arial,Helvetica,sans-serif;color:#0f172a;${i ? 'border-top:1px solid #f1f5f9;' : ''}">${escHtml(d.label)}</td><td style="padding:11px 14px;font:700 13px/1.4 Arial,Helvetica,sans-serif;text-align:right;color:${d.answered ? '#0f766e' : '#b45309'};${i ? 'border-top:1px solid #f1f5f9;' : ''}">${d.answered ? 'Answered' : 'No answer yet'}</td></tr>`).join('')
  const html = `<p style="margin:0 0 14px">Hi ${escHtml(o.firstName || 'there')},</p>
    <p style="margin:0 0 14px">${escHtml(intro)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;margin:6px 0 4px">${rows}</table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 8px"><tr><td style="background:#0f766e;border-radius:10px"><a href="${escHtml(o.link)}" style="display:inline-block;padding:13px 28px;font:700 15px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none">${escHtml(button)}</a></td></tr></table>
    <p style="margin:14px 0 0;font-size:13px;color:#475569">${escHtml(after)} Sign in to Whistle Ready with this email address.</p>`
  return { subject, text, html, button }
}
