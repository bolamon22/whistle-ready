import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// GET — validate token
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const invite = await prisma.staffInvite.findUnique({ where: { token: params.token } })
  if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
  if (invite.usedAt) return NextResponse.json({ error: 'This invite has already been used' }, { status: 410 })
  if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })

  let tournamentName: string | null = null
  if (invite.tournamentId) {
    const t = await prisma.tournament.findUnique({ where: { id: invite.tournamentId }, select: { name: true } })
    tournamentName = t?.name ?? null
  }

  return NextResponse.json({ email: invite.email, name: invite.name, tournamentName })
}

// POST — accept invite
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const invite = await prisma.staffInvite.findUnique({ where: { token: params.token } })
    if (!invite) return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 })
    if (invite.usedAt) return NextResponse.json({ error: 'Already used' }, { status: 410 })
    if (invite.expiresAt < new Date()) return NextResponse.json({ error: 'Expired' }, { status: 410 })

    const { name, role, gender, certLevel, phone, password } = await req.json()
    if (!name || !role || !password) return NextResponse.json({ error: 'Name, role, and password are required' }, { status: 400 })

    const email = invite.email

    // Resolve orgId from the tournament this invite belongs to
    let orgId: string | null = null
    if (invite.tournamentId) {
      const client = db()
      const res = await client.execute({
        sql: `SELECT orgId FROM "Tournament" WHERE id = ?`,
        args: [invite.tournamentId],
      })
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
