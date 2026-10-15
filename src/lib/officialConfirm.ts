import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { eventToday } from '@/lib/availabilityAnswers'

// Officials confirm their games (Bo, Oct 15 2026: the referee assigners "would like
// to have a way to send an email to their officials once they're ready to release
// the schedule and then have the officials confirm that they will be able to take
// those games ... similar to the way that teams confirm that they're coming").
//
// Notify officials (api/tournaments/[id]/notify-officials) asks for it: the event's
// ask (AppSetting `officialConfirmAsk:<tournamentId>`: confirm-by date and who asked)
// and each official's email with a Confirm button. That button opens
// /confirm-games/<token> with no login, like the teams' /confirm/<regId>: the token
// (raw table "OfficialConfirmLink", one per official per event) is the key, and it
// only answers that official's own games at that event.
//
// Answers are raw table "OfficialConfirm", one row per official per game slot
// (gameId + role + workerId), TEXT columns only (CLAUDE.md, raw-query column types):
//   yes  they'll work it. `sig` is the game as they saw it (day, time, field, game
//        number); when the game moves, the yes no longer counts and they're asked again.
//   no   they can't. The assignment is deleted on the spot, so the slot shows open on
//        the board and nobody is paid for a game they never worked; the row stays so
//        the assigner sees who couldn't work it and why.
// Server only: never import this from a client component.

export type ConfirmAsk = { confirmBy: string; at: string; by: string; byUserId: string; byEmail: string }
export type SlotState = 'yes' | 'changed' | 'waiting'
export type Answer = { gameId: string; role: string; workerId: string; answer: 'yes' | 'no'; sig: string; note: string; at: string; by: string }
/** One official's place on one scheduled game. */
export type OfficialSlot = {
  gameId: string; role: string; workerId: string; workerName: string; workerEmail: string
  date: string; time: string; field: string; num: string; division: string; teams: string; sig: string
}

const ASK_KEY = (tid: string) => `officialConfirmAsk:${tid}`
const slotKey = (gameId: string, role: string, workerId: string) => `${gameId}|${role}|${workerId}`

let ready = false
async function ensure(): Promise<void> {
  if (ready) return
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OfficialConfirm" (
    "id" TEXT NOT NULL PRIMARY KEY, "tournamentId" TEXT NOT NULL, "workerId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL, "role" TEXT NOT NULL, "answer" TEXT NOT NULL, "sig" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '', "at" TEXT NOT NULL, "by" TEXT NOT NULL DEFAULT 'self')`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "OfficialConfirm_slot" ON "OfficialConfirm" ("gameId", "role", "workerId")`)
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OfficialConfirm_event" ON "OfficialConfirm" ("tournamentId")`)
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OfficialConfirmLink" (
    "token" TEXT NOT NULL PRIMARY KEY, "tournamentId" TEXT NOT NULL, "workerId" TEXT NOT NULL, "createdAt" TEXT NOT NULL)`)
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "OfficialConfirmLink_who" ON "OfficialConfirmLink" ("tournamentId", "workerId")`)
  ready = true
}

/** The game as an official saw it when they answered. */
export function gameSig(g: { date: string; startTime: string; location: string; gameNumber: string }): string {
  return [g.date, g.startTime, g.location, g.gameNumber].map(x => String(x ?? '')).join('~')
}

// ── The ask ──
export async function readAsk(tournamentId: string): Promise<ConfirmAsk | null> {
  try {
    const r = await prisma.appSetting.findUnique({ where: { key: ASK_KEY(tournamentId) } })
    const v = r?.value ? JSON.parse(r.value) : null
    return v && typeof v === 'object' ? { confirmBy: String(v.confirmBy || ''), at: String(v.at || ''), by: String(v.by || ''), byUserId: String(v.byUserId || ''), byEmail: String(v.byEmail || '') } : null
  } catch { return null }
}
export async function writeAsk(tournamentId: string, ask: ConfirmAsk): Promise<void> {
  const value = JSON.stringify(ask)
  await prisma.appSetting.upsert({ where: { key: ASK_KEY(tournamentId) }, update: { value }, create: { key: ASK_KEY(tournamentId), value } })
}

// ── Links ──
const newToken = () => randomBytes(24).toString('base64url')

/** Each official's link at this event, made the first time it's needed. */
export async function confirmLinks(tournamentId: string, workerIds: string[]): Promise<Map<string, string>> {
  await ensure()
  const out = new Map<string, string>()
  const rows = await prisma.$queryRawUnsafe<{ token: string; workerId: string }[]>(`SELECT "token", "workerId" FROM "OfficialConfirmLink" WHERE "tournamentId" = ?`, tournamentId)
  for (const r of rows) out.set(String(r.workerId), String(r.token))
  for (const wid of Array.from(new Set(workerIds))) {
    if (out.has(wid)) continue
    const token = newToken()
    await prisma.$executeRawUnsafe(`INSERT OR IGNORE INTO "OfficialConfirmLink" ("token", "tournamentId", "workerId", "createdAt") VALUES (?, ?, ?, ?)`, token, tournamentId, wid, new Date().toISOString())
    const again = await prisma.$queryRawUnsafe<{ token: string }[]>(`SELECT "token" FROM "OfficialConfirmLink" WHERE "tournamentId" = ? AND "workerId" = ?`, tournamentId, wid)
    if (again[0]) out.set(wid, String(again[0].token))
  }
  return out
}
export async function confirmLink(tournamentId: string, workerId: string): Promise<string> {
  return (await confirmLinks(tournamentId, [workerId])).get(workerId) || ''
}
export async function resolveConfirmLink(token: string): Promise<{ tournamentId: string; workerId: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null
  await ensure()
  const r = await prisma.$queryRawUnsafe<{ tournamentId: string; workerId: string }[]>(`SELECT "tournamentId", "workerId" FROM "OfficialConfirmLink" WHERE "token" = ?`, token)
  return r[0] ? { tournamentId: String(r[0].tournamentId), workerId: String(r[0].workerId) } : null
}

