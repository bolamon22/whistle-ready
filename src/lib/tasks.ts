import { prisma } from '@/lib/db'
import { todayET } from '@/lib/publicView'
import { signalsFor, AUTO_DONE, type Signal } from '@/lib/taskSignals'
import { DEFAULT_SETUP_ITEMS } from '@/lib/setupChecklist'
import { tournamentOrgId } from '@/lib/org'
import {
  STARTER_TEMPLATE, templateItem, isCategory, isYmd, addDays, firstGameDay, lastGameDay, linkFor,
  type TaskView, type TaskStep, type TaskTournament,
} from '@/lib/taskTemplate'

// Tasks: the director's to-do list for running events (Bo, Oct 4 2026: "a tasks
// area ... see what I have to do for the tournaments ... add to the task list or
// check things off as we go").
//
// The tasks are the director's own -- "just me for now" -- so there is no
// assignee. They belong to an org: a director sees their org's, an admin sees
// the org they are previewing, else their own, else every org's. A task either
// belongs to one tournament or to none ("General").
//
// Raw SQL, created lazily and kept out of schema.prisma, like TeamFollow2: a
// deploy needs no migration step. One row per task; steps are a small JSON
// list on the row. Template tasks carry their template key, and a partial
// unique index on (tournamentId, templateKey) makes adding the starter
// checklist twice a no-op instead of a duplicate list.
//
// The shared setup checklist is NOT stored here. It stays the one list staff
// check off on their phones (AppSetting checklists:{id}); the task lists show
// it as a single 'checklist' row, due the day before, with its progress.

export type Scope = { all: true } | { orgId: string }

type Row = TaskView & { orgId: string; autoDoneAt: string }

/** Which tasks a signed-in director or admin sees. null = none (a director with no org). */
export function taskScope(role: string, sessionOrgId: string | null, previewOrgId: string | null): Scope | null {
  if (role === 'admin') {
    const org = previewOrgId || sessionOrgId
    return org ? { orgId: org } : { all: true }
  }
  return sessionOrgId ? { orgId: sessionOrgId } : null
}

let ready: Promise<void> | null = null
export function ensureTaskTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OrgTask" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "orgId" TEXT NOT NULL DEFAULT '',
        "tournamentId" TEXT NOT NULL DEFAULT '',
        "title" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'other',
        "dueDate" TEXT NOT NULL DEFAULT '',
        "notes" TEXT NOT NULL DEFAULT '',
        "steps" TEXT NOT NULL DEFAULT '[]',
        "templateKey" TEXT NOT NULL DEFAULT '',
        "link" TEXT NOT NULL DEFAULT '',
        "done" INTEGER NOT NULL DEFAULT 0,
        "doneAt" TEXT NOT NULL DEFAULT '',
        "doneBy" TEXT NOT NULL DEFAULT '',
        "autoDoneAt" TEXT NOT NULL DEFAULT '',
        "createdBy" TEXT NOT NULL DEFAULT '',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrgTask_org" ON "OrgTask"("orgId", "done")`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrgTask_tournament" ON "OrgTask"("tournamentId")`)
      await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "OrgTask_template" ON "OrgTask"("tournamentId", "templateKey") WHERE "templateKey" <> ''`)
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

const newId = () => 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
const clip = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** Steps from whatever a client sent: at most 50, text trimmed, empties dropped. */
export function cleanSteps(v: unknown): TaskStep[] {
  if (!Array.isArray(v)) return []
  return v
    .map((s: any) => ({ id: clip(s?.id, 40) || newId(), text: clip(s?.text, 200), done: !!s?.done }))
    .filter(s => s.text)
    .slice(0, 50)
}

function parseSteps(v: unknown): TaskStep[] {
  try { return cleanSteps(JSON.parse(String(v || '[]'))) } catch { return [] }
}

