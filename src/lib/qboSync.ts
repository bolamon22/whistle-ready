// KEEPING QUICKBOOKS UP TO DATE FROM WHISTLE READY.
//
// Bo, Oct 5 2026: "I don't want to be working in both systems. I'd like to
// possibly just send it to QuickBooks, have it accounted for in there... Our next
// invoice number is 1392." Registrations, invoices and payments happen in
// Whistle Ready; QuickBooks gets a copy of each, numbered in its own sequence.
//
// What happens, once the sync is turned on (registrations page > QuickBooks):
//  - A registration made from then on gets a QuickBooks invoice: the next free
//    number (the company numbers invoices itself, so QuickBooks won't), the club
//    as the customer (found by name, then by the contact's email, else created),
//    one line per team under the event's own item ("Monster Mash Lax Clash 2026",
//    made next to the "Team Tournament Fee" items the first time), due the day
//    before the event, QuickBooks' own online payment turned off.
//  - Registrations from before then go only when the office sends them (the
//    backfill, after Bo has seen the list) or presses Sync on the card.
//  - A linked invoice is updated when its teams, amounts, discount, club or
//    event dates change. Never its number or date.
//  - Every payment recorded in Whistle Ready (card, bank transfer, PayPal,
//    check, Zelle, cash) is recorded against it, into Undeposited Funds, so the
//    bank deposits match up there. QuickBooks adds a 2% late fee a month from 30
//    days past due, so a payment that never reached it would bill a paid club.
//    Refunds are listed for the office to enter by hand.
//
// One sync at a time per org (an AppSetting lock), so two can never take the
// same number. Runs from the cron (every 15 minutes), the card's Sync and the
// backfill. Server only.
import { prisma } from '@/lib/db'
import { qboConnection, qboFetch, qboQuery, qboCompanyName, qq, QboError, type QboConnection, type QboProblem } from '@/lib/qbo'
import { orgForTournament, type Org } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { parsePricing, type RegPricing } from '@/lib/regPricing'
import { invoiceDocFor, type InvoiceDoc } from '@/lib/invoicePdf'
import {
  eventLabel, eventItemName, dueDateFor, invoiceLines, invoiceMemo, qboInvoiceBody, syncFingerprint,
  qboPaymentBody, qboCustomerBody, matchPaymentMethod, highestDocNumber, addDays, type InvoiceBodyIn,
  vendorItemName, vendorInvoiceLines,
} from '@/lib/qboInvoice'
import { orgBaseUrl } from '@/lib/orgDomains'
import { ensureVendorInvoiceColumns, type FormSubmission } from '@/lib/formSubmissions'
import { vendorInvoiceDoc } from '@/lib/vendorInvoice'
import { vendorMoney, parseVendorPayments, type VendorPayment } from '@/lib/vendorMoney'
import { setVendorPaymentQboId } from '@/lib/vendorInvoiceStore'

export type QboSettings = {
  enabled: boolean
  /** Registrations created from this moment on go to QuickBooks by themselves. */
  startedAt: string
  /** Who turned it on: their QuickBooks login is used if the org has none of its own. */
  userId: string
  lastDocNumber?: number
  parentItemId?: string
  incomeAccountId?: string
  eventItems?: Record<string, string>
  /** Each event's vendor-booth item (vendorItem), by tournament id. */
  vendorItems?: Record<string, string>
  methods?: { Id: string; Name: string }[]
  methodsAt?: string
  lastRunAt?: string
  lastProblem?: string
  /** The QuickBooks company the sync was turned on with. It never writes to another. */
  realmId?: string
  companyName?: string
}

const KEY = (orgId: string) => `qbo:${orgId}`
const LOCK = (orgId: string) => `qboLock:${orgId}`
const LOCK_MS = 120_000
const RETRY_ERRORS_MS = 60 * 60_000
const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

export async function qboSettings(orgId: string): Promise<QboSettings> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: KEY(orgId) } })
    const v = row ? JSON.parse(row.value || '{}') : {}
    return { enabled: !!v.enabled, startedAt: String(v.startedAt || ''), userId: String(v.userId || ''), ...v }
  } catch {
    return { enabled: false, startedAt: '', userId: '' }
  }
}

export async function saveQboSettings(orgId: string, patch: Partial<QboSettings>): Promise<QboSettings> {
  const next = { ...(await qboSettings(orgId)), ...patch }
  const value = JSON.stringify(next)
  await prisma.appSetting.upsert({ where: { key: KEY(orgId) }, update: { value }, create: { key: KEY(orgId), value } })
  return next
}

/** Run `fn` holding the org's QuickBooks lock; `{ ok: false }` when another sync holds it. */
export async function withQboLock<T>(orgId: string, fn: (refresh: () => Promise<void>) => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  const key = LOCK(orgId)
  const now = new Date()
  let until = new Date(now.getTime() + LOCK_MS).toISOString()
  let got = false
  try { await prisma.appSetting.create({ data: { key, value: until } }); got = true } catch { /* the row exists */ }
  if (!got) {
    const r = await prisma.appSetting.updateMany({ where: { key, value: { lt: now.toISOString() } }, data: { value: until } })
    got = r.count === 1
  }
  if (!got) return { ok: false }
  const refresh = async () => {
    const next = new Date(Date.now() + LOCK_MS).toISOString()
    await prisma.appSetting.updateMany({ where: { key, value: until }, data: { value: next } })
    until = next
  }
  try {
    return { ok: true, value: await fn(refresh) }
  } finally {
    await prisma.appSetting.updateMany({ where: { key, value: until }, data: { value: '' } }).catch(() => {})
  }
}

