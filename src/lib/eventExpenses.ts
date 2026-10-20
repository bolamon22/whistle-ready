import { createClient, type Client } from '@libsql/client'
import {
  isExpenseCategory, isPaidWith, round2, RECEIPT_MAX_BYTES,
  type ExpenseLog, type ExpenseStatus, type ExpenseView, type PaidWith, type ReceiptRead,
} from '@/lib/expenseTypes'

// Receipts for an event: what staff (or the office) bought, from where, who paid,
// and whether they were paid back (Bo, Oct 20 2026). Server only; the shapes and the
// math are in lib/expenseTypes. Two raw tables made on first use, kept out of
// schema.prisma like EventCost:
//   EventExpense   one row per purchase, soft-deleted (deletedAt)
//   ExpenseReceipt the receipt photo or PDF, kept private: it is served only by
//                  /api/expenses/receipts/[id] to whoever turned it in and to the
//                  office of the event it is on, never through the public /api/img.
// Money is the office's (requireMoney); staff see and change only their own
// receipts, and only until the office approves them.

let client: Client | null = null
function db(): Client {
  if (!client) client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
  return client
}

let ready: Promise<void> | null = null
export function ensureExpenseTables(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const c = db()
      await c.execute(`CREATE TABLE IF NOT EXISTS "EventExpense" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL DEFAULT '',
        "tournamentId" TEXT NOT NULL DEFAULT '',
        "personName" TEXT NOT NULL DEFAULT '',
        "workerId" TEXT NOT NULL DEFAULT '',
        "userId" TEXT NOT NULL DEFAULT '',
        "what" TEXT NOT NULL DEFAULT '',
        "vendor" TEXT NOT NULL DEFAULT '',
        "amount" REAL NOT NULL DEFAULT 0,
        "purchasedOn" TEXT NOT NULL DEFAULT '',
        "category" TEXT NOT NULL DEFAULT 'other',
        "paidWith" TEXT NOT NULL DEFAULT 'own',
        "notes" TEXT NOT NULL DEFAULT '',
        "status" TEXT NOT NULL DEFAULT 'pending',
        "declineReason" TEXT NOT NULL DEFAULT '',
        "paidBackOn" TEXT NOT NULL DEFAULT '',
        "paidBackMethod" TEXT NOT NULL DEFAULT '',
        "paidBackNote" TEXT NOT NULL DEFAULT '',
        "receiptId" TEXT NOT NULL DEFAULT '',
        "log" TEXT NOT NULL DEFAULT '[]',
        "createdBy" TEXT NOT NULL DEFAULT '',
        "createdAt" TEXT NOT NULL DEFAULT '',
        "updatedAt" TEXT NOT NULL DEFAULT '',
        "deletedAt" TEXT NOT NULL DEFAULT ''
      )`)
      await c.execute(`CREATE INDEX IF NOT EXISTS "EventExpense_event" ON "EventExpense"("tournamentId", "deletedAt")`)
      await c.execute(`CREATE INDEX IF NOT EXISTS "EventExpense_user" ON "EventExpense"("userId")`)
      await c.execute(`CREATE INDEX IF NOT EXISTS "EventExpense_worker" ON "EventExpense"("workerId")`)
      await c.execute(`CREATE TABLE IF NOT EXISTS "ExpenseReceipt" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL DEFAULT '',
        "userId" TEXT NOT NULL DEFAULT '',
        "mime" TEXT NOT NULL DEFAULT '',
        "size" INTEGER NOT NULL DEFAULT 0,
        "data" BLOB,
        "readJson" TEXT NOT NULL DEFAULT '',
        "createdAt" TEXT NOT NULL DEFAULT ''
      )`)
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

// ── Cleaning what comes in ───────────────────────────────────────────────────

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
export const line = (v: unknown, max: number) => str(v).replace(/\s+/g, ' ').trim().slice(0, max)
export const text = (v: unknown, max: number) => str(v).replace(/\r\n/g, '\n').trim().slice(0, max)
export const ymd = (v: unknown) => {
  const s = str(v)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00Z')) ? s : ''
}
/** "$1,234.50", 1234.5 -> 1234.5; anything not a positive amount -> 0. */
export const money = (v: unknown) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[$,\s]/g, '')) : Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(round2(n), 100_000) : 0
}
/** Today on Florida's calendar (as lib/publicView's todayET; inlined to keep Prisma out of here). */
export const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const nowIso = () => new Date().toISOString()
const newId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

