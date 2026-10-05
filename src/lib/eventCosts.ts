import { prisma } from '@/lib/db'
import { todayET } from '@/lib/publicView'
import { inScope, scopeTournaments, type Scope } from '@/lib/tasks'
import { getContact } from '@/lib/contacts'
import { paymentsOf } from '@/lib/finance'
import {
  costTotal, money, paidSoFar, isCostCategory, isCostStatus, round2, type CostItem, type CostPayment, type CostView,
} from '@/lib/costTypes'

// Event costs (Bo, Oct 5 2026): each vendor's quote, item by item, per event,
// so budgets start from last year's real prices. Same access as Tasks and
// Contacts (feature `tasks`: directors and admins) and the same org scope.
// Raw SQL created on first use, kept out of schema.prisma like OrgContact.
//
// A line marked Paid on a tournament becomes (and stays in step with) one
// expense in that tournament's Financials, so the money is counted once. A
// line for a past event that isn't in Whistle Ready (tournamentId '') is
// history only: it feeds price comparisons and never touches Financials.

type Row = CostView & { orgId: string }

let ready: Promise<void> | null = null
export function ensureCostTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "EventCost" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL DEFAULT '',
        "tournamentId" TEXT NOT NULL DEFAULT '',
        "eventLabel" TEXT NOT NULL DEFAULT '',
        "eventDate" TEXT NOT NULL DEFAULT '',
        "contactId" TEXT NOT NULL DEFAULT '',
        "vendor" TEXT NOT NULL DEFAULT '',
        "category" TEXT NOT NULL DEFAULT 'other_exp',
        "status" TEXT NOT NULL DEFAULT 'budget',
        "quoteRef" TEXT NOT NULL DEFAULT '',
        "quoteDate" TEXT NOT NULL DEFAULT '',
        "items" TEXT NOT NULL DEFAULT '[]',
        "tax" REAL NOT NULL DEFAULT 0,
        "budget" REAL NOT NULL DEFAULT 0,
        "paid" REAL NOT NULL DEFAULT 0,
        "planned" REAL NOT NULL DEFAULT 0,
        "payments" TEXT NOT NULL DEFAULT '[]',
        "notes" TEXT NOT NULL DEFAULT '',
        "paidDate" TEXT NOT NULL DEFAULT '',
        "method" TEXT NOT NULL DEFAULT '',
        "transactionId" TEXT NOT NULL DEFAULT '',
        "createdBy" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TEXT NOT NULL DEFAULT ''
      )`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "EventCost_org" ON "EventCost"("orgId", "deletedAt")`)
      // Added Oct 5 2026 (deposits): the table was already live without it.
      try { await prisma.$executeRawUnsafe(`ALTER TABLE "EventCost" ADD COLUMN "paid" REAL NOT NULL DEFAULT 0`) } catch { /* already there */ }
      // Added Oct 5 2026 (Financials redesign): a planned amount per line, and each payment.
      try { await prisma.$executeRawUnsafe(`ALTER TABLE "EventCost" ADD COLUMN "planned" REAL NOT NULL DEFAULT 0`) } catch { /* already there */ }
      try { await prisma.$executeRawUnsafe(`ALTER TABLE "EventCost" ADD COLUMN "payments" TEXT NOT NULL DEFAULT '[]'`) } catch { /* already there */ }
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

const newId = () => 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const line = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
const ymd = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
const num = (v: unknown, max = 10_000_000) => { const n = Number(v); return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0 }
const METHODS = new Set(['check', 'zelle', 'credit_card', 'cash', 'venmo', 'wire'])

export function cleanItems(v: unknown): CostItem[] {
  let a: unknown = v
  if (typeof v === 'string') { try { a = JSON.parse(v) } catch { a = [] } }
  if (!Array.isArray(a)) return []
  return a.slice(0, 60).map(x => {
    const o = (x || {}) as Record<string, unknown>
    return { item: line(o.item, 160), qty: round2(num(o.qty, 100000)), unit: round2(num(o.unit, 1_000_000)) }
  }).filter(i => i.item || i.qty || i.unit)
}