let cols: Promise<void> | null = null
/** The columns the sync keeps, made on first use. */
export function ensureQboColumns(): Promise<void> {
  if (!cols) {
    cols = (async () => {
      for (const c of ['qboInvoiceId', 'qboCustomerId', 'qboDocNumber', 'qboTxnDate', 'qboSyncedHash', 'qboSyncedAt', 'qboSyncError']) {
        try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "${c}" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
      }
      try { await prisma.$executeRawUnsafe(`ALTER TABLE "RegistrationPayment" ADD COLUMN "qboPaymentId" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
    })().catch(e => { cols = null; throw e })
  }
  return cols
}

// ── Rows ─────────────────────────────────────────────────────────────────────

type RegRow = {
  id: string; tournamentId: string; clubName: string; clubContact: string; contactEmail: string; contactPhone: string
  clubBasedIn: string; invoiceAmount: number; discountAmount: number; discountNote: string
  createdAt: unknown; deletedAt: unknown
  qboInvoiceId: string; qboCustomerId: string; qboDocNumber: string; qboTxnDate: string; qboSyncedHash: string; qboSyncedAt: string; qboSyncError: string
}
type TeamRow = { registrationId: string; teamName: string; division: string; waitlisted: unknown }
type PayRow = { id: string; registrationId: string; amount: number; method: string; checkNumber: string; receivedAt: string; notes: string; stripeIntentId: string; qboPaymentId: string }

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))

/** A stored DateTime as a Date, however the driver handed it back (ISO text or epoch ms). */
export function asDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : /^\d{10,}$/.test(String(v)) ? Number(v) : NaN
  const d = isNaN(n) ? new Date(String(v)) : new Date(n)
  return isNaN(d.getTime()) ? null : d
}

/** YYYY-MM-DD of an instant on the office's (Eastern) calendar. */
export function ymdET(d: Date): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const g = (t: string) => p.find(x => x.type === t)?.value || ''
  return `${g('year')}-${g('month')}-${g('day')}`
}

function normReg(r: Record<string, unknown>): RegRow {
  return {
    id: s(r.id), tournamentId: s(r.tournamentId), clubName: s(r.clubName), clubContact: s(r.clubContact),
    contactEmail: s(r.contactEmail), contactPhone: s(r.contactPhone), clubBasedIn: s(r.clubBasedIn),
    invoiceAmount: Number(r.invoiceAmount) || 0, discountAmount: Number(r.discountAmount) || 0, discountNote: s(r.discountNote),
    createdAt: r.createdAt, deletedAt: r.deletedAt,
    qboInvoiceId: s(r.qboInvoiceId), qboCustomerId: s(r.qboCustomerId), qboDocNumber: s(r.qboDocNumber), qboTxnDate: s(r.qboTxnDate),
    qboSyncedHash: s(r.qboSyncedHash), qboSyncedAt: s(r.qboSyncedAt), qboSyncError: s(r.qboSyncError),
  }
}

type EventCtx = {
  t: { id: string; name: string; startDate: string; endDate: string; location: string }
  org: (Org & { checkPayableTo: string; checkAddress: string }) | null
  orgId: string
  pricing: RegPricing | null
}

async function loadEvent(tournamentId: string): Promise<EventCtx | null> {
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT id, name, startDate, endDate, location, registrationPricing, orgId FROM "Tournament" WHERE id = ?`, tournamentId)
  const t = rows?.[0]
  if (!t) return null
  const org = await orgForTournament(tournamentId)
  let payTo = { checkPayableTo: '', checkAddress: '' }
  try {
    const p: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT o."checkPayableTo", o."checkAddress" FROM "Organization" o JOIN "Tournament" t ON t."orgId" = o.id WHERE t.id = ?`, tournamentId)
    if (p?.[0]) payTo = { checkPayableTo: s(p[0].checkPayableTo), checkAddress: s(p[0].checkAddress) }
  } catch { /* no columns */ }
  let pricing: RegPricing | null = null
  try { pricing = parsePricing(t.registrationPricing as string) } catch { /* one total */ }
  return {
    t: { id: s(t.id), name: s(t.name), startDate: s(t.startDate), endDate: s(t.endDate), location: s(t.location) },
    org: org ? { ...org, ...payTo } : null,
    orgId: s(t.orgId) || org?.id || '',
    pricing,
  }
}

function docFor(ev: EventCtx, reg: RegRow, teams: TeamRow[], number: string): InvoiceDoc {
  return invoiceDocFor({
    reg: {
      id: reg.id, clubName: reg.clubName, clubContact: reg.clubContact, clubBasedIn: reg.clubBasedIn,
      createdAt: (asDate(reg.createdAt) || new Date()).toISOString(), invoiceAmount: reg.invoiceAmount,
      discountAmount: reg.discountAmount, discountNote: reg.discountNote,
    },
    teams: teams.map(x => ({ teamName: s(x.teamName), division: s(x.division), waitlisted: !!Number(x.waitlisted) || x.waitlisted === true })),
    payments: [],
    tournament: { name: ev.t.name, startDate: ev.t.startDate, endDate: ev.t.endDate, location: ev.t.location },
    pricing: ev.pricing,
    org: ev.org,
    clearing: null,
    payUrl: tournamentAbs(ev.org?.slug, `/pay/${reg.id}`),
    number,
  })
}

/** The invoice's registration day: the QuickBooks invoice date. */
const txnDateOf = (reg: RegRow) => ymdET(asDate(reg.createdAt) || new Date())

function bodyFor(ev: EventCtx, reg: RegRow, doc: InvoiceDoc, customerId: string, itemId: string, docNumber: string): InvoiceBodyIn {
  return {
    customerId, itemId,
    lines: invoiceLines(doc, eventLabel(ev.t)),
    discount: round2(doc.discount),
    discountNote: doc.discountNote,
    dueDate: dueDateFor(ev.t.startDate, txnDateOf(reg)),
    memo: invoiceMemo(doc, docNumber),
    privateNote: `${ev.t.name} team registration`,
    billEmail: reg.contactEmail,
  }
}

// ── QuickBooks lookups ───────────────────────────────────────────────────────

type Ctx = { conn: QboConnection; orgId: string; settings: QboSettings; lastAssigned?: number; touch?: () => Promise<void> }

export type CustomerMatch = { id: string; name: string; how: 'saved' | 'name' | 'email' | 'new' }

export async function findCustomer(conn: QboConnection, name: string, email: string): Promise<CustomerMatch | null> {
  const display = String(name || '').replace(/:/g, ' -').trim()
  const byName = await qboQuery<any>(conn, `SELECT * FROM Customer WHERE DisplayName = '${qq(display)}'`, 'Customer')
  if (byName[0]) return { id: String(byName[0].Id), name: String(byName[0].DisplayName), how: 'name' }
  const e = String(email || '').trim()
  if (e) {
    try {
      const byEmail = await qboQuery<any>(conn, `SELECT * FROM Customer WHERE PrimaryEmailAddr = '${qq(e)}'`, 'Customer')
      // Two customers on one address: no guess, a new one by the club's name.
      if (byEmail.length === 1) return { id: String(byEmail[0].Id), name: String(byEmail[0].DisplayName), how: 'email' }
    } catch { /* this company won't filter on email: name only */ }
  }
  return null
}

async function createCustomer(conn: QboConnection, reg: RegRow): Promise<CustomerMatch> {
  return createCustomerFor(conn, { name: reg.clubName, contact: reg.clubContact, email: reg.contactEmail, phone: reg.contactPhone, place: reg.clubBasedIn }, 'club')
}

/** A new customer: a club, or a vendor's company. `clash` names it apart when the name
 *  is taken by a QuickBooks vendor (a supplier) or the like: "Kona Ice (booth)". */
async function createCustomerFor(conn: QboConnection, c: { name: string; contact: string; email: string; phone: string; place: string }, clash: string): Promise<CustomerMatch> {
  const base = { clubName: c.name, contact: c.contact, email: c.email, phone: c.phone, place: c.place }
  try {
    const j: any = await qboFetch(conn, 'customer', { method: 'POST', body: qboCustomerBody(base) })
    return { id: String(j.Customer.Id), name: String(j.Customer.DisplayName), how: 'new' }
  } catch (e) {
    // 6240: the name is taken, by an inactive customer or a vendor. An inactive
    // customer comes back; anything else gets a name of its own.
    if (!(e instanceof QboError) || e.code !== '6240') throw e
    const inactive = await qboQuery<any>(conn, `SELECT * FROM Customer WHERE DisplayName = '${qq(c.name.replace(/:/g, ' -').trim())}' AND Active = false`, 'Customer').catch(() => [])
    if (inactive[0]) {
      const j: any = await qboFetch(conn, 'customer', { method: 'POST', body: { Id: inactive[0].Id, SyncToken: inactive[0].SyncToken, sparse: true, Active: true } })
      return { id: String(j.Customer.Id), name: String(j.Customer.DisplayName), how: 'name' }
    }
    const j: any = await qboFetch(conn, 'customer', { method: 'POST', body: qboCustomerBody(base, `${c.name} (${clash})`) })
    return { id: String(j.Customer.Id), name: String(j.Customer.DisplayName), how: 'new' }
  }
}

/** The event's item, made the first time under the same category and income account as the existing team fees. */
async function eventItem(ctx: Ctx, ev: EventCtx): Promise<string> {
  const saved = ctx.settings.eventItems?.[ev.t.id]
  if (saved) return saved
  const name = eventItemName(ev.t)
  const found = await qboQuery<any>(ctx.conn, `SELECT * FROM Item WHERE Name = '${qq(name)}'`, 'Item')
  let id = String(found.find((i: any) => i.Type !== 'Category')?.Id || '')
  if (!id) {
    await ensureIncomeAccount(ctx)
    const parent = ctx.settings.parentItemId
    const j: any = await qboFetch(ctx.conn, 'item', {
      method: 'POST',
      body: { Name: name, Type: 'Service', IncomeAccountRef: { value: ctx.settings.incomeAccountId }, Taxable: false, ...(parent ? { SubItem: true, ParentRef: { value: parent } } : {}) },
    })
    id = String(j.Item.Id)
  }
  ctx.settings = await saveQboSettings(ctx.orgId, { eventItems: { ...(ctx.settings.eventItems || {}), [ev.t.id]: id } })
  return id
}

/** The income account (and category) the team fees use, found the first time from the
 *  existing "Team Tournament Fee" items. */
async function ensureIncomeAccount(ctx: Ctx): Promise<void> {
  if (ctx.settings.incomeAccountId) return
  const items = await qboQuery<any>(ctx.conn, `SELECT * FROM Item WHERE Type = 'Service' MAXRESULTS 1000`, 'Item')
  const fee = items.find((i: any) => /^Team Tournament Fee:/i.test(String(i.FullyQualifiedName || '')) && i.IncomeAccountRef?.value)
  const any = fee || items.find((i: any) => i.IncomeAccountRef?.value)
  if (!any) throw new QboError('QuickBooks has no service item with an income account to copy for the event item.')
  ctx.settings = await saveQboSettings(ctx.orgId, { incomeAccountId: String(any.IncomeAccountRef.value), parentItemId: String(fee?.ParentRef?.value || '') })
}

/** The event's vendor-booth item, "Vendor Booth - Monster Mash Lax Clash 2026", made the
 *  first time with the team fees' income account but not under their category, so
 *  QuickBooks reports booth fees apart from team fees, event by event. Its income
 *  account can be changed on the item in QuickBooks; later invoices keep using it. */
async function vendorItem(ctx: Ctx, ev: EventCtx): Promise<string> {
  const saved = ctx.settings.vendorItems?.[ev.t.id]
  if (saved) return saved
  const name = vendorItemName(ev.t)
  const found = await qboQuery<any>(ctx.conn, `SELECT * FROM Item WHERE Name = '${qq(name)}'`, 'Item')
  let id = String(found.find((i: any) => i.Type !== 'Category')?.Id || '')
  if (!id) {
    await ensureIncomeAccount(ctx)
    const j: any = await qboFetch(ctx.conn, 'item', {
      method: 'POST',
      body: { Name: name, Type: 'Service', IncomeAccountRef: { value: ctx.settings.incomeAccountId }, Taxable: false },
    })
    id = String(j.Item.Id)
  }
  ctx.settings = await saveQboSettings(ctx.orgId, { vendorItems: { ...(ctx.settings.vendorItems || {}), [ev.t.id]: id } })
  return id
}

/** The next free invoice number: one past the highest on any recent sales form
 *  or the last one this sync used, and checked to be unused. */
async function nextDocNumber(ctx: Ctx): Promise<string> {
  let base = ctx.lastAssigned
  if (base === undefined) {
    const since = addDays(ymdET(new Date()), -400)
    const rows: { DocNumber?: string }[] = []
    for (const e of ['Invoice', 'SalesReceipt', 'CreditMemo']) {
      rows.push(...await qboQuery<any>(ctx.conn, `SELECT * FROM ${e} WHERE TxnDate >= '${since}' MAXRESULTS 1000`, e).catch(() => []))
    }
    base = Math.max(highestDocNumber(rows), Number(ctx.settings.lastDocNumber) || 0)
  }
  for (let i = 1; i <= 25; i++) {
    const n = base + i
    const hit = await qboQuery<any>(ctx.conn, `SELECT * FROM Invoice WHERE DocNumber = '${n}'`, 'Invoice')
    if (!hit.length) { ctx.lastAssigned = n; return String(n) }
  }
  throw new QboError('Could not find a free invoice number in QuickBooks.')
}

async function paymentMethods(ctx: Ctx): Promise<{ Id: string; Name: string }[]> {
  const fresh = ctx.settings.methodsAt && Date.now() - new Date(ctx.settings.methodsAt).getTime() < 86_400_000
  if (fresh && ctx.settings.methods) return ctx.settings.methods
  const rows = await qboQuery<any>(ctx.conn, `SELECT * FROM PaymentMethod`, 'PaymentMethod').catch(() => [])
  const methods = rows.map((m: any) => ({ Id: String(m.Id), Name: String(m.Name || '') }))
  ctx.settings = await saveQboSettings(ctx.orgId, { methods, methodsAt: new Date().toISOString() })
  return methods
}

// ── One registration ─────────────────────────────────────────────────────────

export type SyncResult = {
  /** The registration's id, or the vendor application's (kind 'vendor'). */
  regId: string; club: string
  kind?: 'vendor'
  status: 'created' | 'updated' | 'paid' | 'unchanged' | 'skipped' | 'error'
  docNumber?: string; payments?: number; message?: string; customer?: CustomerMatch
}

async function saveReg(id: string, f: Partial<Pick<RegRow, 'qboInvoiceId' | 'qboCustomerId' | 'qboDocNumber' | 'qboTxnDate' | 'qboSyncedHash' | 'qboSyncedAt' | 'qboSyncError'>>) {
  const keys = Object.keys(f)
  if (!keys.length) return
  await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET ${keys.map(k => `"${k}" = ?`).join(', ')} WHERE id = ?`, ...keys.map(k => (f as any)[k]), id)
}

/**
 * Bring one registration's QuickBooks invoice and payments up to date. `create`
 * lets it make an invoice for a registration that has none; without it only a
 * linked one is touched. Call inside withQboLock.
 */
export async function syncRegistration(ctx: Ctx, regId: string, create: boolean): Promise<SyncResult> {
  await ensureQboColumns()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT * FROM "TeamRegistration" WHERE id = ?`, regId)
  if (!rows?.[0]) return { regId, club: '', status: 'skipped', message: 'Registration not found' }
  const reg = normReg(rows[0])
  const out = (r: Omit<SyncResult, 'regId' | 'club'>): SyncResult => ({ regId, club: reg.clubName, ...r })
  const linked = !!reg.qboInvoiceId
  try {
    if (asDate(reg.deletedAt)) {
      if (!linked) return out({ status: 'skipped', message: 'Deleted' })
      const msg = `Deleted in Whistle Ready. Invoice ${reg.qboDocNumber} is still in QuickBooks; void it there if it shouldn't stand.`
      if (reg.qboSyncError !== msg) await saveReg(regId, { qboSyncError: msg })
      return out({ status: 'skipped', docNumber: reg.qboDocNumber, message: msg })
    }
    const ev = await loadEvent(reg.tournamentId)
    if (!ev) return out({ status: 'skipped', message: 'Event not found' })
    const teams: TeamRow[] = await prisma.$queryRawUnsafe(`SELECT registrationId, teamName, division, waitlisted FROM "RegisteredTeam" WHERE registrationId = ? ORDER BY rowid`, regId)
    const due = round2(reg.invoiceAmount - reg.discountAmount)
    // A number given by hand (setInvoiceNumber) counts as a request to send.
    if (!linked && ((!create && !reg.qboDocNumber) || due <= 0)) return out({ status: 'skipped', message: due <= 0 ? 'Nothing invoiced' : 'Not sent to QuickBooks' })

    let linkedNow = linked
    let invoiceId = reg.qboInvoiceId
    let customerId = reg.qboCustomerId
    let syncedHash = reg.qboSyncedHash
    if (!linked && reg.qboDocNumber) {
      // Numbered by hand: the invoice may already be in QuickBooks (made there by
      // hand, like M&D Orlando's 1392). Link it rather than make a second one.
      const found = await qboQuery<any>(ctx.conn, `SELECT * FROM Invoice WHERE DocNumber = '${qq(reg.qboDocNumber)}'`, 'Invoice')
      if (found.length > 1) throw new QboError(`More than one QuickBooks invoice is numbered ${reg.qboDocNumber}.`)
      if (found.length === 1) {
        const other: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT id FROM "TeamRegistration" WHERE "qboInvoiceId" = ? AND id != ?`, String(found[0].Id), regId)
        if (other.length) throw new QboError(`QuickBooks invoice ${reg.qboDocNumber} is already linked to another registration.`)
        invoiceId = String(found[0].Id)
        customerId = String(found[0].CustomerRef?.value || '')
        syncedHash = ''
        await saveReg(regId, { qboInvoiceId: invoiceId, qboCustomerId: customerId, qboTxnDate: String(found[0].TxnDate || ''), qboSyncedHash: '' })
        linkedNow = true
      }
    }

    const customer: CustomerMatch = customerId ? { id: customerId, name: reg.clubName, how: 'saved' } : (await findCustomer(ctx.conn, reg.clubName, reg.contactEmail)) || await createCustomer(ctx.conn, reg)
    if (!customerId) await saveReg(regId, { qboCustomerId: customer.id })
    const itemId = await eventItem(ctx, ev)

    let status: SyncResult['status'] = 'unchanged'
    let docNumber = reg.qboDocNumber
    let balance: number | null = null
    const now = new Date().toISOString()

    if (!linkedNow) {
      // A number given by hand is used as it is; otherwise the next free one.
      docNumber = reg.qboDocNumber || await nextDocNumber(ctx)
      const doc = docFor(ev, reg, teams, docNumber)
      const b = bodyFor(ev, reg, doc, customer.id, itemId, docNumber)
      const j: any = await qboFetch(ctx.conn, 'invoice', { method: 'POST', body: qboInvoiceBody({ ...b, docNumber, txnDate: txnDateOf(reg) }) })
      invoiceId = String(j.Invoice.Id)
      docNumber = String(j.Invoice.DocNumber || docNumber)
      balance = Number(j.Invoice.Balance ?? j.Invoice.TotalAmt) || 0
      await saveReg(regId, { qboInvoiceId: invoiceId, qboDocNumber: docNumber, qboTxnDate: String(j.Invoice.TxnDate || txnDateOf(reg)), qboSyncedHash: syncFingerprint(b), qboSyncedAt: now, qboSyncError: '' })
      ctx.settings = await saveQboSettings(ctx.orgId, { lastDocNumber: Math.max(Number(docNumber) || 0, Number(ctx.settings.lastDocNumber) || 0) })
      status = 'created'
    } else {
      const doc = docFor(ev, reg, teams, docNumber)
      const b = bodyFor(ev, reg, doc, customer.id, itemId, docNumber)
      const fp = syncFingerprint(b)
      if (fp !== syncedHash) {
        const cur: any = await qboFetch(ctx.conn, `invoice/${encodeURIComponent(invoiceId)}`)
        const body = qboInvoiceBody(b)
        const j: any = await qboFetch(ctx.conn, 'invoice', { method: 'POST', body: { Id: invoiceId, SyncToken: cur.Invoice.SyncToken, sparse: true, ...body } })
        balance = Number(j.Invoice.Balance ?? j.Invoice.TotalAmt) || 0
        await saveReg(regId, { qboSyncedHash: fp, qboSyncedAt: now, qboSyncError: '' })
        status = 'updated'
      }
    }

    // Payments recorded in Whistle Ready that QuickBooks hasn't had yet.
    const pays: PayRow[] = (await prisma.$queryRawUnsafe(
      `SELECT * FROM "RegistrationPayment" WHERE registrationId = ? ORDER BY receivedAt, rowid`, regId) as Record<string, unknown>[])
      .map(p => ({ id: s(p.id), registrationId: s(p.registrationId), amount: Number(p.amount) || 0, method: s(p.method), checkNumber: s(p.checkNumber), receivedAt: s(p.receivedAt), notes: s(p.notes), stripeIntentId: s(p.stripeIntentId), qboPaymentId: s(p.qboPaymentId) }))
    const pending = pays.filter(p => p.amount > 0 && !p.qboPaymentId)
    let sent = 0
    if (pending.length) {
      if (balance === null) {
        const cur: any = await qboFetch(ctx.conn, `invoice/${encodeURIComponent(invoiceId)}`)
        balance = Number(cur.Invoice.Balance) || 0
      }
      const methods = await paymentMethods(ctx)
      for (const p of pending) {
        const applied = Math.max(0, Math.min(p.amount, balance))
        const date = /^\d{4}-\d{2}-\d{2}/.exec(p.receivedAt)?.[0] || ymdET(new Date())
        const j: any = await qboFetch(ctx.conn, 'payment', {
          method: 'POST',
          body: qboPaymentBody({
            customerId: customer.id, invoiceId, amount: p.amount, applied, date,
            refNum: p.checkNumber || (p.stripeIntentId ? p.stripeIntentId.slice(-21) : ''),
            note: `Whistle Ready: ${p.method || 'payment'}${p.notes ? ` · ${p.notes}` : ''}`,
            methodId: matchPaymentMethod(p.method, methods),
          }),
        })
        await prisma.$executeRawUnsafe(`UPDATE "RegistrationPayment" SET "qboPaymentId" = ? WHERE id = ?`, String(j.Payment.Id), p.id)
        balance = round2(balance - applied)
        sent++
        if (ctx.touch) await ctx.touch()
      }
      await saveReg(regId, { qboSyncedAt: new Date().toISOString(), qboSyncError: '' })
      if (status === 'unchanged') status = 'paid'
    }
    // Nothing needed doing and the last attempt had failed: it's fine now.
    if (status === 'unchanged' && reg.qboSyncError) await saveReg(regId, { qboSyncError: '' })
    return out({ status, docNumber, payments: sent, customer })
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500) || 'QuickBooks sync failed'
    await saveReg(regId, { qboSyncError: msg, qboSyncedAt: new Date().toISOString() }).catch(() => {})
    return out({ status: 'error', docNumber: reg.qboDocNumber || undefined, message: msg })
  }
}

// ── One vendor ───────────────────────────────────────────────────────────────
// Bo, Oct 12 2026: vendor invoices go to QuickBooks the way the clubs' do. An
// approved vendor's booth fee becomes an invoice in the same number sequence,
// with the vendor's company as the customer and the event's own vendor-booth
// item (vendorItem); the payments the office records by hand and the booth
// page's online payment follow it. Sent by itself when approved after the sync
// was turned on; one approved before then goes when the office sends it.

type VendorRow = {
  id: string; orgId: string; tournamentId: string; data: any; passToken: string
  status: string; statusAt: string; submittedAt: string; archivedAt: string
  amountDue: number; paymentStatus: string; paidAt: string; stripeRef: string
  payments: VendorPayment[]
  qboInvoiceId: string; qboCustomerId: string; qboDocNumber: string; qboTxnDate: string
  qboSyncedHash: string; qboSyncedAt: string; qboSyncError: string; qboOnlinePaymentId: string
}

function normVendor(r: Record<string, unknown>): VendorRow {
  let data: any = {}
  try { data = JSON.parse(s(r.data) || '{}') } catch { /* no data */ }
  return {
    id: s(r.id), orgId: s(r.orgId), tournamentId: s(r.tournamentId), data, passToken: s(r.passToken),
    status: s(r.status), statusAt: s(r.statusAt), submittedAt: s(r.submittedAt), archivedAt: s(r.archivedAt),
    amountDue: Number(r.amountDue) || 0, paymentStatus: s(r.paymentStatus), paidAt: s(r.paidAt), stripeRef: s(r.stripeRef),
    payments: parseVendorPayments(r.vendorPayments),
    qboInvoiceId: s(r.qboInvoiceId), qboCustomerId: s(r.qboCustomerId), qboDocNumber: s(r.qboDocNumber), qboTxnDate: s(r.qboTxnDate),
    qboSyncedHash: s(r.qboSyncedHash), qboSyncedAt: s(r.qboSyncedAt), qboSyncError: s(r.qboSyncError), qboOnlinePaymentId: s(r.qboOnlinePaymentId),
  }
}

const vendorName = (v: VendorRow) => String(v.data?.companyName || '').trim() || 'Vendor'
/** The fee as approved. Rows approved before it was frozen fall back to the quote. */
const vendorFee = (v: { amountDue: number; data: any }) => round2(v.amountDue > 0 ? v.amountDue : Number(v.data?.boothFee) || 0)
const vendorLive = (v: { status?: string; archivedAt?: string | null }) => v.status === 'approved' && !v.archivedAt
/** The day the fee was set: the QuickBooks invoice date. */
const vendorTxnDate = (v: VendorRow) => ymdET(asDate(v.statusAt) || asDate(v.submittedAt) || new Date())

/** The invoice as the PDF draws it, without payments (they go to QuickBooks as payments). */
function vendorDoc(ev: EventCtx, v: VendorRow, number: string): InvoiceDoc {
  return vendorInvoiceDoc({
    sub: { id: v.id, data: v.data, amountDue: vendorFee(v), statusAt: v.statusAt, submittedAt: v.submittedAt },
    payments: [],
    tournament: { name: ev.t.name, startDate: ev.t.startDate, endDate: ev.t.endDate, location: ev.t.location },
    org: ev.org,
    payUrl: `${orgBaseUrl(ev.org?.slug)}/vendor/${v.passToken}`,
    number,
  })
}

function vendorBody(ev: EventCtx, v: VendorRow, doc: InvoiceDoc, customerId: string, itemId: string, docNumber: string): InvoiceBodyIn {
  return {
    customerId, itemId,
    lines: vendorInvoiceLines(doc, eventLabel(ev.t)),
    discount: 0,
    dueDate: dueDateFor(ev.t.startDate, vendorTxnDate(v)),
    memo: invoiceMemo(doc, docNumber),
    privateNote: `${ev.t.name} vendor booth`,
    billEmail: String(v.data?.email || ''),
  }
}

async function saveVendor(id: string, f: Partial<Pick<VendorRow, 'qboInvoiceId' | 'qboCustomerId' | 'qboDocNumber' | 'qboTxnDate' | 'qboSyncedHash' | 'qboSyncedAt' | 'qboSyncError' | 'qboOnlinePaymentId'>>) {
  const keys = Object.keys(f)
  if (!keys.length) return
  await prisma.$executeRawUnsafe(`UPDATE "OrgFormSubmission" SET ${keys.map(k => `"${k}" = ?`).join(', ')} WHERE id = ? AND "formType" = 'vendor'`, ...keys.map(k => (f as any)[k]), id)
}

/** Payments on a vendor that QuickBooks hasn't had: the office's, then the booth page's. */
function vendorPaymentsWaiting(v: VendorRow): boolean {
  const money = vendorMoney({ amountDue: vendorFee(v), paymentStatus: v.paymentStatus, stripeRef: v.stripeRef }, v.payments)
  return v.payments.some(p => p.amount > 0 && !p.qboPaymentId) || (money.online > 0 && !v.qboOnlinePaymentId)
}

/**
 * Bring one approved vendor's QuickBooks invoice and payments up to date. `create`
 * lets it make the invoice when there is none. Call inside withQboLock.
 */
export async function syncVendor(ctx: Ctx, subId: string, create: boolean): Promise<SyncResult> {
  await ensureVendorInvoiceColumns()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT * FROM "OrgFormSubmission" WHERE id = ? AND "formType" = 'vendor'`, subId)
  if (!rows?.[0]) return { regId: subId, club: '', kind: 'vendor', status: 'skipped', message: 'Vendor not found' }
  const v = normVendor(rows[0])
  const out = (r: Omit<SyncResult, 'regId' | 'club'>): SyncResult => ({ regId: subId, club: vendorName(v), kind: 'vendor', ...r })
  const linked = !!v.qboInvoiceId
  try {
    if (!vendorLive(v)) {
      if (!linked) return out({ status: 'skipped', message: 'Not approved' })
      const msg = `No longer approved in Whistle Ready. Invoice ${v.qboDocNumber} is still in QuickBooks; void it there if it shouldn't stand.`
      if (v.qboSyncError !== msg) await saveVendor(subId, { qboSyncError: msg })
      return out({ status: 'skipped', docNumber: v.qboDocNumber, message: msg })
    }
    if (!v.passToken) return out({ status: 'skipped', message: 'No booth page yet' })
    const ev = await loadEvent(v.tournamentId)
    if (!ev) return out({ status: 'skipped', message: 'Event not found' })
    const fee = vendorFee(v)
    if (!linked && (!create || fee <= 0)) return out({ status: 'skipped', message: fee <= 0 ? 'No booth fee' : 'Not sent to QuickBooks' })

    const email = String(v.data?.email || '').trim()
    const customer: CustomerMatch = v.qboCustomerId ? { id: v.qboCustomerId, name: vendorName(v), how: 'saved' }
      : (await findCustomer(ctx.conn, vendorName(v), email))
        || await createCustomerFor(ctx.conn, { name: vendorName(v), contact: String(v.data?.companyContact || ''), email, phone: String(v.data?.phone || ''), place: '' }, 'booth')
    if (!v.qboCustomerId) await saveVendor(subId, { qboCustomerId: customer.id })
    const itemId = await vendorItem(ctx, ev)

    let status: SyncResult['status'] = 'unchanged'
    let docNumber = v.qboDocNumber
    let invoiceId = v.qboInvoiceId
    let balance: number | null = null
    const now = new Date().toISOString()

    if (!linked) {
      docNumber = await nextDocNumber(ctx)
      const b = vendorBody(ev, v, vendorDoc(ev, v, docNumber), customer.id, itemId, docNumber)
      const j: any = await qboFetch(ctx.conn, 'invoice', { method: 'POST', body: qboInvoiceBody({ ...b, docNumber, txnDate: vendorTxnDate(v) }) })
      invoiceId = String(j.Invoice.Id)
      docNumber = String(j.Invoice.DocNumber || docNumber)
      balance = Number(j.Invoice.Balance ?? j.Invoice.TotalAmt) || 0
      await saveVendor(subId, { qboInvoiceId: invoiceId, qboDocNumber: docNumber, qboTxnDate: String(j.Invoice.TxnDate || vendorTxnDate(v)), qboSyncedHash: syncFingerprint(b), qboSyncedAt: now, qboSyncError: '' })
      ctx.settings = await saveQboSettings(ctx.orgId, { lastDocNumber: Math.max(Number(docNumber) || 0, Number(ctx.settings.lastDocNumber) || 0) })
      status = 'created'
    } else {
      const b = vendorBody(ev, v, vendorDoc(ev, v, docNumber), customer.id, itemId, docNumber)
      const fp = syncFingerprint(b)
      if (fp !== v.qboSyncedHash) {
        const cur: any = await qboFetch(ctx.conn, `invoice/${encodeURIComponent(invoiceId)}`)
        const j: any = await qboFetch(ctx.conn, 'invoice', { method: 'POST', body: { Id: invoiceId, SyncToken: cur.Invoice.SyncToken, sparse: true, ...qboInvoiceBody(b) } })
        balance = Number(j.Invoice.Balance ?? j.Invoice.TotalAmt) || 0
        await saveVendor(subId, { qboSyncedHash: fp, qboSyncedAt: now, qboSyncError: '' })
        status = 'updated'
      }
    }

    // Payments QuickBooks hasn't had: the office's, then the booth page's (Stripe).
    const money = vendorMoney({ amountDue: fee, paymentStatus: v.paymentStatus, stripeRef: v.stripeRef }, v.payments)
    const pending: { amount: number; date: string; refNum: string; method: string; note: string; save: (qboId: string) => Promise<void> }[] = [
      ...v.payments.filter(p => p.amount > 0 && !p.qboPaymentId).map(p => ({
        amount: p.amount, date: p.receivedAt || ymdET(new Date()), refNum: p.checkNumber || '', method: p.method,
        note: `Whistle Ready: ${p.method}${p.note ? ` · ${p.note}` : ''}`,
        save: (qboId: string) => setVendorPaymentQboId(v.orgId, subId, p.id, qboId),
      })),
      ...(money.online > 0 && !v.qboOnlinePaymentId ? [{
        amount: money.online, date: ymdET(asDate(v.paidAt) || new Date()), refNum: v.stripeRef.slice(-21), method: '',
        note: 'Whistle Ready: paid online on the booth page (Stripe)',
        save: (qboId: string) => saveVendor(subId, { qboOnlinePaymentId: qboId }),
      }] : []),
    ]
    let sent = 0
    if (pending.length) {
      if (balance === null) {
        const cur: any = await qboFetch(ctx.conn, `invoice/${encodeURIComponent(invoiceId)}`)
        balance = Number(cur.Invoice.Balance) || 0
      }
      const methods = await paymentMethods(ctx)
      for (const p of pending) {
        const applied = Math.max(0, Math.min(p.amount, balance))
        const j: any = await qboFetch(ctx.conn, 'payment', {
          method: 'POST',
          body: qboPaymentBody({
            customerId: customer.id, invoiceId, amount: p.amount, applied, date: p.date,
            refNum: p.refNum, note: p.note, methodId: p.method ? matchPaymentMethod(p.method, methods) : '',
          }),
        })
        await p.save(String(j.Payment.Id))
        balance = round2(balance - applied)
        sent++
        if (ctx.touch) await ctx.touch()
      }
      await saveVendor(subId, { qboSyncedAt: new Date().toISOString(), qboSyncError: '' })
      if (status === 'unchanged') status = 'paid'
    }
    if (status === 'unchanged' && v.qboSyncError) await saveVendor(subId, { qboSyncError: '' })
    return out({ status, docNumber, payments: sent, customer })
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500) || 'QuickBooks sync failed'
    await saveVendor(subId, { qboSyncError: msg, qboSyncedAt: new Date().toISOString() }).catch(() => {})
    return out({ status: 'error', docNumber: v.qboDocNumber || undefined, message: msg })
  }
}

/** Vendors the cron should look at, worked out from the database alone (no QuickBooks calls). */
export async function pendingVendorsFor(orgId: string, settings: QboSettings): Promise<{ id: string; create: boolean; why: string }[]> {
  await ensureVendorInvoiceColumns()
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT * FROM "OrgFormSubmission" WHERE "orgId" = ? AND "formType" = 'vendor' AND ("status" = 'approved' OR "qboInvoiceId" != '')`, orgId) as Record<string, unknown>[]).map(normVendor)
  if (!rows.length) return []
  const started = asDate(settings.startedAt)
  const nowMs = Date.now()
  const retryOk = (v: VendorRow) => !v.qboSyncError || nowMs - (asDate(v.qboSyncedAt)?.getTime() || 0) > RETRY_ERRORS_MS
  const events = new Map<string, EventCtx | null>()
  const out: { id: string; create: boolean; why: string }[] = []
  for (const v of rows) {
    if (v.qboInvoiceId) {
      if (!vendorLive(v)) { if (!v.qboSyncError) out.push({ id: v.id, create: false, why: 'unapproved' }); continue }
      if (!events.has(v.tournamentId)) events.set(v.tournamentId, await loadEvent(v.tournamentId).catch(() => null))
      const ev = events.get(v.tournamentId) || null
      const itemId = settings.vendorItems?.[v.tournamentId]
      const changed = !ev || !itemId
        || syncFingerprint(vendorBody(ev, v, vendorDoc(ev, v, v.qboDocNumber), v.qboCustomerId, itemId, v.qboDocNumber)) !== v.qboSyncedHash
      const payments = vendorPaymentsWaiting(v)
      if ((changed || payments) && retryOk(v)) out.push({ id: v.id, create: false, why: changed ? 'changed' : 'payments' })
      continue
    }
    const approvedAt = asDate(v.statusAt)
    if (!vendorLive(v) || !started || !approvedAt || approvedAt < started) continue
    if (vendorFee(v) <= 0 || !v.passToken || !retryOk(v)) continue
    out.push({ id: v.id, create: true, why: 'new' })
  }
  return out
}

/** Send vendors to QuickBooks now (the vendor page's Send to QuickBooks, and Email
 *  invoice with the sync on), making invoices where there are none. */
export async function syncVendorsNow(orgId: string, subIds: string[], opts: { userId?: string; budgetMs?: number } = {}):
  Promise<{ ok: true; results: SyncResult[]; remaining: string[] } | { ok: false; busy?: boolean; message: string }> {
  await ensureVendorInvoiceColumns()
  const conn = await verifiedConnection(orgId, opts.userId ? [opts.userId] : [])
  if (!conn.ok) return { ok: false, message: conn.message }
  const started = Date.now()
  const budget = opts.budgetMs ?? 40_000
  const locked = await withQboLock(orgId, async touch => {
    const ctx: Ctx = { conn, orgId, settings: await qboSettings(orgId), touch }
    const results: SyncResult[] = []
    const ids = [...new Set(subIds.filter(Boolean))]
    let i = 0
    for (; i < ids.length && Date.now() - started < budget; i++) {
      results.push(await syncVendor(ctx, ids[i], true))
      await touch()
    }
    return { results, remaining: ids.slice(i) }
  })
  if (!locked.ok) return { ok: false, busy: true, message: 'A QuickBooks sync is already running. Try again in a minute.' }
  return { ok: true, ...locked.value }
}

export type VendorQboState = {
  /** in = in QuickBooks and current; payments = a payment is waiting to go; queued = approved
   *  since the sync was turned on, goes on the next run; out = not sent (approved before
   *  then, or the sync is off); none = no fee; error = the last attempt failed, or the
   *  approval was undone after it went. */
  state: 'in' | 'payments' | 'queued' | 'out' | 'none' | 'error'
  docNumber: string
  error: string
  syncedAt: string
}

/** Where one vendor stands with QuickBooks, from its row alone (for the vendor page). */
export function vendorQboState(sub: FormSubmission, settings: QboSettings): VendorQboState {
  const docNumber = String(sub.qboInvoiceId ? sub.qboDocNumber || '' : '')
  const base = { docNumber, error: String(sub.qboSyncError || ''), syncedAt: String(sub.qboSyncedAt || '') }
  if (sub.qboSyncError) return { state: 'error', ...base }
  const fee = vendorFee({ amountDue: Number(sub.amountDue) || 0, data: sub.data })
  if (sub.qboInvoiceId) {
    const payments = sub.vendorPayments || []
    const money = vendorMoney({ amountDue: fee, paymentStatus: sub.paymentStatus, stripeRef: sub.stripeRef }, payments)
    const waiting = payments.some(p => !p.qboPaymentId) || (money.online > 0 && !sub.qboOnlinePaymentId)
    return { state: waiting ? 'payments' : 'in', ...base }
  }
  if (fee <= 0) return { state: 'none', ...base }
  const started = asDate(settings.startedAt), approvedAt = asDate(sub.statusAt)
  return { state: settings.enabled && vendorLive({ status: sub.status, archivedAt: sub.archivedAt }) && started && approvedAt && approvedAt >= started ? 'queued' : 'out', ...base }
}

// ── Whole org ────────────────────────────────────────────────────────────────

/** The connection for an org's sync, or why there isn't one (tokens only). */
export async function connectionFor(orgId: string, extraUserIds: string[] = []): Promise<QboConnection | QboProblem> {
  const settings = await qboSettings(orgId)
  return qboConnection(orgId, { userIds: [settings.userId, ...extraUserIds] })
}

/**
 * A connection QuickBooks actually answers for, and to the company the sync was
 * turned on with. Tokens alone proved nothing: Whistle Ready's login turned out
 * to be for a QuickBooks test company (Oct 5 2026), which refreshes fine and
 * refuses everything else. Every look-up and write goes through this.
 */
export async function verifiedConnection(orgId: string, extraUserIds: string[] = []): Promise<QboConnection | QboProblem> {
  const settings = await qboSettings(orgId)
  const conn = await qboConnection(orgId, { userIds: [settings.userId, ...extraUserIds] })
  if (!conn.ok) return conn
  let name = ''
  try { name = await qboCompanyName(conn) } catch {
    return {
      ok: false, reason: 'unverified',
      message: `Whistle Ready's QuickBooks login is for company ${conn.realmId}, and QuickBooks won't answer for it. That is usually a QuickBooks test (sandbox) company, the only kind an app with development keys can reach. Sunshine Events Group's books need the app's production keys.`,
    }
  }
  if (settings.realmId && settings.realmId !== conn.realmId) {
    return {
      ok: false, reason: 'other_company',
      message: `QuickBooks is now connected to ${name || `company ${conn.realmId}`}, not ${settings.companyName || 'the company the sync was turned on with'}. Nothing will be sent until it's connected to that company again, or the sync is turned off and on with the new one.`,
    }
  }
  return { ...conn, companyName: name }
}

/** Sync a list of registrations now (the card's Sync, the backfill), creating invoices
 *  where there are none. Stops at the time budget; the rest come back as `remaining`. */
export async function syncNow(orgId: string, regIds: string[], opts: { userId?: string; budgetMs?: number } = {}):
  Promise<{ ok: true; results: SyncResult[]; remaining: string[] } | { ok: false; busy?: boolean; message: string }> {
  await ensureQboColumns()
  const conn = await verifiedConnection(orgId, opts.userId ? [opts.userId] : [])
  if (!conn.ok) return { ok: false, message: conn.message }
  const started = Date.now()
  const budget = opts.budgetMs ?? 40_000
  const locked = await withQboLock(orgId, async touch => {
    const ctx: Ctx = { conn, orgId, settings: await qboSettings(orgId), touch }
    const results: SyncResult[] = []
    const ids = [...new Set(regIds.filter(Boolean))]
    let i = 0
    for (; i < ids.length && Date.now() - started < budget; i++) {
      results.push(await syncRegistration(ctx, ids[i], true))
      await touch()
    }
    return { results, remaining: ids.slice(i) }
  })
  if (!locked.ok) return { ok: false, busy: true, message: 'A QuickBooks sync is already running. Try again in a minute.' }
  return { ok: true, ...locked.value }
}

/** What the cron does: new registrations since the sync was turned on, linked
 *  invoices whose contents changed, and payments QuickBooks hasn't had. */
export async function syncPending(orgId: string, opts: { budgetMs?: number } = {}): Promise<{ ran: number; results: SyncResult[]; problem?: string }> {
  const settings = await qboSettings(orgId)
  if (!settings.enabled) return { ran: 0, results: [] }
  await ensureQboColumns()
  const conn = await verifiedConnection(orgId)
  if (!conn.ok) {
    await saveQboSettings(orgId, { lastProblem: conn.message, lastRunAt: new Date().toISOString() })
    return { ran: 0, results: [], problem: conn.message }
  }
  const started = Date.now()
  const budget = opts.budgetMs ?? 40_000
  const todo = await pendingFor(orgId, settings)
  // Vendors' booth fees ride the same run, after the clubs. A failure to list them
  // never holds the clubs up.
  const vendorTodo = await pendingVendorsFor(orgId, settings).catch(e => { console.error('[qbo] vendor list failed:', e); return [] as { id: string; create: boolean; why: string }[] })
  const locked = await withQboLock(orgId, async touch => {
    const ctx: Ctx = { conn, orgId, settings, touch }
    const results: SyncResult[] = []
    for (const t of todo) {
      if (Date.now() - started > budget) break
      results.push(await syncRegistration(ctx, t.id, t.create))
      await touch()
    }
    for (const v of vendorTodo) {
      if (Date.now() - started > budget) break
      results.push(await syncVendor(ctx, v.id, v.create))
      await touch()
    }
    return results
  })
  const results = locked.ok ? locked.value : []
  await saveQboSettings(orgId, { lastRunAt: new Date().toISOString(), lastProblem: locked.ok ? '' : 'busy' })
  return { ran: results.length, results }
}

/** Registrations the cron should look at, cheapest checks first (no QuickBooks calls). */
export async function pendingFor(orgId: string, settings: QboSettings): Promise<{ id: string; create: boolean; why: string }[]> {
  const regs = (await prisma.$queryRawUnsafe(
    `SELECT r.* FROM "TeamRegistration" r JOIN "Tournament" t ON t.id = r.tournamentId WHERE t."orgId" = ?`, orgId) as Record<string, unknown>[]).map(normReg)
  if (!regs.length) return []
  const started = asDate(settings.startedAt)
  const nowMs = Date.now()
  const out: { id: string; create: boolean; why: string }[] = []
  const retryOk = (r: RegRow) => !r.qboSyncError || nowMs - (asDate(r.qboSyncedAt)?.getTime() || 0) > RETRY_ERRORS_MS

  // Payments waiting, on linked registrations.
  const payRows: { registrationId: string }[] = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT p.registrationId FROM "RegistrationPayment" p JOIN "TeamRegistration" r ON r.id = p.registrationId
       JOIN "Tournament" t ON t.id = r.tournamentId
      WHERE t."orgId" = ? AND p.amount > 0 AND (p."qboPaymentId" = '' OR p."qboPaymentId" IS NULL) AND r."qboInvoiceId" != ''`, orgId)
  const payWaiting = new Set(payRows.map(p => s(p.registrationId)))

  // Linked invoices whose contents changed: worked out from the database alone.
  const linked = regs.filter(r => r.qboInvoiceId && !asDate(r.deletedAt))
  const byEvent = new Map<string, RegRow[]>()
  for (const r of linked) byEvent.set(r.tournamentId, [...(byEvent.get(r.tournamentId) || []), r])
  const changed = new Set<string>()
  for (const [tid, list] of byEvent) {
    const ev = await loadEvent(tid)
    const itemId = settings.eventItems?.[tid]
    if (!ev || !itemId) { list.forEach(r => changed.add(r.id)); continue }
    const teams: TeamRow[] = await prisma.$queryRawUnsafe(
      `SELECT registrationId, teamName, division, waitlisted FROM "RegisteredTeam" WHERE registrationId IN (${list.map(() => '?').join(',')}) ORDER BY rowid`, ...list.map(r => r.id))
    for (const r of list) {
      const doc = docFor(ev, r, teams.filter(x => s(x.registrationId) === r.id), r.qboDocNumber)
      if (syncFingerprint(bodyFor(ev, r, doc, r.qboCustomerId, itemId, r.qboDocNumber)) !== r.qboSyncedHash) changed.add(r.id)
    }
  }

  for (const r of regs) {
    if (r.qboInvoiceId) {
      if (asDate(r.deletedAt)) { if (!r.qboSyncError) out.push({ id: r.id, create: false, why: 'deleted' }); continue }
      if ((changed.has(r.id) || payWaiting.has(r.id)) && retryOk(r)) out.push({ id: r.id, create: false, why: changed.has(r.id) ? 'changed' : 'payments' })
      continue
    }
    // Numbered by hand: link it (or make it with that number), whenever it was made.
    if (r.qboDocNumber && !asDate(r.deletedAt)) {
      if (retryOk(r) && round2(r.invoiceAmount - r.discountAmount) > 0) out.push({ id: r.id, create: true, why: 'numbered' })
      continue
    }
    const created = asDate(r.createdAt)
    if (asDate(r.deletedAt) || !started || !created || created < started) continue
    if (round2(r.invoiceAmount - r.discountAmount) <= 0 || !retryOk(r)) continue
    out.push({ id: r.id, create: true, why: 'new' })
  }
  return out
}

// ── What the registrations page shows ────────────────────────────────────────

export type RegQboState = {
  id: string
  club: string
  /** Deleted in Whistle Ready but still in QuickBooks: listed so the office can void it there. */
  deleted: boolean
  /** in = linked and current; changed / payments = linked, an update is waiting;
   *  queued = new since the sync was turned on, not sent yet; out = from before, not sent;
   *  numbered = given its QuickBooks number by hand, not linked yet;
   *  none = nothing invoiced; error = the last attempt failed. */
  state: 'in' | 'changed' | 'payments' | 'queued' | 'out' | 'numbered' | 'none' | 'error'
  docNumber: string
  syncedAt: string
  error: string
  paymentsWaiting: number
  /** Refunds (negative payments) on a linked registration: for the office to enter in QuickBooks. */
  refunds: { id: string; amount: number; date: string }[]
}

export async function qboStates(orgId: string, tournamentId: string): Promise<{ settings: QboSettings; regs: RegQboState[] }> {
  await ensureQboColumns()
  const settings = await qboSettings(orgId)
  // Deleted ones only when they reached QuickBooks: their invoice is still open there.
  const regs = (await prisma.$queryRawUnsafe(
    `SELECT * FROM "TeamRegistration" WHERE tournamentId = ? AND ("deletedAt" IS NULL OR "qboInvoiceId" != '')`, tournamentId) as Record<string, unknown>[]).map(normReg)
  if (!regs.length) return { settings, regs: [] }
  const pays: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT id, registrationId, amount, receivedAt, "qboPaymentId" FROM "RegistrationPayment" WHERE registrationId IN (${regs.map(() => '?').join(',')})`, ...regs.map(r => r.id))
  const pending = settings.enabled ? new Set((await pendingFor(orgId, settings).catch(() => [])).filter(p => !p.create).map(p => `${p.id}:${p.why}`)) : new Set<string>()
  const started = asDate(settings.startedAt)
  return {
    settings,
    regs: regs.map(r => {
      const mine = pays.filter(p => s(p.registrationId) === r.id)
      const waiting = mine.filter(p => Number(p.amount) > 0 && !s(p.qboPaymentId)).length
      const refunds = r.qboInvoiceId ? mine.filter(p => Number(p.amount) < 0 && s(p.qboPaymentId) !== 'entered').map(p => ({ id: s(p.id), amount: Math.abs(Number(p.amount)), date: s(p.receivedAt).slice(0, 10) })) : []
      const created = asDate(r.createdAt)
      const state: RegQboState['state'] = r.qboSyncError ? 'error'
        : r.qboInvoiceId ? (pending.has(`${r.id}:changed`) ? 'changed' : waiting ? 'payments' : 'in')
        : round2(r.invoiceAmount - r.discountAmount) <= 0 ? 'none'
        : r.qboDocNumber ? 'numbered'
        : settings.enabled && started && created && created >= started ? 'queued' : 'out'
      const deleted = !!asDate(r.deletedAt)
      return {
        id: r.id, club: r.clubName, deleted, state: deleted ? 'error' as const : state, docNumber: r.qboDocNumber, syncedAt: r.qboSyncedAt,
        error: deleted ? (r.qboSyncError || `Deleted in Whistle Ready. Invoice ${r.qboDocNumber} is still in QuickBooks; void it there if it shouldn't stand.`) : r.qboSyncError,
        paymentsWaiting: waiting, refunds: deleted ? [] : refunds,
      }
    }),
  }
}

