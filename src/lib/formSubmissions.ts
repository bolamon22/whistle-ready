// Org form submissions (player waivers, vendor requests, staff applications).
//
// WHY THIS EXISTS: these used to live in ONE AppSetting row per org
// (`orgFormSubmissions:{orgId}`) as a JSON array that every submit re-read and
// re-wrote. Two parents submitting at the same moment could overwrite each other,
// the array was capped (oldest waivers silently dropped), and every staff page
// downloaded the whole thing. They now live one row each in "OrgFormSubmission",
// created the same raw-SQL way as the Organization table (not in prisma/schema).
// The first touch per org copies the old blob in (idempotent, keyed by id) and
// leaves the blob in place as a backup — nothing ever deletes it.
import { prisma } from '@/lib/db'

export type FormSubmission = {
  id: string
  formType: string
  submittedAt: string
  data: any
  edits?: { at: string; by?: string; fields: string[] }[]
  /** Game-day check-in (player waivers): when / by whom the player was marked present. */
  checkedInAt?: string | null
  checkedInBy?: string | null
  /** Unguessable key of the player's pass page (/pass/<token>). Player waivers only. */
  passToken?: string | null
  updatedAt?: string
}

export type FormType = 'player' | 'vendor' | 'staff' | string

const BLOB_KEY = (orgId: string) => `orgFormSubmissions:${orgId}`
const MIGRATED_KEY = (orgId: string) => `orgFormSubmissionsMigrated:${orgId}`

// ── table ────────────────────────────────────────────────────────────────────
let tableReady: Promise<void> | null = null
export function ensureSubmissionsTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "OrgFormSubmission" (
        "id"           TEXT PRIMARY KEY,
        "orgId"        TEXT NOT NULL,
        "formType"     TEXT NOT NULL,
        "tournamentId" TEXT NOT NULL DEFAULT '',
        "submittedAt"  TEXT NOT NULL,
        "playerName"   TEXT NOT NULL DEFAULT '',
        "teamName"     TEXT NOT NULL DEFAULT '',
        "clubName"     TEXT NOT NULL DEFAULT '',
        "jersey"       INTEGER,
        "search"       TEXT NOT NULL DEFAULT '',
        "data"         TEXT NOT NULL,
        "edits"        TEXT NOT NULL DEFAULT '[]',
        "updatedAt"    TEXT NOT NULL
      )`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrgFormSubmission_scope" ON "OrgFormSubmission" ("orgId", "formType", "tournamentId", "submittedAt")`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrgFormSubmission_team" ON "OrgFormSubmission" ("orgId", "tournamentId", "teamName")`)
      // Game-day check-in (Sep 2026) and the player pass (Sep 2026): added after the table
      // shipped, so ALTER in place.
      for (const col of ['"checkedInAt" TEXT', '"checkedInBy" TEXT', '"passToken" TEXT']) {
        try { await prisma.$executeRawUnsafe(`ALTER TABLE "OrgFormSubmission" ADD COLUMN ${col}`) } catch { /* already there */ }
      }
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "OrgFormSubmission_pass" ON "OrgFormSubmission" ("passToken")`)
    })().catch(e => { tableReady = null; throw e })
  }
  return tableReady
}

// ── derived columns ──────────────────────────────────────────────────────────
const SKIP_IN_SEARCH = new Set(['tournamentId', 'agree', 'signature', 'photoUrl'])
function derived(data: any) {
  const d = data || {}
  const playerName = String(d.playerName || d.name || d.companyName || '').trim()
  const teamName = String(d.teamName || '').trim()
  const clubName = String(d.clubName || '').trim()
  const jn = parseInt(String(d.jerseyNumber ?? '').replace(/\D/g, ''), 10)
  const jersey = Number.isFinite(jn) ? jn : null
  const parts: string[] = []
  for (const [k, v] of Object.entries(d)) {
    if (SKIP_IN_SEARCH.has(k)) continue
    if (typeof v === 'string' || typeof v === 'number') { const s = String(v).trim(); if (s) parts.push(s) }
  }
  if (teamName === '__other') parts.push('other / not listed')
  const search = parts.join(' | ').toLowerCase()
  return { playerName, teamName, clubName, jersey, search }
}

function rowToSub(r: any): FormSubmission {
  let data: any = {}; let edits: any[] = []
  try { data = JSON.parse(r.data || '{}') } catch {}
  try { edits = JSON.parse(r.edits || '[]') } catch {}
  return {
    id: r.id, formType: r.formType, submittedAt: r.submittedAt, data,
    edits: Array.isArray(edits) && edits.length ? edits : undefined,
    checkedInAt: r.checkedInAt || null, checkedInBy: r.checkedInBy || null,
    passToken: r.passToken || null,
    updatedAt: r.updatedAt || undefined,
  }
}

export function newSubmissionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── player pass ──────────────────────────────────────────────────────────────
// The pass URL is the only thing protecting a child's name and photo, so the token is
// 128 bits of real randomness (the submission id is timestamp-based and guessable).
export function newPassToken() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid.replace(/-/g, '')
  let t = ''; for (let i = 0; i < 32; i++) t += Math.floor(Math.random() * 16).toString(16)
  return t
}

/** Short human-readable player ID printed on the pass, derived from the token (no lookalike letters). */
export function passCode(token: string) {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < token.length; i++) { const c = token.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0; h2 = Math.imul(h2 + c, 0x9e3779b1) >>> 0 }
  let out = ''
  for (let i = 0; i < 6; i++) { const v = i < 3 ? (h1 >>> (i * 5)) : (h2 >>> ((i - 3) * 5)); out += ALPHABET[v & 31] }
  return out.slice(0, 3) + '-' + out.slice(3)
}

export async function getSubmissionByPassToken(token: string): Promise<(FormSubmission & { orgId: string; tournamentId: string }) | null> {
  if (!token || !/^[a-f0-9]{32}$/i.test(token)) return null
  await ensureSubmissionsTable()
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OrgFormSubmission" WHERE "passToken" = ? LIMIT 1`, token)
  if (!rows?.[0]) return null
  return { ...rowToSub(rows[0]), orgId: String(rows[0].orgId || ''), tournamentId: String(rows[0].tournamentId || '') }
}