export function cleanPayments(v: unknown): CostPayment[] {
  let a: unknown = v
  if (typeof v === 'string') { try { a = JSON.parse(v) } catch { a = [] } }
  if (!Array.isArray(a)) return []
  return a.slice(0, 40).map(x => {
    const o = (x || {}) as Record<string, unknown>
    return { date: ymd(o.date), amount: round2(num(o.amount)), method: METHODS.has(String(o.method)) ? String(o.method) : '', ref: line(o.ref, 80) }
  }).filter(p => p.amount > 0)
}

function toRow(r: Record<string, unknown>): Row {
  return {
    id: String(r.id),
    orgId: String(r.orgId || ''),
    tournamentId: String(r.tournamentId || ''),
    eventLabel: String(r.eventLabel || ''),
    eventDate: ymd(r.eventDate),
    contactId: String(r.contactId || ''),
    vendor: String(r.vendor || ''),
    category: isCostCategory(r.category) ? String(r.category) : 'other_exp',
    status: isCostStatus(r.status) ? r.status : 'budget',
    quoteRef: String(r.quoteRef || ''),
    quoteDate: ymd(r.quoteDate),
    items: cleanItems(r.items),
    tax: round2(Number(r.tax) || 0),
    budget: round2(Number(r.budget) || 0),
    paid: round2(Number(r.paid) || 0),
    planned: round2(Number(r.planned) || 0),
    payments: cleanPayments(r.payments),
    notes: String(r.notes || ''),
    paidDate: ymd(r.paidDate),
    method: String(r.method || ''),
    transactionId: String(r.transactionId || ''),
  }
}
export function view(r: Row): CostView { const { orgId, ...rest } = r; void orgId; return rest }

