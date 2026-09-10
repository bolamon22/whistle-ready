import crypto from 'crypto'
import { prisma } from '@/lib/db'
import type { SendKind, SendResult } from '@/lib/commSend'

// Scheduled club letters (Bo, Sep 10: "can we make it so we can schedule when we
// send the email?"). A row per queued send; the cron at /api/registrations/comm-cron
// flushes anything due through the very same runCommSend the Send-now button uses.
// In-app table, created on demand — a migration file in the repo means nothing here.

// 'comm' = the club letters; 'returning' = come-back invites to past-event clubs,
// whose recipients aren't registrations of this tournament, so they ride in payload.
export type ScheduledType = 'comm' | 'returning'

export type ScheduledSend = {
  id: string
  tournamentId: string
  type: ScheduledType
  payload: Record<string, unknown>
  kind: SendKind
  regIds: string[]
  subject: string
  body: string
  sendAt: string          // ISO, UTC
  createdAt: string
  createdBy: string
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'canceled'
  sentAt: string
  results: SendResult[]
}

export async function ensureScheduleTable() {
  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "CommScheduledSend" (
      id TEXT PRIMARY KEY,
      tournamentId TEXT NOT NULL,
      kind TEXT NOT NULL,
      regIds TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      sendAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      createdBy TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      sentAt TEXT NOT NULL DEFAULT '',
      results TEXT NOT NULL DEFAULT '[]'
    )`)
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CommScheduledSend_due" ON "CommScheduledSend"(status, sendAt)`)
    // Added when returning-team invites learned to schedule — guarded so existing
    // rows keep working as type 'comm'.
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "CommScheduledSend" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'comm'`) } catch { /* exists */ }
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "CommScheduledSend" ADD COLUMN "payload" TEXT NOT NULL DEFAULT '{}'`) } catch { /* exists */ }
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "CommScheduledSend_tournament" ON "CommScheduledSend"(tournamentId, sendAt)`)
  } catch { /* exists */ }
}

function row(r: Record<string, unknown>): ScheduledSend {
  const parse = <T,>(raw: unknown, fallback: T): T => { try { return JSON.parse(String(raw || '')) as T } catch { return fallback } }
  return {
    id: String(r.id), tournamentId: String(r.tournamentId),
    type: (String(r.type || 'comm') as ScheduledType),
    payload: parse<Record<string, unknown>>(r.payload, {}),
    kind: String(r.kind) as SendKind,
    regIds: parse<string[]>(r.regIds, []), subject: String(r.subject ?? ''), body: String(r.body ?? ''),
    sendAt: String(r.sendAt), createdAt: String(r.createdAt), createdBy: String(r.createdBy ?? ''),
    status: (String(r.status || 'queued') as ScheduledSend['status']), sentAt: String(r.sentAt ?? ''),
    results: parse<SendResult[]>(r.results, []),
  }
}

export async function createScheduled(a: {
  tournamentId: string; kind: SendKind | 'returning'; regIds: string[]
  subject: string; body: string; sendAt: string; createdBy: string
  type?: ScheduledType; payload?: Record<string, unknown>
}): Promise<ScheduledSend> {
  await ensureScheduleTable()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const type = a.type || 'comm'
  const payload = JSON.stringify(a.payload || {})
  await prisma.$executeRawUnsafe(
    `INSERT INTO "CommScheduledSend" (id, tournamentId, kind, regIds, subject, body, sendAt, createdAt, createdBy, status, type, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    id, a.tournamentId, a.kind, JSON.stringify(a.regIds), a.subject.slice(0, 200), a.body.slice(0, 4000), a.sendAt, now, a.createdBy.slice(0, 120), type, payload)
  return { id, tournamentId: a.tournamentId, type, payload: a.payload || {}, kind: a.kind as SendKind, regIds: a.regIds, subject: a.subject, body: a.body, sendAt: a.sendAt, createdAt: now, createdBy: a.createdBy, status: 'queued', sentAt: '', results: [] }
}

/** Everything still queued for this tournament, soonest first. */
export async function listScheduled(tournamentId: string): Promise<ScheduledSend[]> {
  await ensureScheduleTable()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM "CommScheduledSend" WHERE tournamentId = ? AND status = 'queued' ORDER BY sendAt ASC`, tournamentId)
  return rows.map(row)
}

export async function cancelScheduled(id: string, tournamentId: string): Promise<boolean> {
  await ensureScheduleTable()
  const found: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT id FROM "CommScheduledSend" WHERE id = ? AND tournamentId = ? AND status = 'queued'`, id, tournamentId)
  if (!found.length) return false
  await prisma.$executeRawUnsafe(`UPDATE "CommScheduledSend" SET status = 'canceled' WHERE id = ?`, id)
  return true
}

/** Claim one due row at a time so two overlapping cron runs can't double-send. */
export async function claimDue(nowIso: string): Promise<ScheduledSend | null> {
  await ensureScheduleTable()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM "CommScheduledSend" WHERE status = 'queued' AND sendAt <= ? ORDER BY sendAt ASC LIMIT 1`, nowIso)
  if (!rows.length) return null
  const r = row(rows[0])
  const claimed = await prisma.$executeRawUnsafe(
    `UPDATE "CommScheduledSend" SET status = 'sending' WHERE id = ? AND status = 'queued'`, r.id)
  return Number(claimed) > 0 ? r : null
}

export async function finishScheduled(id: string, status: 'sent' | 'failed', results: SendResult[]) {
  await prisma.$executeRawUnsafe(
    `UPDATE "CommScheduledSend" SET status = ?, sentAt = ?, results = ? WHERE id = ?`,
    status, new Date().toISOString(), JSON.stringify(results).slice(0, 8000), id)
}