/** Waivers submitted before passes existed have no token yet: mint one on first use. */
export async function ensurePassToken(orgId: string, id: string): Promise<string | null> {
  await ensureOrgMigrated(orgId)
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "passToken" FROM "OrgFormSubmission" WHERE "orgId" = ? AND "id" = ? LIMIT 1`, orgId, id)
  if (!rows?.[0]) return null
  if (rows[0].passToken) return String(rows[0].passToken)
  const token = newPassToken()
  await prisma.$executeRawUnsafe(`UPDATE "OrgFormSubmission" SET "passToken" = ? WHERE "orgId" = ? AND "id" = ? AND "passToken" IS NULL`, token, orgId, id)
  const again = await prisma.$queryRawUnsafe<any[]>(`SELECT "passToken" FROM "OrgFormSubmission" WHERE "orgId" = ? AND "id" = ? LIMIT 1`, orgId, id)
  return again?.[0]?.passToken ? String(again[0].passToken) : token
}

// ── one-time copy of the old blob ────────────────────────────────────────────
const migratedOrgs = new Set<string>()
export async function ensureOrgMigrated(orgId: string): Promise<void> {
  if (!orgId || migratedOrgs.has(orgId)) return
  await ensureSubmissionsTable()
  const flag = await prisma.appSetting.findUnique({ where: { key: MIGRATED_KEY(orgId) } })
  if (flag) { migratedOrgs.add(orgId); return }
  const blob = await prisma.appSetting.findUnique({ where: { key: BLOB_KEY(orgId) } })
  let list: any[] = []
  try { const parsed = JSON.parse(blob?.value || '[]'); list = Array.isArray(parsed) ? parsed : [] } catch { list = [] }
  const now = new Date().toISOString()
  let copied = 0
  // Multi-row INSERT OR IGNORE in batches — one statement per ~60 rows keeps well under SQLite's parameter limit.
  const cols = 13
  for (let i = 0; i < list.length; i += 60) {
    const batch = list.slice(i, i + 60).filter(s => s && s.id)
    if (!batch.length) continue
    const values: any[] = []
    const tuples = batch.map(s => {
      const dv = derived(s.data)
      values.push(String(s.id), orgId, String(s.formType || 'player'), String(s?.data?.tournamentId || ''), String(s.submittedAt || now),
        dv.playerName, dv.teamName, dv.clubName, dv.jersey, dv.search, JSON.stringify(s.data || {}), JSON.stringify(Array.isArray(s.edits) ? s.edits : []), now)
      return `(${new Array(cols).fill('?').join(',')})`
    })
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "OrgFormSubmission" ("id","orgId","formType","tournamentId","submittedAt","playerName","teamName","clubName","jersey","search","data","edits","updatedAt") VALUES ${tuples.join(',')}`,
      ...values)
    copied += batch.length
  }
  const value = JSON.stringify({ at: now, copied, blobEntries: list.length })
  await prisma.appSetting.upsert({ where: { key: MIGRATED_KEY(orgId) }, update: { value }, create: { key: MIGRATED_KEY(orgId), value } })
  migratedOrgs.add(orgId)
}