export async function getCost(id: string): Promise<Row | null> {
  await ensureCostTable()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT * FROM "EventCost" WHERE id = ? AND "deletedAt" = ''`, id)
  return rows[0] ? toRow(rows[0]) : null
}

export type CostInput = Partial<Record<keyof CostView | 'addPayment' | 'removePayment', unknown>>
type Clean = Partial<Omit<CostView, 'id' | 'transactionId'>>
function clean(input: CostInput): Clean {
  const out: Clean = {}
  if (input.tournamentId !== undefined) out.tournamentId = line(input.tournamentId, 60)
  if (input.eventLabel !== undefined) out.eventLabel = line(input.eventLabel, 160)
  if (input.eventDate !== undefined) out.eventDate = ymd(input.eventDate)
  if (input.contactId !== undefined) out.contactId = line(input.contactId, 60)
  if (input.vendor !== undefined) out.vendor = line(input.vendor, 160)
  if (input.category !== undefined) out.category = isCostCategory(input.category) ? String(input.category) : 'other_exp'
  if (input.status !== undefined) out.status = isCostStatus(input.status) ? input.status : 'budget'
  if (input.quoteRef !== undefined) out.quoteRef = line(input.quoteRef, 80)
  if (input.quoteDate !== undefined) out.quoteDate = ymd(input.quoteDate)
  if (input.items !== undefined) out.items = cleanItems(input.items)
  if (input.tax !== undefined) out.tax = round2(num(input.tax))
  if (input.budget !== undefined) out.budget = round2(num(input.budget))
  if (input.paid !== undefined) out.paid = round2(num(input.paid))
  if (input.planned !== undefined) out.planned = round2(num(input.planned))
  if (input.notes !== undefined) out.notes = text(input.notes, 4000)
  if (input.paidDate !== undefined) out.paidDate = ymd(input.paidDate)
  if (input.method !== undefined) out.method = METHODS.has(String(input.method)) ? String(input.method) : ''
  return out
}
const COLS: (keyof Clean)[] = ['tournamentId', 'eventLabel', 'eventDate', 'contactId', 'vendor', 'category', 'status', 'quoteRef', 'quoteDate', 'items', 'tax', 'budget', 'planned', 'paid', 'payments', 'notes', 'paidDate', 'method']
const dbValue = (k: keyof Clean, v: unknown) => k === 'items' || k === 'payments' ? JSON.stringify(v) : v

/**
 * Checks a line's links against what this login can see and fills in what
 * follows from them: a tournament gives the org and the date, a contact the
 * vendor name. Returns an error message, or the org the line belongs to.
 */
async function resolveLinks(scope: Scope, c: Clean, cur: Row | null): Promise<{ error: string } | { orgId: string }> {
  let orgId = cur?.orgId ?? ('all' in scope ? '' : scope.orgId)
  const tId = c.tournamentId !== undefined ? c.tournamentId : cur?.tournamentId || ''
  if (c.tournamentId) {
    const t = (await scopeTournaments(scope)).find(x => x.id === c.tournamentId)
    if (!t) return { error: 'That event is not one of yours' }
    orgId = t.orgId || orgId
    if (!c.eventDate) c.eventDate = t.firstDay || ''
  }
  if (c.contactId) {
    const contact = await getContact(c.contactId)
    if (!contact || !inScope(scope, contact.orgId)) return { error: 'That contact is not one of yours' }
    if (!tId) orgId = contact.orgId || orgId
    if (c.vendor === undefined || !c.vendor) c.vendor = contact.company || contact.name
  }
  if (!tId && !(c.eventLabel ?? cur?.eventLabel)) return { error: 'Name the event this cost was for' }
  return { orgId }
}

export async function createCost(scope: Scope, input: CostInput, by: string): Promise<{ error: string } | { cost: Row }> {
  await ensureCostTable()
  const c = clean(input)
  const r = await resolveLinks(scope, c, null)
  if ('error' in r) return r
  if (!c.vendor) return { error: 'Who is the vendor?' }
  const id = newId()
  const keys = COLS.filter(k => c[k] !== undefined)
  await prisma.$executeRawUnsafe(
    `INSERT INTO "EventCost" ("id", "orgId", "createdBy", ${keys.map(k => `"${k}"`).join(', ')}) VALUES (?, ?, ?, ${keys.map(() => '?').join(', ')})`,
    id, r.orgId, line(by, 120), ...keys.map(k => dbValue(k, c[k])))
  const row = (await getCost(id))!
  return { cost: await syncExpense(row) }
}

export async function updateCost(scope: Scope, id: string, input: CostInput): Promise<{ error: string } | { cost: Row }> {
  const cur = await getCost(id)
  if (!cur || !inScope(scope, cur.orgId)) return { error: 'Not found' }
  const c = clean(input)
  if (c.vendor === '') delete c.vendor
  const r = await resolveLinks(scope, c, cur)
  if ('error' in r) return r
  // A payment recorded (or one taken back): the list is the record; `paid`,
  // the date and the method follow from it, and paying the whole total makes
  // the line Paid. An older line with only `paid` starts its list from that.
  const add = input.addPayment ? cleanPayments([input.addPayment])[0] : undefined
  const removeAt = typeof input.removePayment === 'number' ? input.removePayment : -1
  if (add || removeAt >= 0) {
    const list = paymentsOf(cur).slice()
    if (add) list.push({ ...add, date: add.date || todayET() })
    if (removeAt >= 0 && removeAt < list.length) list.splice(removeAt, 1)
    const total = costTotal({ items: c.items ?? cur.items, tax: c.tax ?? cur.tax, budget: c.budget ?? cur.budget })
    const paidSum = round2(list.reduce((s, p) => s + p.amount, 0))
    c.payments = list
    const fullyPaid = total > 0 && paidSum >= total - 0.005
    c.status = fullyPaid ? 'paid'
      : cur.status === 'paid' || (paidSum > 0 && (cur.status === 'quoted' || cur.status === 'budget')) ? 'booked'
      : (c.status ?? cur.status)
    c.paid = fullyPaid ? total : paidSum
    const latest = list[list.length - 1]
    c.paidDate = latest?.date || ''
    c.method = latest?.method || ''
  }
  // Marking it paid (or paying a deposit) with no date pays it today.
  const paying = (c.status === 'paid' && cur.status !== 'paid') || ((c.paid || 0) > 0 && !cur.paid)
  if (paying && !c.paidDate && !cur.paidDate) c.paidDate = todayET()
  const keys = COLS.filter(k => c[k] !== undefined)
  if (keys.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE "EventCost" SET ${keys.map(k => `"${k}" = ?`).join(', ')}, "orgId" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
      ...keys.map(k => dbValue(k, c[k])), r.orgId, id)
  }
  const row = (await getCost(id))!
  // Moved off the tournament: its old Financials expense goes.
  if (cur.transactionId && row.tournamentId !== cur.tournamentId) await dropExpense(row)
  return { cost: await syncExpense(row) }
}

export async function deleteCost(scope: Scope, id: string): Promise<boolean> {
  const cur = await getCost(id)
  if (!cur || !inScope(scope, cur.orgId)) return false
  await dropExpense(cur)
  await prisma.$executeRawUnsafe(`UPDATE "EventCost" SET "deletedAt" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`, new Date().toISOString(), id)
  return true
}

async function setTransaction(id: string, txId: string) {
  await prisma.$executeRawUnsafe(`UPDATE "EventCost" SET "transactionId" = ? WHERE id = ?`, txId, id)
}

async function dropExpense(row: Row) {
  if (!row.transactionId) return
  await prisma.tournamentTransaction.deleteMany({ where: { id: row.transactionId } })
  await setTransaction(row.id, '')
  row.transactionId = ''
}

/**
 * Money paid on a tournament line = one Financials expense for what has been
 * paid: the whole total once Paid, the deposit before that. Nothing paid = none.
 */
export async function syncExpense(row: Row): Promise<Row> {
  const amount = paidSoFar(row)
  if (!(amount > 0) || !row.tournamentId) { await dropExpense(row); return row }
  const deposit = row.status !== 'paid'
  const data = {
    category: row.category,
    description: [row.vendor, row.quoteRef ? `#${row.quoteRef}` : '', deposit ? `deposit (of ${money(costTotal(row))})` : ''].filter(Boolean).join(' '),
    amount,
    method: row.method || 'check',
    date: row.paidDate || todayET(),
    notes: 'From Budget',
  }
  const existing = row.transactionId ? await prisma.tournamentTransaction.findUnique({ where: { id: row.transactionId } }) : null
  if (existing && existing.tournamentId === row.tournamentId) {
    await prisma.tournamentTransaction.update({ where: { id: existing.id }, data })
    return row
  }
  const tx = await prisma.tournamentTransaction.create({ data: { tournamentId: row.tournamentId, type: 'expense', ...data } })
  await setTransaction(row.id, tx.id)
  row.transactionId = tx.id
  return row
}

