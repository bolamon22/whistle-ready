import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { orgById } from '@/lib/org'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// ── Claim invites ─────────────────────────────────────────────────────────────
// Invites created by /api/workers/onboard carry a raw `workerId` column and link an
// EXISTING Worker record (the organizer already entered role/cert/pay). They are
// handled entirely with raw SQL — their datetimes are sqlite-format (datetime('now'))
// and they must work even where the Prisma client predates the StaffInvite model.
// Plain invites (no workerId) fall through to the original Prisma-based flow below,
// which creates a brand-new Worker.

/** The raw StaffInvite row when this token is a claim invite, else null. */
async function claimInvite(token: string): Promise<Record<string, unknown> | null> {
  try {
    const r = await db().execute({ sql: `SELECT * FROM "StaffInvite" WHERE token = ?`, args: [token] })
    const row = r.rows[0] as Record<string, unknown> | undefined
    // workerId is undefined when the column hasn't been migrated yet → not a claim invite
    return row && row.workerId ? row : null
  } catch {
    return null
  }
}

/** True while the claim invite is still inside its expiry window (sqlite datetime compare). */
async function claimStillValid(token: string): Promise<boolean> {
  const chk = await db().execute({
    sql: `SELECT 1 FROM "StaffInvite" WHERE token = ? AND expiresAt > datetime('now')`,
    args: [token],
  })
  return chk.rows.length > 0
}

function parseWorkerRoles(worker: Record<string, unknown>): string[] {
  try {
    const r = JSON.parse(String(worker.roles ?? '[]'))
    if (Array.isArray(r) && r.length) return r.map(String)
  } catch { /* fall through */ }
  return [String(worker.defaultRole ?? 'ref')]
}

// GET — validate token
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const claim = await claimInvite(params.token)
  if (claim) {
    if (claim.usedAt) return NextResponse.json({ error: 'This invite has already been used' }, { status: 410 })
    if (!(await claimStillValid(params.token))) return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })

    const wRes = await db().execute({ sql: `SELECT * FROM "Worker" WHERE id = ?`, args: [String(claim.workerId)] })
    const worker = wRes.rows[0] as Record<string, unknown> | undefined
    if (!worker) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })

    const org = await orgById((worker.orgId as string | null) ?? null)
    const email = String(claim.email ?? '')
    return NextResponse.json({
      kind: 'claim',
      email: email || null,
      needEmail: !email,
      name: String(worker.name ?? claim.name ?? ''),
      roles: parseWorkerRoles(worker),
      orgName: org?.name ?? null,
      tournamentName: null,
    })
  }

  const invite = await prisma.staffInvite.findUnique({ where: { token: params.token } })
  if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
  if (invite.usedAt) return NextResponse.json({ error: 'This invite has already been used' }, { status: 410 })
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })

  let tournamentName: string | null = null
  if (invite.tournamentId) {
    const t = await prisma.tournament.findUnique({ where: { id: invite.tournamentId }, select: { name: true } })
    tournamentName = t?.name ?? null
  }

  return NextResponse.json({ kind: 'new', email: invite.email, name: invite.name, tournamentName })
}

