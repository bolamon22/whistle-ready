import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createClient } from '@libsql/client'
import { Resend } from 'resend'
import crypto from 'crypto'

// Owner/director self-serve management of THEIR organization's users.
// Everything is scoped to the signed-in user's orgId (never trusted from the client).
// StaffInvite.orgId is a raw column (not in the Prisma schema), so we add it via a
// guarded ALTER and write it with the libsql client.

const APP_URL = process.env.NEXTAUTH_URL || 'https://whistleready.app'
const FROM_EMAIL = process.env.INVITE_FROM_EMAIL || 'invites@gamedaystaff.com'
const ASSIGNABLE_ROLES = ['director', 'scheduler', 'assigner', 'coach', 'staff']

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}
async function ctx() {
  const s = await getServerSession(authOptions)
  return { s, role: (s?.user as any)?.role as string | undefined, orgId: (s?.user as any)?.orgId as string | null, email: s?.user?.email ?? null }
}
const canManage = (role?: string) => role === 'director'
async function ensureInviteCol(client: any) {
  try { await client.execute(`ALTER TABLE "StaffInvite" ADD COLUMN "orgId" TEXT`) } catch { /* exists */ }
}

export async function GET() {
  const { s, role, orgId } = await ctx()
  if (!s) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManage(role) || !orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const client = db(); await ensureInviteCol(client)
    const users = await client.execute({ sql: `SELECT id, name, email, role FROM "User" WHERE orgId = ? ORDER BY name COLLATE NOCASE`, args: [orgId] })
    const invites = await client.execute({ sql: `SELECT id, email, name, token FROM "StaffInvite" WHERE orgId = ? AND usedAt IS NULL ORDER BY createdAt DESC`, args: [orgId] })
    return NextResponse.json({ users: users.rows, invites: invites.rows })
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

    // Already has an account → just attach to this org with the chosen role.
    const existing = await client.execute({ sql: `SELECT id FROM "User" WHERE lower(email) = ? LIMIT 1`, args: [email] })
    if (existing.rows[0]?.id) {
      await client.execute({ sql: `UPDATE "User" SET orgId = ?, role = ? WHERE id = ?`, args: [orgId, newRole, existing.rows[0].id] })
      return NextResponse.json({ ok: true, assigned: true })
    }

    // Otherwise create an org-scoped invite + email a join link.
    await prisma.staffInvite.updateMany({ where: { email, usedAt: null }, data: { expiresAt: new Date() } })
    const token = crypto.randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await prisma.staffInvite.create({ data: { token, email, name, tournamentId: null, expiresAt } })
    await client.execute({ sql: `UPDATE "StaffInvite" SET orgId = ? WHERE token = ?`, args: [orgId, token] })
    const inviteUrl = `${APP_URL}/invite/${token}`

    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: FROM_EMAIL, to: email, subject: `You're invited to join the team`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px"><h2 style="color:#0f172a">You've been invited to join the team</h2><p style="color:#475569">${name ? `Hi ${name}, ` : ''}click below to set up your account.</p><a href="${inviteUrl}" style="display:inline-block;background:#14b8a6;color:#fff;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none">Accept invite →</a><p style="color:#94a3b8;font-size:13px;margin-top:24px">Link expires in 7 days.</p></div>`,
      })
    } catch { /* email optional — owner can copy the link */ }
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
    const client = db()
    await client.execute({ sql: `UPDATE "User" SET role = ? WHERE id = ? AND orgId = ?`, args: [newRole, userId, orgId] })
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
    if (userId) await client.execute({ sql: `UPDATE "User" SET orgId = NULL WHERE id = ? AND orgId = ?`, args: [userId, orgId] })
    if (inviteId) await client.execute({ sql: `UPDATE "StaffInvite" SET expiresAt = datetime('now') WHERE id = ? AND orgId = ?`, args: [inviteId, orgId] })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