// ── Rows ─────────────────────────────────────────────────────────────────────

/** What one row holds, as written. */
export type ExpenseFields = {
  orgId: string; tournamentId: string
  personName: string; workerId: string; userId: string
  what: string; vendor: string; amount: number; purchasedOn: string; category: string; paidWith: PaidWith
  notes: string; status: ExpenseStatus; declineReason: string
  paidBackOn: string; paidBackMethod: string; paidBackNote: string
  receiptId: string
}
const FIELD_KEYS: (keyof ExpenseFields)[] = ['orgId', 'tournamentId', 'personName', 'workerId', 'userId', 'what', 'vendor', 'amount', 'purchasedOn', 'category', 'paidWith', 'notes', 'status', 'declineReason', 'paidBackOn', 'paidBackMethod', 'paidBackNote', 'receiptId']

export type ExpenseRow = ExpenseView & { orgId: string; deletedAt: string }

function logOf(v: unknown): ExpenseLog[] {
  try {
    const a = JSON.parse(str(v) || '[]')
    return Array.isArray(a) ? a.filter(x => x && typeof x === 'object').map(x => ({ at: str(x.at), by: str(x.by), text: str(x.text) })) : []
  } catch { return [] }
}

export function readOf(v: unknown): ReceiptRead | null {
  try {
    const o = JSON.parse(str(v) || 'null')
    if (!o || typeof o !== 'object') return null
    return { isReceipt: o.isReceipt !== false, vendor: line(o.vendor, 120), date: ymd(o.date), total: money(o.total), what: line(o.what, 200), category: isExpenseCategory(o.category) ? o.category : 'other' }
  } catch { return null }
}

const STATUSES: ExpenseStatus[] = ['pending', 'approved', 'declined']

function toRow(r: Record<string, unknown>): ExpenseRow {
  const mime = str(r.rMime)
  const read = readOf(r.rRead)
  return {
    id: str(r.id), orgId: str(r.orgId), tournamentId: str(r.tournamentId), eventName: str(r.eventName),
    personName: str(r.personName), workerId: str(r.workerId), userId: str(r.userId),
    what: str(r.what), vendor: str(r.vendor), amount: round2(Number(r.amount) || 0), purchasedOn: ymd(r.purchasedOn),
    category: isExpenseCategory(r.category) ? str(r.category) : 'other',
    paidWith: isPaidWith(r.paidWith) ? (r.paidWith as PaidWith) : 'own',
    notes: str(r.notes),
    status: STATUSES.includes(str(r.status) as ExpenseStatus) ? (str(r.status) as ExpenseStatus) : 'pending',
    declineReason: str(r.declineReason),
    paidBackOn: ymd(r.paidBackOn), paidBackMethod: str(r.paidBackMethod), paidBackNote: str(r.paidBackNote),
    receiptId: mime ? str(r.receiptId) : '',
    receiptType: mime === 'application/pdf' ? 'pdf' : mime ? 'image' : '',
    receiptTotal: read && read.total > 0 ? read.total : null,
    createdAt: str(r.createdAt), createdBy: str(r.createdBy), log: logOf(r.log), deletedAt: str(r.deletedAt),
  }
}

/** The view sent to a browser (no org, no delete stamp). */
export function view(r: ExpenseRow): ExpenseView {
  const { orgId: _o, deletedAt: _d, ...v } = r
  void _o; void _d
  return v
}

const SELECT = `SELECT e.*, r.mime AS rMime, r.readJson AS rRead, t.name AS eventName
  FROM "EventExpense" e
  LEFT JOIN "ExpenseReceipt" r ON r.id = e.receiptId AND e.receiptId <> ''
  LEFT JOIN "Tournament" t ON t.id = e.tournamentId`

/** One event's receipts, newest purchase first. */
export async function listEventExpenses(tournamentId: string): Promise<ExpenseRow[]> {
  await ensureExpenseTables()
  const r = await db().execute({ sql: `${SELECT} WHERE e.tournamentId = ? AND e.deletedAt = '' ORDER BY e.purchasedOn DESC, e.createdAt DESC`, args: [tournamentId] })
  return (r.rows as unknown as Record<string, unknown>[]).map(toRow)
}

