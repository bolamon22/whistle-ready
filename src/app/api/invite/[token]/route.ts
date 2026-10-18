import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { orgById } from '@/lib/org'
import { ensureStaffInviteTable } from '@/lib/staffInviteTable'
import { notifyStaffRegistered } from '@/lib/staffNotify'
import { giveStaffAccess } from '@/lib/staffLogin'
import { addToOrg } from '@/lib/orgMembers'
import { clientEvents, saveClientEvents } from '@/lib/clientEvents'
import { inviteEvents } from '@/lib/eventClient'
import { sendTrainingWelcome } from '@/lib/trainingWelcome'

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

/** The login role and organization a Your team invite carries (raw columns), so a
 *  head assigner's tournament director (role `client`, lib/clientEvents) gets their
 *  own short form and no Staff Pool record. */
async function inviteRole(token: string): Promise<{ role: string; orgId: string | null }> {
  try {
    const r = await db().execute({ sql: `SELECT loginRole, orgId FROM "StaffInvite" WHERE token = ?`, args: [token] })
    return { role: String(r.rows[0]?.loginRole || ''), orgId: (r.rows[0]?.orgId as string) ?? null }
  } catch { return { role: '', orgId: null } }   // columns not added yet: a staff invite
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
  await ensureStaffInviteTable()
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

  const asked = await inviteRole(params.token)
  if (asked.role === 'client') {
    return NextResponse.json({ kind: 'client', email: invite.email, name: invite.name, tournamentName: null, orgName: (await orgById(asked.orgId))?.name ?? null })
  }

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

    await ensureStaffInviteTable()

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
        // They already have a login; the staff record matches by email. A Parent (or
        // other no-staff-pages) login becomes Staff, or the staff home stays shut to
        // them (lib/staffLogin, Oct 14 2026).
        await client.execute({ sql: `UPDATE "StaffInvite" SET usedAt = datetime('now') WHERE token = ?`, args: [params.token] })
        await giveStaffAccess(email, (worker.orgId as string | null) ?? null)
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

      // Office heads-up — Bo wants to know the moment someone registers
      await notifyStaffRegistered({
        org: await orgById(workerOrgId), orgId: workerOrgId, name: String(worker.name ?? claim.name ?? email), email,
        phone: (worker.phone as string | null) ?? null, roles: parseWorkerRoles(worker), source: 'claim',
      })
      // Their training videos, in a follow-up email (lib/trainingWelcome).
      await sendTrainingWelcome(String(claim.workerId))
      return NextResponse.json({ ok: true, workerId: String(claim.workerId) })
    }

    // ── Plain invite: original flow, creates a brand-new Worker + User ──
    const invite = await prisma.staffInvite.findUnique({ where: { token: params.token } })
    if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
    if (invite.usedAt) return NextResponse.json({ error: 'Already used' }, { status: 410 })
    if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 410 })

    // ── A head assigner's tournament director: a login only. No Staff Pool record,
    //    roster spot or staff questions: they're the assigner's customer, not staff.
    const asked = await inviteRole(params.token)
    if (asked.role === 'client') {
      const tdName = String(body?.name || '').trim(), tdPassword = String(body?.password || '')
      if (!tdName || !tdPassword) return NextResponse.json({ error: 'Name and password are required' }, { status: 400 })
      if (tdPassword.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
      if (!asked.orgId) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
      const tdEmail = String(invite.email || '').toLowerCase()
      const had = await db().execute({ sql: `SELECT id FROM "User" WHERE lower(email) = ? LIMIT 1`, args: [tdEmail] })
      const hadId = had.rows[0]?.id ? String(had.rows[0].id) : null
      let userId = hadId
      if (hadId) {
        // Their login keeps its password and its home; they become this organization's.
        const r = await addToOrg(hadId, asked.orgId, 'client', 'invite')
        if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      } else {
        const u = await prisma.user.create({ data: { name: tdName, email: tdEmail, password: await bcrypt.hash(tdPassword, 12), role: 'client' } })
        await db().execute({ sql: `UPDATE "User" SET orgId = ? WHERE id = ?`, args: [asked.orgId, u.id] })
        userId = u.id
      }
      // An invite sent from an event's Tournament director page carries that event
      // (lib/eventClient): accepting THIS invite gives it, never a matching email.
      const evs = await inviteEvents(params.token)
      if (evs.length && userId) {
        const inOrg = await db().execute({ sql: `SELECT id FROM "Tournament" WHERE orgId = ? AND id IN (${evs.map(() => '?').join(', ')})`, args: [asked.orgId, ...evs] })
        const ok = inOrg.rows.map(r => String(r.id))
        if (ok.length) await saveClientEvents(userId, [...(await clientEvents(userId)), ...ok], 'invite')
      }
      await prisma.staffInvite.update({ where: { token: params.token }, data: { usedAt: new Date() } })
      return NextResponse.json({ ok: true, alreadyHadAccount: !!hadId })
    }

    const { name, role, gender, certLevel, phone, password } = body
    if (!name || !role || !password) return NextResponse.json({ error: 'Name, role, and password are required' }, { status: 400 })

    const email = invite.email

    // Resolve orgId: prefer the invite's own org (org-level invite), else the tournament's.
    // An invite from Your team also carries the login role the director picked.
    let orgId: string | null = null
    let loginRole = 'staff'
    const oc = db()
    try {
      const inv = await oc.execute({ sql: `SELECT orgId FROM "StaffInvite" WHERE token = ?`, args: [params.token] })
      orgId = (inv.rows[0]?.orgId as string) ?? null
    } catch { /* column may not exist yet */ }
    try {
      const inv = await oc.execute({ sql: `SELECT loginRole FROM "StaffInvite" WHERE token = ?`, args: [params.token] })
      const picked = String(inv.rows[0]?.loginRole || '')
      if (['director', 'scheduler', 'assigner', 'field_director', 'coach', 'staff'].includes(picked)) loginRole = picked
    } catch { /* column may not exist yet: Staff */ }
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
        data: { name, email, password: hashed, role: loginRole },
      })
    }
    // Scope the new/linked user to the invite's org so they only see that org.
    if (orgId) { try { await oc.execute({ sql: `UPDATE "User" SET orgId = ? WHERE lower(email) = ?`, args: [orgId, email] }) } catch {} }
    // A login they already had keeps its password, and a role with no staff pages
    // (a Parent login, most often) takes the invite's role (lib/staffLogin).
    if (existingUser) await giveStaffAccess(email, orgId, loginRole)

    // If invite was for a specific tournament, add to roster
    if (invite.tournamentId) {
      await prisma.rosterEntry.create({
        data: { workerId, tournamentId: invite.tournamentId, gameTarget: 0 },
      }).catch(() => {})
    }

    // Mark invite as used
    await prisma.staffInvite.update({ where: { token: params.token }, data: { usedAt: new Date() } })

    // Office heads-up — Bo wants to know the moment someone registers
    await notifyStaffRegistered({ org: await orgById(orgId), orgId, name, email, phone: phone || null, roles: [defaultRole], source: 'invite' })

    await sendTrainingWelcome(workerId)   // their training videos (lib/trainingWelcome)
    return NextResponse.json({ ok: true, workerId, alreadyHadAccount: !!existingUser })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to accept invite' }, { status: 500 })
  }
}
