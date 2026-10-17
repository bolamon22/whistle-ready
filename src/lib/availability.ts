// Reading and saving staff availability (lib/availabilityAnswers has the why).
//
// Two stores:
//   AvailabilityAnswer  raw SQL, made on first use   one answer per person per day
//   Availability        Prisma                        "out at these start times" records
// Availability is what the old Unavailability grid and the first staff panel wrote
// ([] = out all day, ['08:00', ...] = out at those start times, no record = available).
// Saving an answer deletes that person's record for the day, so a record only stands
// where nobody has answered since, and it wins when both exist.
// Everything that decides who can work a game (GET /api/availability for the Assigner
// board, Auto-assign) reads effectiveUnavailability(), which turns answers into those
// records against the game times of the moment.
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { gameGender } from '@/lib/gameGender'
import { eventSideOf } from '@/lib/eventTeamsStore'
import { eventDayList } from '@/lib/eventDays'
import { ensureVisibilityColumns } from '@/lib/publicView'
import { AvailAnswer, DayState, isAvailAnswer, outTimesFor, sortTimes } from '@/lib/availabilityAnswers'

/** The roles that manage staff: they see and set anyone's days (a field director only
 *  for their scorekeepers, trainers and field ops). Everyone else sets only their own. */
export const AVAILABILITY_MANAGERS = ['admin', 'director', 'assigner', 'scheduler', 'field_director']

let ready: Promise<void> | null = null

/** Make the answers table once per server instance. A failure is retried next call. */
export function ensureAvailabilityAnswers(): Promise<void> {
  if (!ready) ready = setUp().catch(e => { ready = null; throw e })
  return ready
}

// Every column is TEXT: the libSQL adapter reads a declared INTEGER as 32-bit and
// fails the whole query on one bigger value (CLAUDE.md, raw-query column types).
async function setUp(): Promise<void> {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "AvailabilityAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workerId" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "times" TEXT NOT NULL DEFAULT '[]',
    "setBy" TEXT NOT NULL DEFAULT '',
    "setByName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TEXT NOT NULL DEFAULT ''
  )`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "AvailabilityAnswer_worker_event_day" ON "AvailabilityAnswer" ("workerId", "tournamentId", "date")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AvailabilityAnswer_event" ON "AvailabilityAnswer" ("tournamentId")`)
}

function parseTimes(v: unknown): string[] {
  try { const a = JSON.parse(String(v ?? '[]')); return Array.isArray(a) ? a.map(String).filter(Boolean) : [] } catch { return [] }
}

/** One start time on one day: how many games start then, and how many ref spots
 *  they need, by whose game it is (lib/gameGender). */
export type SlotInfo = { t: string; n: number; refs: { boys: number; girls: number; both: number } }

/** Each day's game start times in clock order, canceled games left out. */
export async function gameSlots(tournamentId: string): Promise<Map<string, SlotInfo[]>> {
  const [games, side] = await Promise.all([
    prisma.game.findMany({ where: { tournamentId, isCanceled: false }, select: { date: true, startTime: true, refCount: true, division: true } }),
    eventSideOf(tournamentId),
  ])
  const byDay = new Map<string, Map<string, SlotInfo>>()
  for (const g of games) {
    const d = String(g.date || '').slice(0, 10), t = String(g.startTime || '').trim()
    if (!d || !t) continue
    const day = byDay.get(d) || new Map<string, SlotInfo>(); byDay.set(d, day)
    const s = day.get(t) || { t, n: 0, refs: { boys: 0, girls: 0, both: 0 } }; day.set(t, s)
    s.n++
    s.refs[gameGender(g.division, side)] += Math.max(0, Number(g.refCount) || 0)
  }
  const out = new Map<string, SlotInfo[]>()
  for (const [d, m] of Array.from(byDay.entries())) out.set(d, sortTimes(Array.from(m.keys())).map(t => m.get(t)!))
  return out
}

type AnswerRow = { workerId: string; date: string; answer: string; times: string[]; setBy: string; setByName: string; updatedAt: string }

async function answerRows(tournamentId: string, workerId?: string): Promise<AnswerRow[]> {
  await ensureAvailabilityAnswers()
  const sql = `SELECT "workerId", "date", "answer", "times", "setBy", "setByName", "updatedAt" FROM "AvailabilityAnswer" WHERE "tournamentId" = ?${workerId ? ' AND "workerId" = ?' : ''}`
  const rows: any[] = workerId ? await prisma.$queryRawUnsafe(sql, tournamentId, workerId) : await prisma.$queryRawUnsafe(sql, tournamentId)
  return rows.map(r => ({
    workerId: String(r.workerId), date: String(r.date), answer: String(r.answer), times: parseTimes(r.times),
    setBy: String(r.setBy || ''), setByName: String(r.setByName || ''), updatedAt: String(r.updatedAt || ''),
  }))
}

/** Each person's answered days for an event: workerId -> date -> state. An older
 *  "out" record for a day wins over an answer (it can only be newer). */
export async function dayStates(tournamentId: string, workerIds?: string[]): Promise<Map<string, Record<string, DayState>>> {
  const one = workerIds && workerIds.length === 1 ? workerIds[0] : undefined
  const [answers, stored] = await Promise.all([
    answerRows(tournamentId, one),
    prisma.availability.findMany({ where: { tournamentId, ...(workerIds ? { workerId: { in: workerIds } } : {}) }, select: { workerId: true, date: true, timeSlots: true } }),
  ])
  const want = workerIds ? new Set(workerIds) : null
  const out = new Map<string, Record<string, DayState>>()
  const put = (w: string, d: string, s: DayState) => { const m = out.get(w) || {}; m[d] = s; out.set(w, m) }
  for (const a of answers) {
    if (!isAvailAnswer(a.answer) || (want && !want.has(a.workerId))) continue
    put(a.workerId, a.date, { a: a.answer, times: a.answer === 'times' ? sortTimes(a.times) : [], by: a.setBy === 'self' ? 'self' : (a.setByName || 'the assigner'), at: a.updatedAt })
  }
  for (const r of stored) {
    const slots = sortTimes(parseTimes(r.timeSlots))
    put(r.workerId, r.date, { a: slots.length ? 'out' : 'no', times: slots, by: '', at: '' })
  }
  return out
}