/** The backfill list: registrations not in QuickBooks yet, what each would be, and
 *  which QuickBooks customer it would go to (reads only). */
export async function backfillPreview(orgId: string, tournamentId: string, userId?: string): Promise<{
  ok: boolean; message?: string
  rows: { id: string; club: string; contact: string; teams: number; total: number; paid: number; payments: number; refunds: number; registered: string; customer: CustomerMatch | null }[]
}> {
  await ensureQboColumns()
  const conn = await verifiedConnection(orgId, userId ? [userId] : [])
  const regs = (await prisma.$queryRawUnsafe(
    `SELECT * FROM "TeamRegistration" WHERE tournamentId = ? AND "deletedAt" IS NULL AND ("qboInvoiceId" = '' OR "qboInvoiceId" IS NULL) ORDER BY createdAt`, tournamentId) as Record<string, unknown>[])
    .map(normReg).filter(r => round2(r.invoiceAmount - r.discountAmount) > 0)
  const ids = regs.map(r => r.id)
  const teams: Record<string, unknown>[] = ids.length ? await prisma.$queryRawUnsafe(`SELECT registrationId FROM "RegisteredTeam" WHERE registrationId IN (${ids.map(() => '?').join(',')})`, ...ids) : []
  const pays: Record<string, unknown>[] = ids.length ? await prisma.$queryRawUnsafe(`SELECT registrationId, amount FROM "RegistrationPayment" WHERE registrationId IN (${ids.map(() => '?').join(',')})`, ...ids) : []
  const rows = regs.map(r => {
    const mine = pays.filter(p => s(p.registrationId) === r.id).map(p => Number(p.amount) || 0)
    return {
      id: r.id, club: r.clubName, contact: r.clubContact,
      teams: teams.filter(t => s(t.registrationId) === r.id).length,
      total: round2(r.invoiceAmount - r.discountAmount),
      paid: round2(mine.filter(a => a > 0).reduce((a, b) => a + b, 0)),
      payments: mine.filter(a => a > 0).length,
      refunds: mine.filter(a => a < 0).length,
      registered: txnDateOf(r),
      customer: r.qboCustomerId ? { id: r.qboCustomerId, name: r.clubName, how: 'saved' as const } : null as CustomerMatch | null,
    }
  })
  if (!conn.ok) return { ok: false, message: conn.message, rows }
  // Four at a time: QuickBooks allows plenty, and the list comes back in seconds.
  for (let i = 0; i < rows.length; i += 4) {
    await Promise.all(rows.slice(i, i + 4).map(async (row, k) => {
      if (row.customer) return
      const r = regs[i + k]
      row.customer = (await findCustomer(conn, r.clubName, r.contactEmail).catch(() => null)) || { id: '', name: r.clubName, how: 'new' }
    }))
  }
  return { ok: true, rows }
}

