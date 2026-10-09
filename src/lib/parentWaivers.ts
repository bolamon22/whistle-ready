import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { getSubmission, type FormSubmission } from '@/lib/formSubmissions'
import type { AccountOffer } from '@/lib/parentWaiverFields'

// Parent logins and the player waivers they filed (Bo, Oct 9 2026: "when parents
// are filling out the waiver, we should ask them if they want to set their account
// up by creating a password at the end. That way they don't have to go back later
// when they want to make edits").
//
// A waiver joins a login only with proof that this person filed it:
//   - they were signed in as that parent when they submitted it (the session's
//     email is the waiver's parent email), or
//   - the browser that just filed it hands back the one-time token the submit
//     response gave it, with a password for that email.
// Never by email match alone: logins aren't email-checked, so anyone could make
// one under a parent's address and collect a child's details.
//
// Raw-SQL table "ParentWaiverLink" (userId, submissionId, orgId, via, createdAt),
// created on first use like the other app tables kept out of schema.prisma.

let ready: Promise<void> | null = null
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ParentWaiverLink" (
        "userId"       TEXT NOT NULL,
        "submissionId" TEXT NOT NULL,
        "orgId"        TEXT NOT NULL,
        "via"          TEXT NOT NULL DEFAULT '',
        "createdAt"    TEXT NOT NULL,
        PRIMARY KEY ("userId", "submissionId")
      )`)
      await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ParentWaiverLink_sub" ON "ParentWaiverLink" ("submissionId")`)
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

/** Put a waiver in a parent's account. True when it's there (new or already). */
export async function linkWaiver(userId: string, submissionId: string, orgId: string, via: string): Promise<boolean> {
  if (!userId || !submissionId || !orgId) return false
  try {
    await ensureTable()
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO "ParentWaiverLink" ("userId", "submissionId", "orgId", "via", "createdAt") VALUES (?, ?, ?, ?, ?)`,
      userId, submissionId, orgId, via.slice(0, 80), new Date().toISOString())
    return true
  } catch (e) {
    console.error('[parentWaivers] link failed', e)
    return false
  }
}

/** The org a waiver in this parent's account belongs to, or null when it isn't theirs. */
export async function linkedTo(userId: string, submissionId: string): Promise<{ orgId: string } | null> {
  if (!userId || !submissionId) return null
  try {
    await ensureTable()
    const rows = await prisma.$queryRawUnsafe<{ orgId: string }[]>(
      `SELECT "orgId" FROM "ParentWaiverLink" WHERE "userId" = ? AND "submissionId" = ? LIMIT 1`, userId, submissionId)
    return rows?.[0] ? { orgId: String(rows[0].orgId) } : null
  } catch { return null }
}

/** The waivers in a parent's account, newest first. Waivers staff archived are left out. */
export async function linkedWaivers(userId: string): Promise<(FormSubmission & { orgId: string })[]> {
  if (!userId) return []
  try {
    await ensureTable()
    const rows = await prisma.$queryRawUnsafe<{ submissionId: string; orgId: string }[]>(
      `SELECT "submissionId", "orgId" FROM "ParentWaiverLink" WHERE "userId" = ? ORDER BY "createdAt" DESC LIMIT 100`, userId)
    const out: (FormSubmission & { orgId: string })[] = []
    for (const r of rows || []) {
      const s = await getSubmission(String(r.orgId), String(r.submissionId)).catch(() => null)
      if (s && s.formType === 'player' && !s.archivedAt) out.push({ ...s, orgId: String(r.orgId) })
    }
    return out
  } catch { return [] }
}

// ── the one-time token ────────────────────────────────────────────────────────
// Handed to the browser that just filed a waiver, so the thank-you screen can
// offer the account. It names the waiver, its org and the parent email, and is
// good for 3 hours: long enough to finish the screen, short enough that a link
// copied out of a shared computer's history goes stale.

type AccountToken = { s: string; o: string; m: string }
const secret = () => process.env.NEXTAUTH_SECRET || ''
const sign = (payload: string) => crypto.createHmac('sha256', secret()).update(`parentacct.${payload}`).digest('base64url')

export function signAccountToken(t: AccountToken, ttlMs = 3 * 60 * 60 * 1000): string {
  const payload = Buffer.from(JSON.stringify({ ...t, e: Date.now() + ttlMs })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

/** The waiver, org and email a token names, if it's ours and still fresh. */
export function readAccountToken(token: string): AccountToken | null {
  if (!secret()) return null
  const [payload, sig] = String(token || '').split('.')
  if (!payload || !sig) return null
  const a = Buffer.from(sig), b = Buffer.from(sign(payload))
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const { s, o, m, e } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof s !== 'string' || typeof o !== 'string' || typeof m !== 'string' || !s || !o || !m) return null
    return Number(e) > Date.now() ? { s, o, m } : null
  } catch { return null }
}

// ── what the thank-you screen offers ─────────────────────────────────────────

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** The login on an email, if there is one. Emails are stored lowercase; match without case so an older row is found too. */
export async function loginOnEmail(email: string): Promise<{ id: string; password: string | null } | null> {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return null
  const rows = await prisma.$queryRawUnsafe<{ id: string; password: string | null }[]>(
    `SELECT id, password FROM "User" WHERE lower(email) = ? LIMIT 1`, e)
  return rows?.[0] ? { id: String(rows[0].id), password: rows[0].password ?? null } : null
}

/**
 * After a player waiver is saved. Signed in as one of the waiver's parents: it
 * goes straight into that account. Not signed in: the thank-you screen gets a
 * token to offer a password for the parent email (`existing` when that email
 * already has a login, so the screen asks for that password instead).
 * Signed in as anyone else -- the office at the check-in table, a club director
 * or coach filling one in for a family -- nothing: a password typed on someone
 * else's session must never become the parent's login.
 */
export async function accountOffer(
  sub: { id: string; orgId: string; data: Record<string, unknown> },
  sessionUser?: { id?: string; email?: string | null } | null,
): Promise<AccountOffer | undefined> {
  const lower = (x: unknown) => String(x ?? '').trim().toLowerCase()
  const parentEmail = lower(sub.data.parentEmail)
  if (sessionUser?.id) {
    const mine = lower(sessionUser.email)
    const emails = [parentEmail, lower(sub.data.parent2Email)].filter(e => EMAIL.test(e))
    if (!mine || !emails.includes(mine)) return undefined
    return (await linkWaiver(String(sessionUser.id), sub.id, sub.orgId, 'signed in')) ? { linked: true, email: mine } : undefined
  }
  if (!EMAIL.test(parentEmail) || !secret()) return undefined
  const existing = !!(await loginOnEmail(parentEmail).catch(() => null))
  return { token: signAccountToken({ s: sub.id, o: sub.orgId, m: parentEmail }), email: parentEmail, existing }
}