export type UnavailRow = { id: string; workerId: string; tournamentId: string; date: string; timeSlots: string }

/** Who can't work when, in the old record shape the Assigner board and Auto-assign
 *  read: the stored records plus every answer turned into one against the game times
 *  as they are now. Never fails over the answers: if they can't be read, the stored
 *  records still come back. */
export async function effectiveUnavailability(tournamentId: string, date?: string): Promise<UnavailRow[]> {
  const stored = await prisma.availability.findMany({ where: { tournamentId, ...(date ? { date } : {}) }, select: { id: true, workerId: true, date: true, timeSlots: true } })
  const out: UnavailRow[] = stored.map(r => ({ id: r.id, workerId: r.workerId, tournamentId, date: r.date, timeSlots: r.timeSlots }))
  let answers: AnswerRow[]
  try { answers = await answerRows(tournamentId) } catch (e) { console.error('[availability] answers unreadable, using the stored records only:', e); return out }
  if (date) answers = answers.filter(a => a.date === date)
  if (!answers.length) return out
  const taken = new Set(stored.map(r => `${r.workerId}|${r.date}`))
  const slots = await gameSlots(tournamentId)
  for (const a of answers) {
    if (!isAvailAnswer(a.answer) || taken.has(`${a.workerId}|${a.date}`)) continue
    const list = outTimesFor(a.answer, a.times, (slots.get(a.date) || []).map(s => s.t))
    if (list) out.push({ id: `${a.workerId}|${a.date}`, workerId: a.workerId, tournamentId, date: a.date, timeSlots: JSON.stringify(list) })
  }
  return out
}

/** Save one answer for one or more days, replacing any older "out" record for them.
 *  setBy is 'self' when the person answered, else the account id of who set it. */
export async function saveAnswers(o: { workerId: string; tournamentId: string; dates: string[]; answer: AvailAnswer; times?: string[]; setBy: string; setByName: string }): Promise<void> {
  await ensureAvailabilityAnswers()
  const at = new Date().toISOString()
  const times = JSON.stringify(o.answer === 'times' ? sortTimes(o.times || []) : [])
  for (const date of o.dates) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "AvailabilityAnswer" ("id", "workerId", "tournamentId", "date", "answer", "times", "setBy", "setByName", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT ("workerId", "tournamentId", "date") DO UPDATE SET "answer" = excluded."answer", "times" = excluded."times", "setBy" = excluded."setBy", "setByName" = excluded."setByName", "updatedAt" = excluded."updatedAt"`,
      crypto.randomBytes(12).toString('hex'), o.workerId, o.tournamentId, date, o.answer, times, o.setBy, String(o.setByName || '').slice(0, 80), at,
    )
  }
  await prisma.availability.deleteMany({ where: { workerId: o.workerId, tournamentId: o.tournamentId, date: { in: o.dates } } })
}

/** The events (of these) whose schedule has been published at least once. Exact game
 *  times are offered to staff only then: before that the times are still moving. */
export async function publishedSchedules(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  try {
    await ensureVisibilityColumns()
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT id, "schedulePublishedAt" AS p FROM "Tournament" WHERE id IN (${ids.map(() => '?').join(', ')})`, ...ids)
    return new Set(rows.filter(r => String(r.p || '')).map(r => String(r.id)))
  } catch { return new Set() }
}

export type StaffAvailDay = { date: string; posted: { t: string; n: number }[]; state: DayState | null }

/** The staff home's "Which days can you work?" for one person: each event's days,
 *  their answer for each, and the start times they can pick from (published only). */
export async function staffAvailability(workerId: string, events: { id: string; startDate?: string | null; endDate?: string | null }[]): Promise<Record<string, { days: StaffAvailDay[] }>> {
  const out: Record<string, { days: StaffAvailDay[] }> = {}
  if (!events.length) return out
  const published = await publishedSchedules(events.map(e => e.id))
  for (const e of events) {
    const [slots, states] = await Promise.all([gameSlots(e.id), dayStates(e.id, [workerId])])
    const mine = states.get(workerId) || {}
    out[e.id] = {
      days: eventDayList(e, Array.from(slots.keys())).map(d => ({
        date: d,
        posted: published.has(e.id) ? (slots.get(d) || []).map(s => ({ t: s.t, n: s.n })) : [],
        state: mine[d] || null,
      })),
    }
  }
  return out
}

// Reminders sent from the Availability page, newest first, per event.
export type ReminderEntry = { at: string; by: string; byUserId: string; workerIds: string[] }
const logKey = (tournamentId: string) => `availReminders:${tournamentId}`

export async function reminderLog(tournamentId: string): Promise<ReminderEntry[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: logKey(tournamentId) } })
    const v = row?.value ? JSON.parse(row.value) : []
    return Array.isArray(v) ? v : []
  } catch { return [] }
}

export async function logReminder(tournamentId: string, e: ReminderEntry): Promise<void> {
  try {
    const value = JSON.stringify([e, ...(await reminderLog(tournamentId))].slice(0, 40))
    await prisma.appSetting.upsert({ where: { key: logKey(tournamentId) }, update: { value }, create: { key: logKey(tournamentId), value } })
  } catch { /* the emails went; only the log is lost */ }
}