function toRow(r: Record<string, unknown>): Row {
  const tournamentId = String(r.tournamentId || '')
  const link = String(r.link || '')
  return {
    id: String(r.id),
    kind: 'task',
    orgId: String(r.orgId || ''),
    tournamentId,
    title: String(r.title || ''),
    category: isCategory(r.category) ? String(r.category) : 'other',
    dueDate: isYmd(r.dueDate) ? String(r.dueDate) : '',
    notes: String(r.notes || ''),
    steps: parseSteps(r.steps),
    templateKey: String(r.templateKey || ''),
    link: linkFor(link, tournamentId),
    done: Number(r.done) === 1,
    doneAt: String(r.doneAt || ''),
    doneBy: String(r.doneBy || ''),
    autoDoneAt: String(r.autoDoneAt || ''),
    tracked: null,
  }
}

/** What leaves the server: no org id, no bookkeeping columns. */
export function view(r: Row): TaskView {
  const { orgId, autoDoneAt, ...rest } = r
  void orgId; void autoDoneAt
  return rest
}

export async function getTask(id: string): Promise<Row | null> {
  await ensureTaskTable()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT * FROM "OrgTask" WHERE id = ?`, id)
  return rows[0] ? toRow(rows[0]) : null
}

export function inScope(scope: Scope, orgId: string): boolean {
  return 'all' in scope || scope.orgId === orgId
}

/** Every tournament this scope can see, soonest first; the task pages need their names and dates. */
export async function scopeTournaments(scope: Scope): Promise<(TaskTournament & { orgId: string })[]> {
  const orgOf = new Map<string, string>()
  let ids: string[] | null = null
  try {
    const rows: Record<string, unknown>[] = 'all' in scope
      ? await prisma.$queryRawUnsafe(`SELECT id, orgId FROM "Tournament"`)
      : await prisma.$queryRawUnsafe(`SELECT id, orgId FROM "Tournament" WHERE orgId = ?`, scope.orgId)
    for (const r of rows) orgOf.set(String(r.id), String(r.orgId || ''))
    ids = Array.from(orgOf.keys())
  } catch {
    // No orgId column yet (a fresh database): only the all-orgs scope can see anything.
    if (!('all' in scope)) return []
  }
  if (ids && !ids.length) return []
  const ts: { id: string; name: string; logoUrl: string | null; startDate: string | null; endDate: string | null; dates: string | null; location: string | null }[] = await prisma.tournament.findMany({
    where: ids ? { id: { in: ids } } : {},
    select: { id: true, name: true, logoUrl: true, startDate: true, endDate: true, dates: true, location: true },
  })
  return ts
    .map(t => ({
      id: t.id, name: t.name, logoUrl: t.logoUrl || '', location: t.location || '',
      firstDay: firstGameDay(t), lastDay: lastGameDay(t), orgId: orgOf.get(t.id) || '',
    }))
    .sort((a, b) => (a.firstDay || '9999').localeCompare(b.firstDay || '9999'))
}

/** The org a new task files under, or null when this login can't add to that tournament. */
export async function orgForNewTask(scope: Scope, tournamentId: string): Promise<string | null> {
  if (!tournamentId) return 'all' in scope ? '' : scope.orgId
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } })
  if (!t) return null
  const org = (await tournamentOrgId(tournamentId)) || ''
  if ('all' in scope) return org
  return org === scope.orgId ? org : null
}

export async function createTask(input: {
  orgId: string; tournamentId: string; title: string; category?: unknown; dueDate?: unknown
  notes?: unknown; steps?: unknown; templateKey?: string; link?: string; createdBy: string
}): Promise<Row | null> {
  await ensureTaskTable()
  const title = clip(input.title, 200)
  if (!title) return null
  const id = newId()
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrgTask" ("id", "orgId", "tournamentId", "title", "category", "dueDate", "notes", "steps", "templateKey", "link", "createdBy")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, input.orgId || '', input.tournamentId || '', title,
    isCategory(input.category) ? input.category : 'other',
    isYmd(input.dueDate) ? input.dueDate : '',
    String(input.notes ?? '').slice(0, 4000),
    JSON.stringify(cleanSteps(input.steps)),
    input.templateKey || '', input.link || '', clip(input.createdBy, 120))
  return getTask(id)
}

export type TaskPatch = { title?: unknown; category?: unknown; dueDate?: unknown; notes?: unknown; steps?: unknown; done?: unknown }

export async function updateTask(id: string, patch: TaskPatch, by: string): Promise<Row | null> {
  const cur = await getTask(id)
  if (!cur) return null
  const sets: string[] = []
  const args: unknown[] = []
  if (patch.title !== undefined) {
    const t = clip(patch.title, 200)
    if (t) { sets.push(`"title" = ?`); args.push(t) }
  }
  if (patch.category !== undefined && isCategory(patch.category)) { sets.push(`"category" = ?`); args.push(patch.category) }
  if (patch.dueDate !== undefined) { sets.push(`"dueDate" = ?`); args.push(isYmd(patch.dueDate) ? patch.dueDate : '') }
  if (patch.notes !== undefined) { sets.push(`"notes" = ?`); args.push(String(patch.notes ?? '').slice(0, 4000)) }
  if (patch.steps !== undefined) { sets.push(`"steps" = ?`); args.push(JSON.stringify(cleanSteps(patch.steps))) }
  if (patch.done !== undefined) {
    // Only a real change moves the stamp: checking a done task again keeps when it was done.
    if (patch.done && !cur.done) { sets.push(`"done" = 1`, `"doneAt" = ?`, `"doneBy" = ?`); args.push(new Date().toISOString(), clip(by, 120)) }
    if (!patch.done && cur.done) sets.push(`"done" = 0`, `"doneAt" = ''`, `"doneBy" = ''`)
  }
  if (sets.length) {
    await prisma.$executeRawUnsafe(`UPDATE "OrgTask" SET ${sets.join(', ')}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ?`, ...args, id)
  }
  return getTask(id)
}

export async function deleteTask(id: string): Promise<void> {
  await ensureTaskTable()
  await prisma.$executeRawUnsafe(`DELETE FROM "OrgTask" WHERE id = ?`, id)
}

/** Template keys already on this tournament's list. */
export async function templateKeysFor(tournamentId: string): Promise<Set<string>> {
  await ensureTaskTable()
  const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT "templateKey" FROM "OrgTask" WHERE "tournamentId" = ? AND "templateKey" <> ''`, tournamentId)
  return new Set(rows.map(r => String(r.templateKey)))
}

