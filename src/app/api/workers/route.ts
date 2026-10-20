import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireStaff } from '@/lib/apiAuth'
import { redactWorker, fieldDirectorSees, seesWorkerPay } from '@/lib/roleScope'
import { payScopeFor } from '@/lib/payScope'
import { createClient } from '@libsql/client'
import { presenceByEmail, canSeePresence } from '@/lib/presence'
import { setRefLevel } from '@/lib/refLevelDb'
import { tournamentOrgId } from '@/lib/org'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// Whose Staff Pool this answers with. An admin's View as of an organization (lib/apiAuth:
// gate.viewing) gets that organization's, like its own people. An event page sends its
// event (?tournamentId=), and an admin then gets that event's organization's pool. Both
// used to fall through to every person on the platform (Bo, Oct 16 2026: the Staff roster
// of an Assigner-plan organization's event offered Sunshine's 121 staff, "a completely
// separate organization").
async function resolveOrgId(req: Request, gate: { viewing?: boolean; orgId: string | null }): Promise<{ orgId: string | null; isAdmin: boolean }> {
  if (gate.viewing) return { orgId: gate.orgId, isAdmin: false }
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const sessionOrgId = (session?.user as any)?.orgId ?? null

  if (role === 'admin') {
    const url = new URL(req.url)
    const tournamentId = url.searchParams.get('tournamentId')
    const eventOrg = tournamentId ? await tournamentOrgId(tournamentId) : null
    const viewOrgId = eventOrg ?? url.searchParams.get('viewOrgId')
    return { orgId: viewOrgId ?? null, isAdmin: true }
  }

  return { orgId: sessionOrgId, isAdmin: false }
}

// App-login status for the Staff Pool: is each Worker matched (by email) to a User
// account, or covered by a pending claim invite (see /api/workers/onboard)?
// Best-effort — a failure here must never block the roster itself.
// lastSeenAt / lastLoginAt ride along for event-running roles only (see lib/presence).
async function withAppStatus(client: ReturnType<typeof db>, rows: unknown[], withPresence = false) {
  if (!rows.length) return rows
  const seen = withPresence ? await presenceByEmail(client) : null
  const users = new Map<string, string>()
  try {
    const u = await client.execute(`SELECT lower(email) AS email, role FROM "User" WHERE email IS NOT NULL AND email != ''`)
    for (const r of u.rows as Array<Record<string, unknown>>) users.set(String(r.email), String(r.role ?? ''))
  } catch { /* status stays unknown */ }
  const invByWorker = new Map<string, string>()
  const invByEmail = new Map<string, string>()
  try {
    let inv
    try {
      inv = await client.execute(`SELECT workerId, lower(email) AS email, createdAt FROM "StaffInvite" WHERE usedAt IS NULL AND expiresAt > datetime('now')`)
    } catch {
      // workerId column not migrated yet
      inv = await client.execute(`SELECT NULL AS workerId, lower(email) AS email, createdAt FROM "StaffInvite" WHERE usedAt IS NULL AND expiresAt > datetime('now')`)
    }
    for (const r of inv.rows as Array<Record<string, unknown>>) {
      if (r.workerId) invByWorker.set(String(r.workerId), String(r.createdAt ?? ''))
      if (r.email) invByEmail.set(String(r.email), String(r.createdAt ?? ''))
    }
  } catch { /* table may not exist yet */ }
  return (rows as Array<Record<string, unknown>>).map(r => {
    const email = r.email ? String(r.email).trim().toLowerCase() : ''
    const userRole = email ? users.get(email) : undefined
    const invitedAt = invByWorker.get(String(r.id)) ?? (email ? invByEmail.get(email) : undefined)
    const appStatus = userRole !== undefined ? 'registered' : invitedAt !== undefined ? 'invited' : email ? 'none' : 'no_email'
    const base = { ...r, appStatus, appRole: userRole ?? null, invitedAt: invitedAt ?? null }
    if (!seen) return base   // keys absent = this viewer isn't shown presence
    const p = email ? seen.get(email) : undefined
    return { ...base, lastSeenAt: p?.lastSeenAt ?? null, lastLoginAt: p?.lastLoginAt ?? null }
  })
}

