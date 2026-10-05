import { prisma } from '@/lib/db'
import { todayET } from '@/lib/publicView'
import { ensureTaskTable, scopeTournaments, inScope, type Scope } from '@/lib/tasks'
import {
  isContactCategory, isWaiting, type ContactView, type ContactRow, type ContactTask,
} from '@/lib/contactTypes'
import type { TaskTournament } from '@/lib/taskTemplate'

// Event contacts: everyone the org gets something from, or owes something to,
// to put on an event -- venues, counties, sports commissions, rentals, food
// vendors, officials, insurance, housing (Bo, Oct 5 2026).
//
// Same access and scope as Tasks (feature `tasks`: directors and admins): a
// director sees their org's contacts, an admin the org they are previewing,
// else their own, else every org's. Raw SQL created on first use, kept out of
// schema.prisma like OrgTask. Deleting a contact soft-deletes it so a task
// that pointed at it keeps a name to show until it's relinked.
//
// Nothing here sends anything to a contact. The pages draft; Bo sends.

type Row = ContactView & { orgId: string }

let ready: Promise<void> | null = null
export function ensureContactTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OrgContact" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL DEFAULT '',
        "name" TEXT NOT NULL,
        "role" TEXT NOT NULL DEFAULT '',
        "company" TEXT NOT NULL DEFAULT '',
        "category" TEXT NOT NULL DEFAULT 'other',
        "phone" TEXT NOT NULL DEFAULT '',
        "email" TEXT NOT NULL DEFAULT '',
        "address" TEXT NOT NULL DEFAULT '',
        "gives" TEXT NOT NULL DEFAULT '',
        "needs" TEXT NOT NULL DEFAULT '',
        "notes" TEXT NOT NULL DEFAULT '',
        "events" TEXT NOT NULL DEFAULT '[]',
        "everyEvent" INTEGER NOT NULL DEFAULT 0,
        "waiting" TEXT NOT NULL DEFAULT '',
        "waitingSince" TEXT NOT NULL DEFAULT '',
        "lastContact" TEXT NOT NULL DEFAULT '',
        "createdBy" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "deletedAt" TEXT NOT NULL DEFAULT ''
      )`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrgContact_org" ON "OrgContact"("orgId", "deletedAt")`)
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const line = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
const ymd = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')

function parseEvents(v: unknown): string[] {
  try {
    const a = JSON.parse(String(v || '[]'))
    return Array.isArray(a) ? Array.from(new Set(a.map(x => String(x)).filter(Boolean))).slice(0, 100) : []
  } catch { return [] }
}

function toRow(r: Record<string, unknown>): Row {
  return {
    id: String(r.id),
    orgId: String(r.orgId || ''),
    name: String(r.name || ''),
    role: String(r.role || ''),
    company: String(r.company || ''),
    category: isContactCategory(r.category) ? String(r.category) : 'other',
    phone: String(r.phone || ''),
    email: String(r.email || ''),
    address: String(r.address || ''),
    gives: String(r.gives || ''),
    needs: String(r.needs || ''),
    notes: String(r.notes || ''),
    events: parseEvents(r.events),
    everyEvent: Number(r.everyEvent) === 1,
    waiting: isWaiting(r.waiting) ? (r.waiting as ContactView['waiting']) : '',
    waitingSince: ymd(r.waitingSince),
    lastContact: ymd(r.lastContact),
  }
}

export function view(r: Row): ContactView {
  const { orgId, ...rest } = r
  void orgId
  return rest
}

export async function getContact(id: string): Promise<Row | null> {
  await ensureContactTable()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT * FROM "OrgContact" WHERE id = ? AND "deletedAt" = ''`, id)
  return rows[0] ? toRow(rows[0]) : null
}

/** The fields a client may set, cleaned. Only keys present in the input come back. */
export type ContactInput = Partial<Record<keyof ContactView, unknown>>
function clean(input: ContactInput, eventIds: Set<string>): Partial<ContactView> {
  const out: Partial<ContactView> = {}
  if (input.name !== undefined) out.name = line(input.name, 120)
  if (input.role !== undefined) out.role = line(input.role, 120)
  if (input.company !== undefined) out.company = line(input.company, 160)
  if (input.category !== undefined) out.category = isContactCategory(input.category) ? String(input.category) : 'other'
  if (input.phone !== undefined) out.phone = line(input.phone, 80)
  if (input.email !== undefined) out.email = line(input.email, 160)
  if (input.address !== undefined) out.address = line(input.address, 240)
  if (input.gives !== undefined) out.gives = text(input.gives, 1000)
  if (input.needs !== undefined) out.needs = text(input.needs, 1000)
  if (input.notes !== undefined) out.notes = text(input.notes, 4000)
  if (input.events !== undefined) out.events = (Array.isArray(input.events) ? input.events : []).map(String).filter(id => eventIds.has(id))
  if (input.everyEvent !== undefined) out.everyEvent = !!input.everyEvent
  if (input.waiting !== undefined) out.waiting = isWaiting(input.waiting) ? input.waiting : ''
  if (input.waitingSince !== undefined) out.waitingSince = ymd(input.waitingSince)
  if (input.lastContact !== undefined) out.lastContact = ymd(input.lastContact)
  return out
}

const COLS: (keyof ContactView)[] = ['name', 'role', 'company', 'category', 'phone', 'email', 'address', 'gives', 'needs', 'notes', 'events', 'everyEvent', 'waiting', 'waitingSince', 'lastContact']
const dbValue = (k: keyof ContactView, v: unknown) => k === 'events' ? JSON.stringify(v) : k === 'everyEvent' ? (v ? 1 : 0) : v

export async function createContact(orgId: string, input: ContactInput, eventIds: Set<string>, by: string): Promise<Row | null> {
  await ensureContactTable()
  const c = clean(input, eventIds)
  if (!c.name) return null
  // Waiting with no date starts today.
  if (c.waiting && !c.waitingSince) c.waitingSince = todayET()
  const id = newId()
  const keys = COLS.filter(k => c[k] !== undefined)
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrgContact" ("id", "orgId", "createdBy", ${keys.map(k => `"${k}"`).join(', ')}) VALUES (?, ?, ?, ${keys.map(() => '?').join(', ')})`,
    id, orgId || '', line(by, 120), ...keys.map(k => dbValue(k, c[k])))
  return getContact(id)
}

