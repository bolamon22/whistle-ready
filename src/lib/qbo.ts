// TALKING TO QUICKBOOKS ONLINE, for an org.
//
// The login is the one made at Admin > Payment providers > Connect QuickBooks
// (api/oauth/quickbooks), stored per user in OrgPaymentProvider. A sync runs
// with nobody signed in (the cron), so it looks the login up by org: any
// enabled QuickBooks row belonging to one of the org's users, newest first,
// then the rows of the users named (whoever turned the sync on, saved in its
// settings, since an admin account may carry no org).
//
// Tokens: the access token lasts an hour and is refreshed here. The refresh
// token lasts about 100 days from its last use and is replaced on every
// refresh, so a connection that is used keeps itself alive, and one left alone
// for 100 days has to be connected again (status 'expired').
//
// Server only.
import { prisma } from '@/lib/db'
import { decryptConfig, encryptConfig } from '@/lib/encrypt'

const API = 'https://quickbooks.api.intuit.com/v3/company'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const MINOR = '75'

export type QboConnection = { ok: true; accessToken: string; realmId: string; companyName: string; rowId: string }
export type QboProblem = { ok: false; reason: 'not_connected' | 'expired' | 'no_credentials' | 'unverified' | 'other_company'; message: string }

export class QboError extends Error {
  status: number
  code: string
  constructor(message: string, status = 0, code = '') { super(message); this.status = status; this.code = code }
}

/** QuickBooks' query language escapes a quote with a backslash. */
export const qq = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")

type Row = { id: string; config: string; updatedAt?: string }

async function rowsFor(orgId: string | null, userIds: string[]): Promise<Row[]> {
  try {
    if (orgId) {
      const rows: Row[] = await prisma.$queryRawUnsafe(
        `SELECT p.id, p.config, p.updatedAt FROM "OrgPaymentProvider" p JOIN "User" u ON u.id = p.userId
          WHERE p.provider = 'quickbooks' AND p.enabled = 1 AND u.orgId = ? ORDER BY p.updatedAt DESC`, orgId)
      if (rows.length) return rows
    }
  } catch { /* no orgId column yet: try the named users */ }
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return []
  try {
    return await prisma.$queryRawUnsafe(
      `SELECT id, config, updatedAt FROM "OrgPaymentProvider" WHERE provider = 'quickbooks' AND enabled = 1
          AND userId IN (${ids.map(() => '?').join(',')}) ORDER BY updatedAt DESC`, ...ids)
  } catch { return [] }
}

/** The org's QuickBooks login, refreshed if needed. Never throws. */
export async function qboConnection(orgId: string | null, opts: { userIds?: string[]; now?: number } = {}): Promise<QboConnection | QboProblem> {
  const now = opts.now ?? Date.now()
  const rows = await rowsFor(orgId, opts.userIds || [])
  if (!rows.length) return { ok: false, reason: 'not_connected', message: 'QuickBooks is not connected. Connect it in Admin > Payment providers.' }
  const row = rows[0]
  const cfg = decryptConfig(row.config)
  if (!cfg.refreshToken || !cfg.companyId) return { ok: false, reason: 'not_connected', message: 'QuickBooks is not connected. Connect it in Admin > Payment providers.' }
  if (Number(cfg.accessTokenExpiry || 0) - now > 120_000 && cfg.accessToken) {
    return { ok: true, accessToken: cfg.accessToken, realmId: cfg.companyId, companyName: cfg.companyName || '', rowId: row.id }
  }
  const id = process.env.QBO_CLIENT_ID, secret = process.env.QBO_CLIENT_SECRET
  if (!id || !secret) return { ok: false, reason: 'no_credentials', message: 'QBO_CLIENT_ID / QBO_CLIENT_SECRET are not set in Vercel.' }
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cfg.refreshToken }),
      cache: 'no-store',
    })
    const t: any = await res.json().catch(() => ({}))
    if (!res.ok || !t.access_token) {
      // invalid_grant: the refresh token ran out (100 days unused) or was revoked.
      return { ok: false, reason: 'expired', message: 'The QuickBooks connection has expired. Connect QuickBooks again in Admin > Payment providers.' }
    }
    const next = {
      ...cfg,
      accessToken: t.access_token,
      refreshToken: t.refresh_token || cfg.refreshToken,
      accessTokenExpiry: String(now + Number(t.expires_in || 3600) * 1000),
      ...(t.x_refresh_token_expires_in ? { refreshTokenExpiry: String(now + Number(t.x_refresh_token_expires_in) * 1000) } : {}),
    }
    await prisma.$executeRawUnsafe(`UPDATE "OrgPaymentProvider" SET config = ?, updatedAt = ? WHERE id = ?`,
      encryptConfig(next), new Date(now).toISOString(), row.id)
    return { ok: true, accessToken: next.accessToken, realmId: cfg.companyId, companyName: cfg.companyName || '', rowId: row.id }
  } catch {
    return { ok: false, reason: 'expired', message: 'Could not reach QuickBooks to refresh the connection. Try again in a minute.' }
  }
}

/** One QuickBooks API call. Throws QboError with QuickBooks' own message. */
export async function qboFetch<T = any>(conn: QboConnection, path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`${API}/${conn.realmId}/${path}${sep}minorversion=${MINOR}`, {
    method: init.method || 'GET',
    headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  let j: any = null
  try { j = text ? JSON.parse(text) : null } catch { /* not JSON */ }
  const fault = j?.Fault?.Error?.[0] || j?.fault?.error?.[0]
  if (!res.ok || fault) {
    const msg = fault ? [fault.Message || fault.message, fault.Detail || fault.detail].filter(Boolean).join(': ') : `QuickBooks answered ${res.status}`
    throw new QboError(msg, res.status, String(fault?.code || ''))
  }
  return j as T
}

const companies = new Map<string, { name: string; at: number }>()
/**
 * The connected company's name. Asking is also the proof that QuickBooks answers
 * for this login's company: an app with only development keys can connect to a
 * QuickBooks test (sandbox) company, whose tokens look fine but which the
 * production API refuses. (Whistle Ready's login was one of those until Oct 5,
 * 2026.) Cached ten minutes per company.
 */
export async function qboCompanyName(conn: QboConnection): Promise<string> {
  const hit = companies.get(conn.realmId)
  if (hit && Date.now() - hit.at < 600_000) return hit.name
  const j: any = await qboFetch(conn, `companyinfo/${encodeURIComponent(conn.realmId)}`)
  const name = String(j?.CompanyInfo?.CompanyName || '').trim()
  companies.set(conn.realmId, { name, at: Date.now() })
  return name
}

/** A query (QuickBooks' SQL-ish language); the rows of `entity`. */
export async function qboQuery<T = any>(conn: QboConnection, sql: string, entity: string): Promise<T[]> {
  const j: any = await qboFetch(conn, `query?query=${encodeURIComponent(sql)}`)
  return (j?.QueryResponse?.[entity] || []) as T[]
}