export async function GET(req: Request) {
  // Staff only, and pay / payout / contact columns come back blank for staff
  // whose role does not cover them (the scheduler). This was readable by any
  // signed-in account in the org, coaches included.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  // An assigner sees rates and payout details only for staff in their pay groups
  // (lib/payGroups, Oct 13 2026).
  const scope = await payScopeFor(gate.role, gate.userId)
  // isAssigner is 0/1 in raw SQL; a boolean everywhere else. The edit forms send back
  // what they were given, and Prisma refuses a number for it (see [id]/route.ts).
  // A field director (lib/fieldDirector) sees the scorekeepers, athletic trainers and
  // field ops in the pool, to add them to their events, and never refs.
  const shape = (rows: any[]) => rows
    .filter(r => gate.role !== 'field_director' || fieldDirectorSees(r))
    .map(r => redactWorker({ ...r, isAssigner: !!Number(r.isAssigner) }, gate.role, scope))
  const { orgId, isAdmin } = await resolveOrgId(req, gate)
  const client = db()

  if (isAdmin && !orgId) {
    // Platform view — all workers
    const res = await client.execute(`SELECT * FROM "Worker" ORDER BY name ASC`)
    return NextResponse.json(shape(await withAppStatus(client, res.rows as unknown[], canSeePresence(gate.role))))
  }

  if (orgId) {
    try {
      const res = await client.execute({
        sql: `SELECT * FROM "Worker" WHERE orgId = ? ORDER BY name ASC`,
        args: [orgId],
      })
      return NextResponse.json(shape(await withAppStatus(client, res.rows as unknown[], canSeePresence(gate.role))))
    } catch {
      // orgId column not yet migrated — return empty until migration is run
      return NextResponse.json([])
    }
  }

  return NextResponse.json([])
}

export async function POST(req: Request) {
  // Staff-only since Aug 2026: public self-signup moved to /api/join (code-gated),
  // so nothing unauthenticated needs to create workers here anymore.
  const gatePost = await requireStaff()
  if (!gatePost.ok) return gatePost.res
  // Field directors bring people in with an invite or the signup link instead.
  if (gatePost.role === 'field_director') return NextResponse.json({ error: 'Invite them from the Staff roster instead.' }, { status: 403 })

  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const sessionOrgId = (session?.user as any)?.orgId ?? null

  const body = await req.json()
  // Admin can specify any orgId; org users use their session org; public join passes orgId in body
  const orgId = role === 'admin' ? (body.orgId ?? null) : (sessionOrgId ?? body.orgId ?? null)

  const client = db()

  if (Array.isArray(body.bulk)) {
    let count = 0
    for (const s of body.bulk) {
      const id = crypto.randomUUID()
      await client.execute({
        sql: `INSERT INTO "Worker" (id, name, email, phone, certLevel, defaultRole, roles, isAssigner, gender, payRateOverride, hourlyRate, payMethod, payHandle, orgId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [id, String(s.name), s.email ?? null, s.phone ?? null, String(s.certLevel ?? 'youth'), String(s.defaultRole ?? 'ref'), JSON.stringify(s.roles ?? [s.defaultRole ?? 'ref']), s.isAssigner ? 1 : 0, String(s.gender ?? 'both'), s.payRateOverride != null ? Number(s.payRateOverride) : null, s.hourlyRate != null ? Number(s.hourlyRate) : null, String(s.payMethod ?? 'check'), s.payHandle ?? null, orgId],
      })
      count++
    }
    return NextResponse.json({ created: count }, { status: 201 })
  }

  const { name, email, phone, certLevel, defaultRole, roles, isAssigner, gender, payRateOverride, hourlyRate, payMethod, payHandle, notes, association } = body
  // Worker.association is TEXT NOT NULL DEFAULT '' in production (added Jun 9), and the Staff
  // Pool's Add form sends none when its Association box is empty: inserting null made those
  // adds fail with "Failed" (Oct 20 2026).
  const id = crypto.randomUUID()

  await client.execute({
    sql: `INSERT INTO "Worker" (id, name, email, phone, certLevel, defaultRole, roles, isAssigner, gender, payRateOverride, hourlyRate, payMethod, payHandle, notes, association, orgId, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [id, name, email ?? null, phone ?? null, certLevel ?? 'youth', defaultRole ?? 'ref', JSON.stringify(roles ?? [defaultRole ?? 'ref']), isAssigner ? 1 : 0, gender ?? 'both', payRateOverride ?? null, hourlyRate ?? null, payMethod ?? 'check', payHandle ?? null, notes ?? null, String(association ?? '').trim().slice(0, 120), orgId],
  })

  if (body.referredBy) {
    try { await client.execute(`ALTER TABLE "Worker" ADD COLUMN "referredBy" TEXT`) } catch { /* exists */ }
    await client.execute({ sql: `UPDATE "Worker" SET "referredBy" = ? WHERE id = ?`, args: [String(body.referredBy).trim().slice(0, 120), id] })
  }
  // Ref level (lib/refLevel): only someone who sees this person's pay sets it, the same
  // rule as editing (an assigner, for the staff groups they run).
  if (body.refLevel !== undefined && body.refLevel !== null && body.refLevel !== ''
    && seesWorkerPay({ roles: JSON.stringify(roles ?? [defaultRole ?? 'ref']), defaultRole: defaultRole ?? 'ref', gender: gender ?? 'both' }, gatePost.role, await payScopeFor(gatePost.role, gatePost.userId))) {
    await setRefLevel(id, body.refLevel)
  }

  const created = await client.execute({ sql: `SELECT * FROM "Worker" WHERE id = ?`, args: [id] })
  return NextResponse.json(created.rows[0], { status: 201 })
}
