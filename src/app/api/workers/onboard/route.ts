import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'
import crypto from 'crypto'
import { requireStaff } from '@/lib/apiAuth'
import { sendEmail, orgSender } from '@/lib/email'
import { orgById } from '@/lib/org'
import { ensureStaffInviteTable } from '@/lib/staffInviteTable'

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL — prod's still points at old gameday-staff5.vercel.app (found Aug 28)

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// POST /api/workers/onboard — invite EXISTING staff-pool members to create their app login.
//
// Body: { workerIds: string[], mode?: 'send' | 'link' }
//   'send' (default) — create/refresh a claim invite and email it (needs worker.email)
//   'link'           — create/refresh the invite WITHOUT emailing; caller copies the
//                      returned inviteUrl (how workers with a phone but no email get onboarded)
//
// Unlike the plain /api/invite flow (brand-new staff), the StaffInvite row here carries
// workerId, so accepting LINKS the existing Worker record instead of creating a duplicate.
// A pending invite is reused (expiry refreshed to 30 days out) so an emailed link keeps
// working when the organizer later hits "Copy link" or "Resend".
export async function POST(req: Request) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res

  let body: { workerIds?: unknown; mode?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const workerIds = Array.isArray(body.workerIds)
    ? body.workerIds.filter((x): x is string => typeof x === 'string')
    : []
  const mode = body.mode === 'link' ? 'link' : 'send'
  if (!workerIds.length) return NextResponse.json({ error: 'workerIds is required' }, { status: 400 })
  if (workerIds.length > 50) return NextResponse.json({ error: 'Max 50 per request — send in batches' }, { status: 400 })

  const client = db()
  await ensureStaffInviteTable()

  const orgs = new Map<string, Awaited<ReturnType<typeof orgById>>>()
  async function orgFor(orgId: string | null) {
    if (!orgId) return null
    if (!orgs.has(orgId)) orgs.set(orgId, await orgById(orgId))
    return orgs.get(orgId) ?? null
  }

  type Result = { workerId: string; status: string; inviteUrl?: string }
  const results: Result[] = []

  for (const workerId of workerIds) {
    const wRes = await client.execute({ sql: `SELECT * FROM "Worker" WHERE id = ?`, args: [workerId] })
    const worker = wRes.rows[0] as Record<string, unknown> | undefined
    if (!worker) { results.push({ workerId, status: 'not_found' }); continue }

    const workerOrgId = (worker.orgId as string | null) ?? null
    // Org scoping: non-admins may only onboard workers in their own org
    if (gate.role !== 'admin' && workerOrgId && workerOrgId !== gate.orgId) {
      results.push({ workerId, status: 'forbidden' }); continue
    }

    const email = String(worker.email ?? '').trim().toLowerCase()

    // Already has a login (matched by email)? Nothing to send.
    if (email) {
      const uRes = await client.execute({ sql: `SELECT id FROM "User" WHERE lower(email) = ?`, args: [email] })
      if (uRes.rows.length) { results.push({ workerId, status: 'already_registered' }); continue }
    }

    // Reuse a pending claim invite so previously sent links stay valid; else mint one.
    let token: string
    const pending = await client.execute({
      sql: `SELECT token FROM "StaffInvite" WHERE workerId = ? AND usedAt IS NULL AND expiresAt > datetime('now') ORDER BY createdAt DESC LIMIT 1`,
      args: [workerId],
    })
    if (pending.rows.length) {
      token = String(pending.rows[0].token)
      await client.execute({
        sql: `UPDATE "StaffInvite" SET expiresAt = datetime('now', '+30 days'), email = ?, name = ? WHERE token = ?`,
        args: [email, String(worker.name ?? ''), token],
      })
    } else {
      token = crypto.randomBytes(32).toString('hex')
      await client.execute({
        sql: `INSERT INTO "StaffInvite" (id, token, email, name, tournamentId, expiresAt, createdAt, orgId, workerId)
              VALUES (?, ?, ?, ?, NULL, datetime('now', '+30 days'), datetime('now'), ?, ?)`,
        args: [crypto.randomUUID(), token, email, String(worker.name ?? ''), workerOrgId, workerId],
      })
    }

    const inviteUrl = `${APP_URL}/invite/${token}`

    if (!email) { results.push({ workerId, status: 'link_only', inviteUrl }); continue }
    if (mode === 'link') { results.push({ workerId, status: 'link', inviteUrl }); continue }

    const org = await orgFor(workerOrgId)
    const orgLabel = org?.name || 'Whistle Ready'
    const firstName = String(worker.name ?? '').trim().split(/\s+/)[0] || ''
    // From the ORG, not the platform: the org is the employer recruiting this staffer
    // (Bo, Aug 28 2026) — orgSender degrades safely to the platform sender if the org's
    // domain isn't SendGrid-authenticated.
    await sendEmail({
      ...orgSender(org),
      to: email,
      subject: `Create your ${orgLabel} staff login`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">
            Set up your ${orgLabel} staff login
          </h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
            ${firstName ? `Hi ${firstName} — ` : ''}you're in the ${orgLabel} staff pool on Whistle Ready,
            the app we use to run our events. Create your login to see your game assignments,
            set your availability, and keep your pay details current.
          </p>
          <a href="${inviteUrl}"
            style="display: inline-block; background: #14b8a6; color: white; font-weight: 600;
                   font-size: 15px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
            Create my login &rarr;
          </a>
          <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">
            Your role and details are already set up — you just choose a password.
            This link expires in 30 days. If you weren't expecting this, you can ignore it.
          </p>
        </div>
      `,
    })
    results.push({ workerId, status: 'sent', inviteUrl })
  }

  const count = (s: string) => results.filter(r => r.status === s).length
  return NextResponse.json({
    results,
    sent: count('sent'),
    link: count('link') + count('link_only'),
    alreadyRegistered: count('already_registered'),
    noEmail: count('link_only'),
    skipped: count('not_found') + count('forbidden'),
  })
}