// ── Games and answers ──
/** Officials' places on this event's scheduled games (not canceled, with a time and
 *  field: parked games aren't on the schedule yet, the same rule as Notify officials). */
export async function officialSlots(tournamentId: string, workerId?: string): Promise<OfficialSlot[]> {
  const games = await prisma.game.findMany({
    where: { tournamentId, isCanceled: false },
    select: { id: true, date: true, startTime: true, location: true, gameNumber: true, division: true, team1: true, team2: true,
      assignments: { where: workerId ? { workerId } : undefined, select: { role: true, workerId: true, worker: { select: { name: true, email: true } } } } },
  })
  const out: OfficialSlot[] = []
  for (const g of games) {
    if (!g.startTime || !g.location) continue
    for (const a of g.assignments) out.push({
      gameId: g.id, role: a.role, workerId: a.workerId, workerName: String(a.worker?.name || ''), workerEmail: String(a.worker?.email || '').trim(),
      date: g.date, time: g.startTime, field: g.location, num: g.gameNumber, division: g.division, teams: `${g.team1} vs ${g.team2}`, sig: gameSig(g),
    })
  }
  return out
}

export async function answersFor(tournamentId: string, workerId?: string): Promise<Map<string, Answer>> {
  await ensure()
  const rows = workerId
    ? await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "OfficialConfirm" WHERE "tournamentId" = ? AND "workerId" = ?`, tournamentId, workerId)
    : await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "OfficialConfirm" WHERE "tournamentId" = ?`, tournamentId)
  const out = new Map<string, Answer>()
  for (const r of rows) {
    const a: Answer = { gameId: String(r.gameId), role: String(r.role), workerId: String(r.workerId), answer: r.answer === 'no' ? 'no' : 'yes', sig: String(r.sig || ''), note: String(r.note || ''), at: String(r.at || ''), by: String(r.by || 'self') }
    out.set(slotKey(a.gameId, a.role, a.workerId), a)
  }
  return out
}

export function stateOf(slot: OfficialSlot, answers: Map<string, Answer>): SlotState {
  const a = answers.get(slotKey(slot.gameId, slot.role, slot.workerId))
  if (!a || a.answer !== 'yes') return 'waiting'   // a "no" with the slot theirs again: the assigner put them back
  return a.sig === slot.sig ? 'yes' : 'changed'
}
export function answerOf(slot: OfficialSlot, answers: Map<string, Answer>): Answer | undefined {
  return answers.get(slotKey(slot.gameId, slot.role, slot.workerId))
}

export async function saveAnswer(tournamentId: string, a: Omit<Answer, 'at'> & { at?: string }): Promise<void> {
  await ensure()
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OfficialConfirm" ("id", "tournamentId", "workerId", "gameId", "role", "answer", "sig", "note", "at", "by") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT ("gameId", "role", "workerId") DO UPDATE SET "answer" = excluded."answer", "sig" = excluded."sig", "note" = excluded."note", "at" = excluded."at", "by" = excluded."by", "tournamentId" = excluded."tournamentId"`,
    randomBytes(12).toString('hex'), tournamentId, a.workerId, a.gameId, a.role, a.answer, a.sig, String(a.note || '').slice(0, 300), a.at || new Date().toISOString(), a.by || 'self')
}

/** Games that are theirs to answer: from today on, in the event's time zone. */
export function upcoming<T extends { date: string }>(rows: T[], today = eventToday()): T[] {
  return rows.filter(r => !r.date || r.date >= today)
}

/** How many of this official's games still need an answer (none when not asked). */
export async function pendingFor(tournamentId: string, workerId: string): Promise<{ pending: number; total: number }> {
  const slots = upcoming(await officialSlots(tournamentId, workerId))
  if (!slots.length) return { pending: 0, total: 0 }
  const answers = await answersFor(tournamentId, workerId)
  return { pending: slots.filter(s => stateOf(s, answers) !== 'yes').length, total: slots.length }
}

/** A merged Staff Pool record's answers and link follow the kept one. */
export async function moveOfficialConfirms(fromWorkerId: string, toWorkerId: string): Promise<void> {
  await ensure()
  // A slot both records answered keeps the kept record's answer.
  await prisma.$executeRawUnsafe(`DELETE FROM "OfficialConfirm" WHERE "workerId" = ? AND EXISTS (SELECT 1 FROM "OfficialConfirm" k WHERE k."workerId" = ? AND k."gameId" = "OfficialConfirm"."gameId" AND k."role" = "OfficialConfirm"."role")`, fromWorkerId, toWorkerId)
  await prisma.$executeRawUnsafe(`UPDATE "OfficialConfirm" SET "workerId" = ? WHERE "workerId" = ?`, toWorkerId, fromWorkerId)
  await prisma.$executeRawUnsafe(`DELETE FROM "OfficialConfirmLink" WHERE "workerId" = ? AND "tournamentId" IN (SELECT "tournamentId" FROM "OfficialConfirmLink" WHERE "workerId" = ?)`, fromWorkerId, toWorkerId)
  await prisma.$executeRawUnsafe(`UPDATE "OfficialConfirmLink" SET "workerId" = ? WHERE "workerId" = ?`, toWorkerId, fromWorkerId)
}