/**
 * Add starter-checklist items to a tournament, due dates counted back from its
 * first game day. Items already on the list are skipped (the unique index), so
 * this can run again to add more. Returns how many were added.
 */
export async function addStarterItems(t: { id: string; orgId: string; firstDay: string }, keys: string[], by: string): Promise<number> {
  await ensureTaskTable()
  const want = new Set(keys)
  let added = 0
  for (const item of STARTER_TEMPLATE) {
    if (!want.has(item.key)) continue
    const due = t.firstDay ? addDays(t.firstDay, item.offset) : ''
    const steps = (item.steps || []).map((text, i) => ({ id: `${item.key}${i}`, text, done: false }))
    const n = await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "OrgTask" ("id", "orgId", "tournamentId", "title", "category", "dueDate", "steps", "templateKey", "link", "createdBy")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(), t.orgId || '', t.id, item.title, item.category, due, JSON.stringify(steps), item.key, item.link || '', clip(by, 120))
    added += Number(n) || 0
  }
  return added
}

/** Setup checklist progress per tournament. A list never saved is the ten defaults, none done. */
export async function checklistProgress(tournamentIds: string[]): Promise<Map<string, { done: number; total: number }>> {
  const map = new Map<string, { done: number; total: number }>()
  if (!tournamentIds.length) return map
  let rows: { key: string; value: string }[] = []
  try {
    rows = await prisma.appSetting.findMany({ where: { key: { in: tournamentIds.map(id => `checklists:${id}`) } }, select: { key: true, value: true } })
  } catch { /* AppSetting not created yet: every list is the defaults */ }
  const byKey = new Map(rows.map(r => [r.key, r.value]))
  for (const id of tournamentIds) {
    let items: { done?: boolean }[] | null = null
    try {
      const v = JSON.parse(byKey.get(`checklists:${id}`) || 'null')
      if (Array.isArray(v) && v.length) items = v
    } catch { /* unreadable: the route serves the defaults too */ }
    map.set(id, items
      ? { done: items.filter(i => i && i.done).length, total: items.length }
      : { done: 0, total: DEFAULT_SETUP_ITEMS.length })
  }
  return map
}