/** Every cost line this scope can see, optionally narrowed to one event or vendor. */
export async function collectCosts(scope: Scope, opts: { tournamentId?: string; contactId?: string; vendorIds?: string[] } = {}): Promise<CostView[]> {
  await ensureCostTable()
  const raw: Record<string, unknown>[] = 'all' in scope
    ? await prisma.$queryRawUnsafe(`SELECT * FROM "EventCost" WHERE "deletedAt" = '' ORDER BY "eventDate" DESC, "createdAt"`)
    : await prisma.$queryRawUnsafe(`SELECT * FROM "EventCost" WHERE "orgId" = ? AND "deletedAt" = '' ORDER BY "eventDate" DESC, "createdAt"`, scope.orgId)
  let rows = raw.map(toRow)
  if (opts.contactId) rows = rows.filter(r => r.contactId === opts.contactId)
  if (opts.tournamentId) {
    // An event's lines, plus every other line from the same vendors (and from
    // the event's contacts, `vendorIds`): the Budget tab compares this year to
    // last, and offers last year's order to a vendor not budgeted yet.
    const vendors = new Set([...(opts.vendorIds || []), ...rows.filter(r => r.tournamentId === opts.tournamentId).map(r => r.contactId)].filter(Boolean))
    rows = rows.filter(r => r.tournamentId === opts.tournamentId || (r.contactId && vendors.has(r.contactId)))
  }
  return rows.map(view)
}