export async function updateContact(id: string, input: ContactInput, eventIds: Set<string>): Promise<Row | null> {
  const cur = await getContact(id)
  if (!cur) return null
  const c = clean(input, eventIds)
  if (c.name === '') delete c.name            // a contact keeps its name
  // Starting to wait stamps today; clearing it clears the date.
  if (c.waiting !== undefined && c.waiting !== cur.waiting && c.waitingSince === undefined) c.waitingSince = c.waiting ? todayET() : ''
  // Tags for events this login can't see are kept, not dropped.
  if (c.events) c.events = Array.from(new Set([...c.events, ...cur.events.filter(e => !eventIds.has(e))]))
  const keys = COLS.filter(k => c[k] !== undefined)
  if (keys.length) {
    await prisma.$executeRawUnsafe(
      `UPDATE "OrgContact" SET ${keys.map(k => `"${k}" = ?`).join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`,
      ...keys.map(k => dbValue(k, c[k])), id)
  }
  return getContact(id)
}

export async function deleteContact(id: string): Promise<void> {
  await ensureContactTable()
  await prisma.$executeRawUnsafe(`UPDATE "OrgContact" SET "deletedAt" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`, new Date().toISOString(), id)
}

async function scopedRows(scope: Scope): Promise<Row[]> {
  await ensureContactTable()
  const raw: Record<string, unknown>[] = 'all' in scope
    ? await prisma.$queryRawUnsafe(`SELECT * FROM "OrgContact" WHERE "deletedAt" = '' ORDER BY "name"`)
    : await prisma.$queryRawUnsafe(`SELECT * FROM "OrgContact" WHERE "orgId" = ? AND "deletedAt" = '' ORDER BY "name"`, scope.orgId)
  return raw.map(toRow)
}