/** A person's own receipts across events: the ones they turned in, and the ones the
 *  office entered under their Staff Pool record. */
export async function listMine(userId: string, workerIds: string[]): Promise<ExpenseRow[]> {
  await ensureExpenseTables()
  const ors: string[] = []; const args: string[] = []
  if (userId) { ors.push('e.userId = ?'); args.push(userId) }
  const ws = workerIds.filter(Boolean)
  if (ws.length) { ors.push(`e.workerId IN (${ws.map(() => '?').join(',')})`); args.push(...ws) }
  if (!ors.length) return []
  const r = await db().execute({ sql: `${SELECT} WHERE e.deletedAt = '' AND (${ors.join(' OR ')}) ORDER BY e.createdAt DESC LIMIT 100`, args })
  return (r.rows as unknown as Record<string, unknown>[]).map(toRow)
}

export async function getExpense(id: string): Promise<ExpenseRow | null> {
  if (!id) return null
  await ensureExpenseTables()
  const r = await db().execute({ sql: `${SELECT} WHERE e.id = ?`, args: [id] })
  return r.rows[0] ? toRow(r.rows[0] as unknown as Record<string, unknown>) : null
}

export async function insertExpense(f: ExpenseFields, by: string, logText: string): Promise<string> {
  await ensureExpenseTables()
  const id = newId(), at = nowIso()
  const log: ExpenseLog[] = [{ at, by, text: logText }]
  await db().execute({
    sql: `INSERT INTO "EventExpense" (id, ${FIELD_KEYS.map(k => `"${k}"`).join(', ')}, log, createdBy, createdAt, updatedAt) VALUES (?, ${FIELD_KEYS.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
    args: [id, ...FIELD_KEYS.map(k => f[k] as string | number), JSON.stringify(log), by, at, at],
  })
  return id
}

/** Changes the given fields and adds lines to the row's history. */
export async function updateExpense(id: string, set: Partial<ExpenseFields>, by: string, logTexts: string[]): Promise<void> {
  await ensureExpenseTables()
  const keys = (Object.keys(set) as (keyof ExpenseFields)[]).filter(k => FIELD_KEYS.includes(k))
  const cur = await db().execute({ sql: `SELECT log FROM "EventExpense" WHERE id = ?`, args: [id] })
  const at = nowIso()
  const log = [...logOf(cur.rows[0]?.log), ...logTexts.map(t => ({ at, by, text: t }))].slice(-40)
  await db().execute({
    sql: `UPDATE "EventExpense" SET ${keys.map(k => `"${k}" = ?`).concat(['log = ?', 'updatedAt = ?']).join(', ')} WHERE id = ?`,
    args: [...keys.map(k => set[k] as string | number), JSON.stringify(log), at, id],
  })
}

export async function deleteExpense(id: string, by: string): Promise<void> {
  await ensureExpenseTables()
  const cur = await db().execute({ sql: `SELECT log FROM "EventExpense" WHERE id = ?`, args: [id] })
  const at = nowIso()
  const log = [...logOf(cur.rows[0]?.log), { at, by, text: 'Deleted' }].slice(-40)
  await db().execute({ sql: `UPDATE "EventExpense" SET deletedAt = ?, log = ?, updatedAt = ? WHERE id = ?`, args: [at, JSON.stringify(log), at, id] })
}

/** Approved receipts' total for an event (the event dashboard's money snapshot). Never throws. */
export async function approvedExpenseTotal(tournamentId: string): Promise<number> {
  try {
    await ensureExpenseTables()
    const r = await db().execute({ sql: `SELECT amount FROM "EventExpense" WHERE tournamentId = ? AND deletedAt = '' AND status = 'approved'`, args: [tournamentId] })
    return round2((r.rows as unknown as { amount: unknown }[]).reduce((s, x) => s + (Number(x.amount) || 0), 0))
  } catch { return 0 }
}

// ── People and events ────────────────────────────────────────────────────────

export type StaffWorker = { id: string; name: string; orgId: string; phone: string; payMethod: string; payHandle: string }

/** Every Staff Pool record with this login's email, oldest first (duplicates happen). */
export async function workersByEmail(email: string): Promise<StaffWorker[]> {
  const e = email.trim().toLowerCase()
  if (!e) return []
  const r = await db().execute({ sql: `SELECT id, name, orgId, phone, payMethod, payHandle FROM "Worker" WHERE lower(email) = ? ORDER BY createdAt ASC`, args: [e] })
  return (r.rows as unknown as Record<string, unknown>[]).map(w => ({ id: str(w.id), name: str(w.name), orgId: str(w.orgId), phone: str(w.phone), payMethod: str(w.payMethod), payHandle: str(w.payHandle) }))
}

export type EventInfo = { id: string; name: string; orgId: string; startDate: string; endDate: string }

export async function eventInfo(tournamentId: string): Promise<EventInfo | null> {
  if (!tournamentId) return null
  const r = await db().execute({ sql: `SELECT id, name, orgId, startDate, endDate FROM "Tournament" WHERE id = ?`, args: [tournamentId] })
  const t = r.rows[0] as unknown as Record<string, unknown> | undefined
  return t ? { id: str(t.id), name: str(t.name), orgId: str(t.orgId), startDate: str(t.startDate).slice(0, 10), endDate: str(t.endDate).slice(0, 10) } : null
}

export async function eventsOfOrgs(orgIds: string[]): Promise<EventInfo[]> {
  const ids = Array.from(new Set(orgIds.filter(Boolean)))
  if (!ids.length) return []
  const r = await db().execute({ sql: `SELECT id, name, orgId, startDate, endDate FROM "Tournament" WHERE orgId IN (${ids.map(() => '?').join(',')})`, args: ids })
  return (r.rows as unknown as Record<string, unknown>[]).map(t => ({ id: str(t.id), name: str(t.name), orgId: str(t.orgId), startDate: str(t.startDate).slice(0, 10), endDate: str(t.endDate).slice(0, 10) }))
}

/** The events these Staff Pool records are on the roster of. */
export async function rosterEvents(workerIds: string[]): Promise<Set<string>> {
  const ids = workerIds.filter(Boolean)
  if (!ids.length) return new Set()
  const r = await db().execute({ sql: `SELECT tournamentId FROM "RosterEntry" WHERE workerId IN (${ids.map(() => '?').join(',')})`, args: ids })
  return new Set((r.rows as unknown as Record<string, unknown>[]).map(x => str(x.tournamentId)))
}

const dayNum = (d: string) => Math.round(Date.parse(d + 'T12:00:00Z') / 86_400_000)

export type PickableEvent = { id: string; name: string; startDate: string; endDate: string; working: boolean }

/** The events a receipt can be turned in for: on now, up to four months ahead, or
 *  over within the last two months (receipts come in after the weekend). The ones
 *  they work first, then the nearest to today. */
export function pickableEvents(events: EventInfo[], working: Set<string>, today: string): PickableEvent[] {
  const t = dayNum(today)
  const rank = (e: EventInfo) => {
    const s = e.startDate ? dayNum(e.startDate) : NaN, l = dayNum(e.endDate || e.startDate)
    if (s <= t && l >= t) return 0
    if (s > t) return s - t
    return t - l + 0.5
  }
  return events
    .filter(e => {
      if (!e.startDate) return false
      const s = dayNum(e.startDate), l = dayNum(e.endDate || e.startDate)
      return l >= t - 60 && s <= t + 120
    })
    .map(e => ({ e, working: working.has(e.id), r: rank(e) }))
    .sort((a, b) => Number(b.working) - Number(a.working) || a.r - b.r)
    .map(({ e, working }) => ({ id: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate, working }))
}

export type ExpensePerson = { id: string; name: string; phone: string; payMethod: string; payHandle: string; onRoster: boolean }

/** Who the office can pick as the buyer: the event's Staff roster, plus anyone already
 *  on one of its receipts. Their payout details are how they get paid back. */
export async function eventPeople(tournamentId: string, extraWorkerIds: string[]): Promise<ExpensePerson[]> {
  const out = new Map<string, ExpensePerson>()
  const put = (w: Record<string, unknown>, onRoster: boolean) => {
    const id = str(w.id)
    if (!id || out.has(id)) return
    out.set(id, { id, name: str(w.name), phone: str(w.phone), payMethod: str(w.payMethod), payHandle: str(w.payHandle), onRoster })
  }
  const r = await db().execute({ sql: `SELECT w.id, w.name, w.phone, w.payMethod, w.payHandle FROM "RosterEntry" x JOIN "Worker" w ON w.id = x.workerId WHERE x.tournamentId = ?`, args: [tournamentId] })
  for (const w of r.rows as unknown as Record<string, unknown>[]) put(w, true)
  const more = Array.from(new Set(extraWorkerIds.filter(id => id && !out.has(id))))
  if (more.length) {
    const m = await db().execute({ sql: `SELECT id, name, phone, payMethod, payHandle FROM "Worker" WHERE id IN (${more.map(() => '?').join(',')})`, args: more })
    for (const w of m.rows as unknown as Record<string, unknown>[]) put(w, false)
  }
  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name))
}

/** A Staff Pool record by id with its organization, or null. */
export async function workerById(id: string): Promise<{ id: string; name: string; orgId: string } | null> {
  if (!id) return null
  const r = await db().execute({ sql: `SELECT id, name, orgId FROM "Worker" WHERE id = ?`, args: [id] })
  const w = r.rows[0] as unknown as Record<string, unknown> | undefined
  return w ? { id: str(w.id), name: str(w.name), orgId: str(w.orgId) } : null
}

// ── Receipts ─────────────────────────────────────────────────────────────────

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...Array.from(b.subarray(from, to)))

/** The file's real type from its first bytes (never the name or what the browser said). */
export function sniffReceipt(b: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length > 8 && b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'image/png'
  if (b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp'
  if (b.length > 5 && ascii(b, 0, 5) === '%PDF-') return 'application/pdf'
  return null
}

export type ReceiptMeta = { id: string; orgId: string; userId: string; mime: string; size: number; read: ReceiptRead | null; createdAt: string }

export async function saveReceipt(bytes: Uint8Array, mime: string, userId: string, orgId: string): Promise<string> {
  if (bytes.length > RECEIPT_MAX_BYTES) throw new Error('too big')
  await ensureExpenseTables()
  const id = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '')
  await db().execute({
    sql: `INSERT INTO "ExpenseReceipt" (id, orgId, userId, mime, size, data, readJson, createdAt) VALUES (?, ?, ?, ?, ?, ?, '', ?)`,
    args: [id, orgId, userId, mime, bytes.length, bytes, nowIso()],
  })
  return id
}

export async function receiptMeta(id: string): Promise<ReceiptMeta | null> {
  if (!/^[A-Za-z0-9]{8,64}$/.test(id)) return null
  await ensureExpenseTables()
  const r = await db().execute({ sql: `SELECT id, orgId, userId, mime, size, readJson, createdAt FROM "ExpenseReceipt" WHERE id = ?`, args: [id] })
  const x = r.rows[0] as unknown as Record<string, unknown> | undefined
  return x ? { id: str(x.id), orgId: str(x.orgId), userId: str(x.userId), mime: str(x.mime), size: Number(x.size) || 0, read: readOf(x.readJson), createdAt: str(x.createdAt) } : null
}

export async function receiptBytes(id: string): Promise<Uint8Array | null> {
  const r = await db().execute({ sql: `SELECT data FROM "ExpenseReceipt" WHERE id = ?`, args: [id] })
  const raw = r.rows[0]?.data as unknown
  if (!raw) return null
  return raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer)
}

export async function setReceiptRead(id: string, read: ReceiptRead): Promise<void> {
  await db().execute({ sql: `UPDATE "ExpenseReceipt" SET readJson = ? WHERE id = ?`, args: [JSON.stringify(read), id] })
}

/** The live receipts a receipt file is attached to (one, normally). */
export async function expensesUsingReceipt(receiptId: string): Promise<{ id: string; tournamentId: string; orgId: string; userId: string; workerId: string }[]> {
  await ensureExpenseTables()
  const r = await db().execute({ sql: `SELECT id, tournamentId, orgId, userId, workerId FROM "EventExpense" WHERE receiptId = ? AND deletedAt = ''`, args: [receiptId] })
  return (r.rows as unknown as Record<string, unknown>[]).map(x => ({ id: str(x.id), tournamentId: str(x.tournamentId), orgId: str(x.orgId), userId: str(x.userId), workerId: str(x.workerId) }))
}