// ── writes ───────────────────────────────────────────────────────────────────
export async function insertSubmission(args: { orgId: string; formType: FormType; data: any }): Promise<FormSubmission> {
  await ensureOrgMigrated(args.orgId)
  const id = newSubmissionId()
  const submittedAt = new Date().toISOString()
  const data = args.data || {}
  const dv = derived(data)
  const formType = String(args.formType || 'player')
  const passToken = formType === 'player' ? newPassToken() : null
  await prisma.$executeRawUnsafe(
    `INSERT INTO "OrgFormSubmission" ("id","orgId","formType","tournamentId","submittedAt","playerName","teamName","clubName","jersey","search","data","edits","updatedAt","passToken") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, args.orgId, formType, String(data.tournamentId || ''), submittedAt,
    dv.playerName, dv.teamName, dv.clubName, dv.jersey, dv.search, JSON.stringify(data), '[]', submittedAt, passToken)
  return { id, formType, submittedAt, data, passToken }
}

export async function getSubmission(orgId: string, id: string): Promise<FormSubmission | null> {
  await ensureOrgMigrated(orgId)
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM "OrgFormSubmission" WHERE "orgId" = ? AND "id" = ? LIMIT 1`, orgId, id)
  return rows?.[0] ? rowToSub(rows[0]) : null
}

/** Merge `changes` into data (caller has already whitelisted keys) and record who changed what. */
export async function updateSubmissionData(orgId: string, id: string, changes: Record<string, any>, by?: string): Promise<FormSubmission | null> {
  const cur = await getSubmission(orgId, id)
  if (!cur) return null
  const changed = Object.keys(changes).filter(k => String(cur.data?.[k] ?? '') !== String(changes[k] ?? ''))
  if (!changed.length) return cur
  const data = { ...(cur.data || {}), ...changes }
  const edits = [...(cur.edits || []), { at: new Date().toISOString(), by, fields: changed }]
  const dv = derived(data)
  await prisma.$executeRawUnsafe(
    `UPDATE "OrgFormSubmission" SET "data" = ?, "edits" = ?, "playerName" = ?, "teamName" = ?, "clubName" = ?, "jersey" = ?, "search" = ?, "updatedAt" = ? WHERE "orgId" = ? AND "id" = ?`,
    JSON.stringify(data), JSON.stringify(edits), dv.playerName, dv.teamName, dv.clubName, dv.jersey, dv.search, new Date().toISOString(), orgId, id)
  return { ...cur, data, edits }
}

/** Mark a player present (or undo it). Returns the updated row, or null when it doesn't exist. */
export async function setCheckIn(orgId: string, id: string, on: boolean, by?: string): Promise<FormSubmission | null> {
  await ensureOrgMigrated(orgId)
  await prisma.$executeRawUnsafe(
    `UPDATE "OrgFormSubmission" SET "checkedInAt" = ?, "checkedInBy" = ? WHERE "orgId" = ? AND "id" = ?`,
    on ? new Date().toISOString() : null, on ? (by || null) : null, orgId, id)
  return getSubmission(orgId, id)
}

/** Clear every check-in matching the filter (e.g. one team before day two). Returns rows affected. */
export async function clearCheckIns(a: Pick<ListArgs, 'orgId' | 'formType' | 'tournamentId' | 'team'>): Promise<number> {
  await ensureOrgMigrated(a.orgId)
  const sql = buildWhere(a)
  const n = await prisma.$executeRawUnsafe(
    `UPDATE "OrgFormSubmission" SET "checkedInAt" = NULL, "checkedInBy" = NULL WHERE ${sql.sql} AND "checkedInAt" IS NOT NULL`,
    ...sql.params)
  return Number(n) || 0
}