// POST — accept invite
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const body = await req.json()

    // ── Claim invite: link the EXISTING Worker, don't create one ──
    const claim = await claimInvite(params.token)
    if (claim) {
      if (claim.usedAt) return NextResponse.json({ error: 'Already used' }, { status: 410 })
      if (!(await claimStillValid(params.token))) return NextResponse.json({ error: 'Expired' }, { status: 410 })

      const client = db()
      const password = String(body.password ?? '')
      if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

      const wRes = await client.execute({ sql: `SELECT * FROM "Worker" WHERE id = ?`, args: [String(claim.workerId)] })
      const worker = wRes.rows[0] as Record<string, unknown> | undefined
      if (!worker) return NextResponse.json({ error: 'This invite is no longer valid' }, { status: 410 })

      const inviteEmail = String(claim.email ?? '').trim().toLowerCase()
      let email = inviteEmail
      if (!email) {
        email = String(body.email ?? '').trim().toLowerCase()
        if (!email || !email.includes('@')) return NextResponse.json({ error: 'Please enter your email address' }, { status: 400 })
      }

      const uRes = await client.execute({ sql: `SELECT id FROM "User" WHERE lower(email) = ?`, args: [email] })
      if (uRes.rows.length) {
        if (!inviteEmail) {
          // Link was texted and they typed an email that's already an account — we can't
          // verify it's theirs, so don't auto-link; the organizer can set the email instead.
          return NextResponse.json({ error: 'An account with that email already exists. Try signing in instead, or ask your coordinator to add this email to your staff record.' }, { status: 409 })
        }
        // They already have a login; the staff record matches by email, so they're set.
        await client.execute({ sql: `UPDATE "StaffInvite" SET usedAt = datetime('now') WHERE token = ?`, args: [params.token] })
        return NextResponse.json({ ok: true, alreadyHadAccount: true })
      }

      const hashed = await bcrypt.hash(password, 12)
      await prisma.user.create({ data: { name: String(worker.name ?? claim.name ?? email), email, password: hashed, role: 'staff' } })

      const workerOrgId = (worker.orgId as string | null) ?? null
      if (workerOrgId) {
        try { await client.execute({ sql: `UPDATE "User" SET orgId = ? WHERE lower(email) = ?`, args: [workerOrgId, email] }) } catch { /* raw column */ }
      }

      // Link was texted (no email on file): save the address they signed up with,
      // so the Staff Pool shows them as Registered from now on.
      if (!inviteEmail) {
        await client.execute({ sql: `UPDATE "Worker" SET email = ?, updatedAt = datetime('now') WHERE id = ?`, args: [email, String(claim.workerId)] })
      }

      await client.execute({ sql: `UPDATE "StaffInvite" SET usedAt = datetime('now') WHERE token = ?`, args: [params.token] })
      return NextResponse.json({ ok: true, workerId: String(claim.workerId) })
    }

    // ── Plain invite: original flow, creates a brand-new Worker + User ──
    const invite = await prisma.staffInvite.findUnique({ where: { token: params.token } })
    if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
    if (invite.usedAt) return NextResponse.json({ error: 'Already used' }, { status: 410 })
    if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 410 })

    const { name, role, gender, certLevel, phone, password } = body
    if (!name || !role || !password) return NextResponse.json({ error: 'Name, role, and password are required' }, { status: 400 })

    const email = invite.email

    // Resolve orgId: prefer the invite's own org (org-level invite), else the tournament's.
    let orgId: string | null = null
    const oc = db()
    try {
      const inv = await oc.execute({ sql: `SELECT orgId FROM "StaffInvite" WHERE token = ?`, args: [params.token] })
      orgId = (inv.rows[0]?.orgId as string) ?? null
    } catch { /* column may not exist yet */ }
    if (!orgId && invite.tournamentId) {
      const res = await oc.execute({ sql: `SELECT orgId FROM "Tournament" WHERE id = ?`, args: [invite.tournamentId] })
      orgId = (res.rows[0]?.orgId as string) ?? null
    }

    // Check if worker already exists for this org
    const existingWorker = orgId
      ? await prisma.worker.findFirst({ where: { email, orgId } })
      : await prisma.worker.findFirst({ where: { email } })
    if (existingWorker) return NextResponse.json({ error: 'A staff member with this email already exists' }, { status: 409 })

    const roleMap: Record<string, string> = {
      referee: 'ref',
      scorekeeper: 'scorekeeper',
      field_ops: 'field_ops',
      athletic_trainer: 'athletic_trainer',
    }
    const defaultRole = roleMap[role] ?? role
    const roles = JSON.stringify([defaultRole])

    // Create Worker via raw SQL to include orgId
    const client = db()
    const workerId = crypto.randomUUID()
    await client.execute({
      sql: `INSERT INTO "Worker" (id, name, email, phone, defaultRole, roles, certLevel, gender, isAssigner, payMethod, orgId, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'check', ?, datetime('now'), datetime('now'))`,
      args: [workerId, name, email, phone || null, defaultRole, roles, certLevel ?? 'youth', gender ?? 'both', orgId],
    })

    // Create User account
    const hashed = await bcrypt.hash(password, 12)
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (!existingUser) {
      await prisma.user.create({
        data: { name, email, password: hashed, role: 'staff' },
      })
    }
    // Scope the new/linked user to the invite's org so they only see that org.
    if (orgId) { try { await oc.execute({ sql: `UPDATE "User" SET orgId = ? WHERE lower(email) = ?`, args: [orgId, email] }) } catch {} }

    // If invite was for a specific tournament, add to roster
    if (invite.tournamentId) {
      await prisma.rosterEntry.create({
        data: { workerId, tournamentId: invite.tournamentId, gameTarget: 0 },
      }).catch(() => {})
    }

    // Mark invite as used
    await prisma.staffInvite.update({ where: { token: params.token }, data: { usedAt: new Date() } })

    return NextResponse.json({ ok: true, workerId })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 })
  }
}