/**
 * Attach what the app can see to open tracked tasks, and check off the ones it
 * can prove are finished. Each is checked off ONCE (autoDoneAt): if Bo reopens
 * it, it stays open. Never throws.
 */
async function applySignals(rows: Row[]): Promise<void> {
  const wanted = new Map<string, Set<string>>()
  for (const r of rows) {
    if (r.done || !r.tournamentId || !templateItem(r.templateKey)?.tracked) continue
    if (!wanted.has(r.tournamentId)) wanted.set(r.tournamentId, new Set())
    wanted.get(r.tournamentId)!.add(r.templateKey)
  }
  for (const [tid, keys] of Array.from(wanted.entries())) {
    let sig: Record<string, Signal> = {}
    try { sig = await signalsFor(tid, keys) } catch (e) { console.error('[tasks] signals failed (non-blocking):', e); continue }
    for (const r of rows) {
      if (r.tournamentId !== tid || r.done) continue
      const s = sig[r.templateKey]
      if (!s) continue
      r.tracked = s
      if (s.done && AUTO_DONE.has(r.templateKey) && !r.autoDoneAt) {
        const now = new Date().toISOString()
        try {
          await prisma.$executeRawUnsafe(
            `UPDATE "OrgTask" SET "done" = 1, "doneAt" = ?, "doneBy" = 'Whistle Ready', "autoDoneAt" = ?, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ? AND "done" = 0`,
            now, now, r.id)
          r.done = true; r.doneAt = now; r.doneBy = 'Whistle Ready'; r.autoDoneAt = now
        } catch (e) { console.error('[tasks] auto check-off failed (non-blocking):', e) }
      }
    }
  }
}

/**
 * Everything a task page shows: the tasks in scope (optionally one tournament's,
 * or '' for General), each upcoming tournament's setup checklist as one row,
 * and the tournaments for names and dates.
 */
export async function collectTasks(scope: Scope, opts: { tournamentId?: string; signals?: boolean } = {}): Promise<{
  tasks: TaskView[]; tournaments: TaskTournament[]; today: string
}> {
  await ensureTaskTable()
  const today = todayET()
  const tournaments = await scopeTournaments(scope)
  const known = new Set(tournaments.map(t => t.id))

  const where: string[] = []
  const args: unknown[] = []
  if (!('all' in scope)) { where.push(`"orgId" = ?`); args.push(scope.orgId) }
  if (opts.tournamentId !== undefined) { where.push(`"tournamentId" = ?`); args.push(opts.tournamentId) }
  const raw: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT * FROM "OrgTask"${where.length ? ' WHERE ' + where.join(' AND ') : ''}`, ...args)
  // A deleted tournament's tasks go with it.
  const rows = raw.map(toRow).filter(r => !r.tournamentId || known.has(r.tournamentId))
  if (opts.signals) await applySignals(rows)

  const listed = tournaments.filter(t =>
    t.firstDay && t.lastDay >= today && (opts.tournamentId === undefined || t.id === opts.tournamentId))
  const progress = await checklistProgress(listed.map(t => t.id))
  const lists: TaskView[] = listed.map(t => {
    const p = progress.get(t.id) || { done: 0, total: 0 }
    return {
      id: `setup:${t.id}`, kind: 'checklist', tournamentId: t.id,
      title: 'Setup checklist', category: 'gameday', dueDate: addDays(t.firstDay, -1),
      notes: '', steps: [], templateKey: '', link: { label: 'Open checklist', href: `/tournaments/${t.id}/tasks#setup` },
      done: p.total > 0 && p.done >= p.total, doneAt: '', doneBy: '', tracked: null, progress: p,
    }
  })

  return {
    tasks: [...rows.map(view), ...lists],
    tournaments: tournaments.map(({ orgId, ...t }) => { void orgId; return t }),
    today,
  }
}