/** Open tasks that point at a contact, keyed by contact id. */
async function openTasksByContact(scope: Scope, known: Set<string>): Promise<Map<string, ContactTask[]>> {
  const map = new Map<string, ContactTask[]>()
  try {
    await ensureTaskTable()
    const raw: Record<string, unknown>[] = 'all' in scope
      ? await prisma.$queryRawUnsafe(`SELECT id, title, "dueDate", "tournamentId", "contactId" FROM "OrgTask" WHERE "contactId" <> '' AND "done" = 0`)
      : await prisma.$queryRawUnsafe(`SELECT id, title, "dueDate", "tournamentId", "contactId" FROM "OrgTask" WHERE "contactId" <> '' AND "done" = 0 AND "orgId" = ?`, scope.orgId)
    for (const r of raw) {
      const tid = String(r.tournamentId || '')
      if (tid && !known.has(tid)) continue   // a deleted tournament's tasks go with it
      const cid = String(r.contactId)
      if (!map.has(cid)) map.set(cid, [])
      map.get(cid)!.push({ id: String(r.id), title: String(r.title || ''), dueDate: ymd(r.dueDate), tournamentId: tid })
    }
    Array.from(map.values()).forEach(list => list.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')))
  } catch (e) { console.error('[contacts] open tasks lookup failed (non-blocking):', e) }
  return map
}

/**
 * The directory, or one tournament's contacts (tagged with it, or every-event).
 * Each contact carries its open tasks; tags for tournaments that no longer
 * exist are left off.
 */
export async function collectContacts(scope: Scope, opts: { tournamentId?: string } = {}): Promise<{
  contacts: ContactRow[]; tournaments: TaskTournament[]; today: string
}> {
  const tournaments = await scopeTournaments(scope)
  const known = new Set(tournaments.map(t => t.id))
  let rows = await scopedRows(scope)
  if (opts.tournamentId) rows = rows.filter(r => r.everyEvent || r.events.includes(opts.tournamentId!))
  const tasks = await openTasksByContact(scope, known)
  return {
    contacts: rows.map(r => ({
      ...view(r),
      events: r.events.filter(e => known.has(e)),
      openTasks: (tasks.get(r.id) || []).filter(t => !opts.tournamentId || t.tournamentId === opts.tournamentId),
    })),
    tournaments: tournaments.map(({ orgId, ...t }) => { void orgId; return t }),
    today: todayET(),
  }
}

/** Contact names by id, for task rows. Deleted contacts still answer. Never throws. */
export async function contactNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const want = Array.from(new Set(ids.filter(Boolean)))
  if (!want.length) return map
  try {
    await ensureContactTable()
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT id, name FROM "OrgContact" WHERE id IN (${want.map(() => '?').join(', ')})`, ...want)
    for (const r of rows) map.set(String(r.id), String(r.name || ''))
  } catch (e) { console.error('[contacts] name lookup failed (non-blocking):', e) }
  return map
}

/** True when this login may link a task to that contact. */
export async function contactInScope(scope: Scope, id: string): Promise<boolean> {
  const c = await getContact(id)
  return !!c && inScope(scope, c.orgId)
}

// ── Import ────────────────────────────────────────────────────────────────────
// A file of contacts (and, optionally, open items that become Tasks), written
// with event NAMES because ids differ between databases: "Monster Mash" picks
// the org's tournament whose name contains it -- the next one coming up, else
// the most recent. Run it twice and nothing doubles: a contact with the same
// name and organization is skipped, and so is a task with the same title on
// the same tournament.

export type ImportFile = {
  contacts?: (ContactInput & { events?: unknown; eventNames?: unknown })[]
  tasks?: { title?: unknown; event?: unknown; dueDate?: unknown; category?: unknown; notes?: unknown; contact?: unknown }[]
}

export function matchEvent(name: string, tournaments: TaskTournament[], today: string): TaskTournament | null {
  const q = name.trim().toLowerCase()
  if (!q) return null
  const hits = tournaments.filter(t => t.name.toLowerCase().includes(q))
  if (!hits.length) return null
  const upcoming = hits.filter(t => t.lastDay && t.lastDay >= today).sort((a, b) => a.firstDay.localeCompare(b.firstDay))
  if (upcoming.length) return upcoming[0]
  return hits.sort((a, b) => (b.firstDay || '').localeCompare(a.firstDay || ''))[0]
}

export async function importContacts(scope: Scope, orgId: string, file: ImportFile, by: string, createTask: (t: {
  tournamentId: string; title: string; category: unknown; dueDate: unknown; notes: unknown; contactId: string
}) => Promise<boolean>): Promise<{ added: number; skipped: number; tasksAdded: number; tasksSkipped: number; unmatched: string[] }> {
  const all = await scopeTournaments(scope)
  const tournaments = orgId ? all.filter(t => t.orgId === orgId) : all
  const eventIds = new Set(tournaments.map(t => t.id))
  const today = todayET()
  const unmatched = new Set<string>()
  const resolve = (names: unknown): string[] => (Array.isArray(names) ? names : []).flatMap(n => {
    const t = matchEvent(String(n), tournaments, today)
    if (!t) { unmatched.add(String(n)); return [] }
    return [t.id]
  })

  const existing = await scopedRows(orgId ? { orgId } : scope)
  const key = (name: unknown, company: unknown) => `${line(name, 120).toLowerCase()}|${line(company, 160).toLowerCase()}`
  const byKey = new Map(existing.map(r => [key(r.name, r.company), r.id]))
  const byName = new Map(existing.map(r => [r.name.toLowerCase(), r.id]))

  let added = 0, skipped = 0
  for (const c of (file.contacts || []).slice(0, 500)) {
    const k = key(c.name, c.company)
    if (!line(c.name, 120) || byKey.has(k)) { skipped++; continue }
    const row = await createContact(orgId, { ...c, events: resolve(c.eventNames ?? c.events) }, eventIds, by)
    if (!row) { skipped++; continue }
    byKey.set(k, row.id)
    byName.set(row.name.toLowerCase(), row.id)
    added++
  }

  let tasksAdded = 0, tasksSkipped = 0
  for (const t of (file.tasks || []).slice(0, 500)) {
    const ev = matchEvent(String(t.event ?? ''), tournaments, today)
    if (!ev) { if (t.event) unmatched.add(String(t.event)); tasksSkipped++; continue }
    const contactId = byName.get(line(t.contact, 120).toLowerCase()) || ''
    const ok = await createTask({ tournamentId: ev.id, title: line(t.title, 200), category: t.category, dueDate: t.dueDate, notes: t.notes, contactId })
    if (ok) tasksAdded++; else tasksSkipped++
  }
  return { added, skipped, tasksAdded, tasksSkipped, unmatched: Array.from(unmatched) }
}
