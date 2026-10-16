import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createClient } from '@libsql/client'
import { sendEmail } from '@/lib/email'
import { ensureStaffInviteTable } from '@/lib/staffInviteTable'
import { MEMBER_ROLES, addToOrg, orgPeople, removeFromOrg, setRoleIn } from '@/lib/orgMembers'
import crypto from 'crypto'

// Owner/director self-serve management of THEIR organization's users.
// Everything is scoped to the signed-in user's orgId (never trusted from the client).
// StaffInvite.orgId is a raw column (not in the Prisma schema), so we add it via a
// guarded ALTER and write it with the libsql client.
//
// One login can work in several organizations (lib/orgMembers). Adding someone who
// already has a login no longer moves it here: it used to set their User.orgId and
// role, which took them out of their own organization and could even demote an admin
// by email. Now their home stays put and they become a member here, with the role
// picked here; admins can't be added, changed or removed from this page at all.

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL — prod's still points at old gameday-staff5.vercel.app (found Aug 28)
const ASSIGNABLE_ROLES = MEMBER_ROLES

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}
async function ctx() {
  const s = await getServerSession(authOptions)
  return { s, role: (s?.user as any)?.role as string | undefined, orgId: (s?.user as any)?.orgId as string | null, email: s?.user?.email ?? null }
}
const canManage = (role?: string) => role === 'director'
async function ensureInviteCol(_client: unknown) {
  await ensureStaffInviteTable() // table + raw columns — prod Turso never had the table
}

export async function GET() {
  const { s, role, orgId } = await ctx()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(role) || !orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const client = db(); await ensureInviteCol(client)
    const users = await orgPeople(orgId)
    const invites = await client.execute({ sql: `SELECT id, email, name, token FROM "StaffInvite" WHERE orgId = ? AND usedAt IS NULL ORDER BY createdAt DESC`, args: [orgId] })
    return NextResponse.json({ users, invites: invites.rows })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// Add a user to my org: assign an existing account, or invite a new one by email.
export async function POST(req: NextRequest) {
  const { s, role, orgId } = await ctx()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(role) || !orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email || '').trim().toLowerCase()
    const name = body.name ? String(body.name) : null
    const newRole = ASSIGNABLE_ROLES.includes(body.role) ? body.role : 'staff'
    if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

    const client = db(); await ensureInviteCol(client)

    // Already has an account → into this org with the chosen role (lib/orgMembers:
    // their own org, if they have one, stays theirs).
    const existing = await client.execute({ sql: `SELECT id FROM "User" WHERE lower(email) = ? LIMIT 1`, args: [email] })
    if (existing.rows[0]?.id) {
      const r = await addToOrg(String(existing.rows[0].id), orgId, newRole, String(s?.user?.email || ''))
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      return NextResponse.json({ ok: true, assigned: true, member: r.how === 'member' })
    }

    // Otherwise create an org-scoped invite + email a join link.
    await prisma.staffInvite.updateMany({ where: { email, usedAt: null }, data: { expiresAt: new Date() } })
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await prisma.staffInvite.create({ data: { token, email, name, tournamentId: null, expiresAt } })
    await client.execute({ sql: `UPDATE "StaffInvite" SET orgId = ?, loginRole = ? WHERE token = ?`, args: [orgId, newRole, token] })
    const inviteUrl = `${APP_URL}/invite/${token}`

    // email optional — owner can copy the link; sendEmail never throws
    await sendEmail({
      to: email, subject: `You're invited to join the team`,
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px"><h2 style="color:#0f172a">You've been invited to join the team</h2><p style="color:#475569">${name ? `Hi ${name}, ` : ''}click below to set up your account.</p><a href="${inviteUrl}" style="display:inline-block;background:#14b8a6;color:#fff;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none">Accept invite →</a><p style="color:#94a3b8;font-size:13px;margin-top:24px">Link expires in 7 days.</p></div>`,
    })
    return NextResponse.json({ ok: true, inviteUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// Change a member's role within my org.
export async function PATCH(req: NextRequest) {
  const { s, role, orgId } = await ctx()
  if (!s || !canManage(role) || !orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const body = await req.json().catch(() => ({}))
    const userId = String(body.userId || '')
    const newRole = ASSIGNABLE_ROLES.includes(body.role) ? body.role : null
    if (!userId || !newRole) return NextResponse.json({ error: 'userId and role required' }, { status: 400 })
    if (!(await setRoleIn(userId, orgId, newRole))) return NextResponse.json({ error: 'They are not on your team.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// Remove a member from my org, or cancel a pending invite.
export async function DELETE(req: NextRequest) {
  const { s, role, orgId } = await ctx()
  if (!s || !canManage(role) || !orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const client = db(); await ensureInviteCol(client)
    const userId = req.nextUrl.searchParams.get('userId')
    const inviteId = req.nextUrl.searchParams.get('inviteId')
    if (userId) await removeFromOrg(userId, orgId)
    if (inviteId) await client.execute({ sql: `UPDATE "StaffInvite" SET expiresAt = datetime('now') WHERE id = ? AND orgId = ?`, args: [inviteId, orgId] })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