/** Link a registration to an invoice already made in QuickBooks by hand (by its
 *  number), so the sync keeps it up to date instead of making a second one. */
export async function linkExisting(orgId: string, regId: string, docNumber: string, userId?: string): Promise<{ ok: boolean; message: string }> {
  await ensureQboColumns()
  const conn = await verifiedConnection(orgId, userId ? [userId] : [])
  if (!conn.ok) return { ok: false, message: conn.message }
  const inv = await qboQuery<any>(conn, `SELECT * FROM Invoice WHERE DocNumber = '${qq(docNumber)}'`, 'Invoice')
  if (inv.length !== 1) return { ok: false, message: inv.length ? `More than one invoice is numbered ${docNumber}.` : `No invoice ${docNumber} in QuickBooks.` }
  const taken: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT id FROM "TeamRegistration" WHERE "qboInvoiceId" = ? AND id != ?`, String(inv[0].Id), regId)
  if (taken.length) return { ok: false, message: `Invoice ${docNumber} is already linked to another registration.` }
  // An empty fingerprint makes the next sync bring it in line with Whistle Ready.
  await saveReg(regId, { qboInvoiceId: String(inv[0].Id), qboDocNumber: String(inv[0].DocNumber), qboTxnDate: String(inv[0].TxnDate || ''), qboCustomerId: String(inv[0].CustomerRef?.value || ''), qboSyncedHash: '', qboSyncError: '' })
  return { ok: true, message: `Linked to invoice ${docNumber}.` }
}

/**
 * Give a registration its QuickBooks invoice number by hand: one made in
 * QuickBooks already, or one the office has given the club. The PDF shows it at
 * once, even before QuickBooks is connected; the sync then links the invoice with
 * that number, or makes it with that number if QuickBooks has none.
 * `date` (YYYY-MM-DD) is the invoice date to show until it's linked.
 */
export async function setInvoiceNumber(orgId: string, regId: string, docNumber: string, opts: { userId?: string; date?: string } = {}): Promise<{ ok: boolean; message: string; linked?: boolean }> {
  await ensureQboColumns()
  const n = String(docNumber || '').trim()
  if (!/^\d{1,21}$/.test(n)) return { ok: false, message: 'An invoice number is digits only.' }
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT * FROM "TeamRegistration" WHERE id = ?`, regId)
  if (!rows?.[0]) return { ok: false, message: 'Registration not found' }
  const reg = normReg(rows[0])
  if (reg.qboInvoiceId) return { ok: false, message: `Already linked to QuickBooks invoice ${reg.qboDocNumber}.` }
  const taken: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT "clubName" FROM "TeamRegistration" WHERE "qboDocNumber" = ? AND id != ? AND "deletedAt" IS NULL`, n, regId)
  if (taken.length) return { ok: false, message: `Invoice ${n} is already on ${s(taken[0].clubName)}'s registration.` }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(opts.date || '') ? String(opts.date) : ''
  await saveReg(regId, { qboDocNumber: n, qboTxnDate: date, qboSyncError: '' })
  const conn = await verifiedConnection(orgId, opts.userId ? [opts.userId] : [])
  if (!conn.ok) return { ok: true, message: `Saved: the invoice PDF shows ${n} now. It links to QuickBooks invoice ${n} once QuickBooks is connected and the sync runs.` }
  const linked = await linkExisting(orgId, regId, n, opts.userId)
  if (linked.ok) return { ok: true, linked: true, message: linked.message }
  return { ok: true, message: `Saved: the invoice PDF shows ${n}. ${linked.message} The sync will make it in QuickBooks with that number.` }
}

/** The office entered a refund in QuickBooks by hand: stop listing it. */
export async function markRefundEntered(paymentId: string): Promise<void> {
  await ensureQboColumns()
  await prisma.$executeRawUnsafe(`UPDATE "RegistrationPayment" SET "qboPaymentId" = 'entered' WHERE id = ? AND amount < 0`, paymentId)
}

/** Orgs that have the sync turned on (for the cron). */
export async function orgsWithQboSync(): Promise<string[]> {
  const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: 'qbo:' } } })
  return rows.filter(r => { try { return !!JSON.parse(r.value || '{}').enabled } catch { return false } }).map(r => r.key.slice(4))
}
