import { createClient } from '@libsql/client'
import { TERMS_VERSION } from '@/lib/termsVersion'

// Who agreed to which Terms of Use version, and when: the record that makes the
// "I agree" box enforceable. One row per agreement, never updated or deleted.
//
// Raw table, all TEXT (CLAUDE.md: raw-query column types), created on first use so
// no migration button is needed. Recording is best-effort and never throws: a
// failed write must not block a sign-in, a registration or a waiver.
//
// context: where they agreed ('sign-in', 'team-registration', ...).

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

let ready: Promise<void> | null = null
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const c = db()
      await c.execute(`CREATE TABLE IF NOT EXISTS "TermsAcceptance" (
        id TEXT PRIMARY KEY, userId TEXT, email TEXT, version TEXT NOT NULL,
        context TEXT, ip TEXT, userAgent TEXT, acceptedAt TEXT NOT NULL)`)
      await c.execute('CREATE INDEX IF NOT EXISTS "TermsAcceptance_userId" ON "TermsAcceptance"(userId)')
      await c.execute('CREATE INDEX IF NOT EXISTS "TermsAcceptance_email" ON "TermsAcceptance"(email)')
    })().catch(e => { ready = null; throw e })
  }
  return ready
}

export function requestMeta(req: Request): { ip: string; userAgent: string } {
  const h = req.headers
  const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || ''
  return { ip: ip.slice(0, 64), userAgent: (h.get('user-agent') || '').slice(0, 300) }
}

export async function recordTermsAcceptance(a: {
  userId?: string | null; email?: string | null; context: string; ip?: string; userAgent?: string; version?: string
}): Promise<boolean> {
  try {
    await ensureTable()
    const id = `ta${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    await db().execute({
      sql: 'INSERT INTO "TermsAcceptance" (id, userId, email, version, context, ip, userAgent, acceptedAt) VALUES (?,?,?,?,?,?,?,?)',
      args: [id, a.userId || null, (a.email || '').trim().toLowerCase() || null, a.version || TERMS_VERSION,
        a.context.slice(0, 60), a.ip || null, a.userAgent || null, new Date().toISOString()],
    })
    return true
  } catch (e) {
    console.error('[terms] could not record acceptance', e)
    return false
  }
}

// Has this signed-in person agreed to the current version, under their account or
// their email (a coach who ticked the box while registering, then made a login)?
// On a read failure this answers true, so a database hiccup never locks anyone out.
export async function hasAcceptedCurrent(userId: string, email?: string | null): Promise<boolean> {
  try {
    await ensureTable()
    const em = (email || '').trim().toLowerCase()
    const res = await db().execute({
      sql: 'SELECT 1 AS ok FROM "TermsAcceptance" WHERE version = ? AND (userId = ? OR (? <> \'\' AND email = ?)) LIMIT 1',
      args: [TERMS_VERSION, userId, em, em],
    })
    return res.rows.length > 0
  } catch (e) {
    console.error('[terms] could not read acceptance', e)
    return true
  }
}