/** How many rows matching the filter are checked in. */
export async function countCheckedIn(a: ListArgs): Promise<number> {
  await ensureOrgMigrated(a.orgId)
  const sql = buildWhere(a)
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS n FROM "OrgFormSubmission" WHERE ${sql.sql} AND "checkedInAt" IS NOT NULL`, ...sql.params)
  return Number(rows?.[0]?.n || 0)
}

export async function deleteSubmission(orgId: string, id: string, formType?: string, tournamentId?: string): Promise<boolean> {
  await ensureOrgMigrated(orgId)
  const conds = [`"orgId" = ?`, `"id" = ?`]; const params: any[] = [orgId, id]
  if (formType) { conds.push(`"formType" = ?`); params.push(formType) }
  if (tournamentId) { conds.push(`"tournamentId" = ?`); params.push(tournamentId) }
  const n = await prisma.$executeRawUnsafe(`DELETE FROM "OrgFormSubmission" WHERE ${conds.join(' AND ')}`, ...params)
  return Number(n) > 0
}

// ── reads ────────────────────────────────────────────────────────────────────
export type ListArgs = {
  orgId: string
  formType?: FormType
  tournamentId?: string
  /** Free-text search: every whitespace-separated word must appear somewhere in the entry. */
  q?: string
  /** Exact teamName match (raw value, e.g. "LaxManiax — HS Select" or "__other"). */
  team?: string
  sort?: 'newest' | 'oldest' | 'name' | 'jersey'
  limit?: number
  offset?: number
}

const ORDER: Record<string, string> = {
  newest: `"submittedAt" DESC`,
  oldest: `"submittedAt" ASC`,
  name: `"playerName" COLLATE NOCASE ASC, "submittedAt" DESC`,
  jersey: `("jersey" IS NULL) ASC, "jersey" ASC, "playerName" COLLATE NOCASE ASC`,
}

export async function listSubmissions(a: ListArgs): Promise<FormSubmission[]> {
  await ensureOrgMigrated(a.orgId)
  const sql = buildWhere(a)
  const limit = Math.max(1, Math.min(20000, a.limit ?? 100))
  const offset = Math.max(0, a.offset ?? 0)
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT * FROM "OrgFormSubmission" WHERE ${sql.sql} ORDER BY ${ORDER[a.sort || 'newest'] || ORDER.newest} LIMIT ${limit} OFFSET ${offset}`,
    ...sql.params)
  return (rows || []).map(rowToSub)
}

export async function countSubmissions(a: ListArgs): Promise<number> {
  await ensureOrgMigrated(a.orgId)
  const sql = buildWhere(a)
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*) AS n FROM "OrgFormSubmission" WHERE ${sql.sql}`, ...sql.params)
  return Number(rows?.[0]?.n || 0)
}

/** Distinct teams (raw teamName) with counts, for roster pickers. */
export async function teamCounts(a: Pick<ListArgs, 'orgId' | 'formType' | 'tournamentId'>): Promise<{ name: string; count: number }[]> {
  await ensureOrgMigrated(a.orgId)
  const sql = buildWhere(a)
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "teamName" AS name, COUNT(*) AS n FROM "OrgFormSubmission" WHERE ${sql.sql} GROUP BY "teamName" ORDER BY "teamName" COLLATE NOCASE`,
    ...sql.params)
  return (rows || []).map(r => ({ name: String(r.name || ''), count: Number(r.n || 0) }))
}

/** Counts per form type for an org (the org forms editor only needs totals). */
export async function countsByType(orgId: string): Promise<Record<string, number>> {
  await ensureOrgMigrated(orgId)
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "formType" AS t, COUNT(*) AS n FROM "OrgFormSubmission" WHERE "orgId" = ? GROUP BY "formType"`, orgId)
  const out: Record<string, number> = {}
  for (const r of rows || []) out[String(r.t)] = Number(r.n || 0)
  return out
}

// WHERE builder with per-LIKE ESCAPE (SQLite wants `LIKE ? ESCAPE '\'` on each pattern).
function buildWhere(a: Pick<ListArgs, 'orgId' | 'formType' | 'tournamentId' | 'team' | 'q'>): { sql: string; params: any[] } {
  const conds = [`"orgId" = ?`]; const params: any[] = [a.orgId]
  if (a.formType) { conds.push(`"formType" = ?`); params.push(a.formType) }
  if (a.tournamentId) { conds.push(`"tournamentId" = ?`); params.push(a.tournamentId) }
  if (a.team) { conds.push(`"teamName" = ?`); params.push(a.team) }
  const words = String(a.q || '').toLowerCase().split(/\s+/).map(w => w.trim()).filter(Boolean)
  for (const w of words) { conds.push(`"search" LIKE ? ESCAPE '\\'`); params.push(`%${w.replace(/[\\%_]/g, m => '\\' + m)}%`) }
  return { sql: conds.join(' AND '), params }
}
