import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { orgById } from '@/lib/org'
import { allowRequest, clientIp, rateLimitedResponse } from '@/lib/rateLimit'

function db() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN })
}

// Public staff recruiting signup (the /join page), CODE-GATED per org.
//
// Why the code: /api/auth/register was botted in Jul 2026, so public endpoints must
// not mint staff-visible accounts. This endpoint may ONLY create a role:'staff' login
// because the request must carry the org's secret join code (AppSetting joinCode:{orgId},
// minted by /api/workers/recruit-link and distributed inside the recruiting letter).
// Regenerating the code kills every previously shared link.
//
// Duplicate guard: an email already in this org's Worker pool LINKS to that record
// (fills only empty fields) instead of creating a second Worker.

const ROLES = new Set(['ref', 'scorekeeper', 'field_ops', 'athletic_trainer'])
const GENDERS = new Set(['boys', 'girls', 'both'])
const CERTS = new Set(['youth', 'hs', 'college', 'none'])

async function validCode(orgId: string, code: string): Promise<boolean> {
  if (!orgId || !code) return false
  const setting = await prisma.appSetting.findUnique({ where: { key: `joinCode:${orgId}` } })
  return !!setting && setting.value === code
}

// GET /api/join?org=&code= — validate a recruiting link, return the org name
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const orgId = url.searchParams.get('org') || ''
  const code = url.searchParams.get('code') || ''
  if (!(await validCode(orgId, code))) {
    return NextResponse.json({ error: 'This signup link is not active. Ask your coordinator for the current link.' }, { status: 404 })
  }
  const org = await orgById(orgId)
  return NextResponse.json({ orgName: org?.name ?? null })
}

// POST — create (or link) a Worker + staff login
export async function POST(req: NextRequest) {
  // Best-effort per-instance rate limit (see src/lib/rateLimit.ts) -- this is a
  // fully public signup endpoint, code-gated but still worth capping.
  const RL_WINDOW_MS = 60_000
  if (!allowRequest(`join:${clientIp(req)}`, 5, RL_WINDOW_MS)) return rateLimitedResponse(RL_WINDOW_MS)
  try {
    const body = await req.json()

    // Honeypot (same trick as /api/auth/register): bots fill it, humans never see it.
    if (body.hp_extra) return NextResponse.json({ ok: true }, { status: 201 })

    const orgId = String(body.org ?? '')
    const code = String(body.code ?? '')
    if (!(await validCode(orgId, code))) {
      return NextResponse.json({ error: 'This signup link is no longer active.' }, { status: 403 })
    }

    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const phone = body.phone ? String(body.phone).trim() : null
    const role = ROLES.has(String(body.role)) ? String(body.role) : 'ref'
    const gender = GENDERS.has(String(body.gender)) ? String(body.gender) : 'both'
    const certLevel = CERTS.has(String(body.certLevel)) ? String(body.certLevel) : 'youth'
    const password = String(body.password ?? '')

    if (!name || !email || !password) return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists — sign in instead.' }, { status: 409 })
    }

    const client = db()

    // Duplicate guard: already in this org's pool by email → link, don't duplicate
    const wRes = await client.execute({ sql: `SELECT * FROM "Worker" WHERE lower(email) = ? AND orgId = ?`, args: [email, orgId] })
    let workerId: string
    let linked = false
    if (wRes.rows.length) {
      const w = wRes.rows[0] as Record<string, unknown>
      workerId = String(w.id)
      linked = true
      // Fill gaps only — never overwrite what the organizer already entered
      if (!w.phone && phone) {
        await client.execute({ sql: `UPDATE "Worker" SET phone = ?, updatedAt = datetime('now') WHERE id = ?`, args: [phone, workerId] })
      }
    } else {
      workerId = crypto.randomUUID()
      await client.execute({
        sql: `INSERT INTO "Worker" (id, name, email, phone, certLevel, defaultRole, roles, isAssigner, gender, payMethod, orgId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'check', ?, datetime('now'), datetime('now'))`,
        args: [workerId, name, email, phone, certLevel, role, JSON.stringify([role]), gender, orgId],
      })
    }

    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({ data: { name, email, password: hashed, role: 'staff' } })
    try { await client.execute({ sql: `UPDATE "User" SET orgId = ? WHERE id = ?`, args: [orgId, user.id] }) } catch { /* raw column */ }

    return NextResponse.json({ ok: true, linked, workerId }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to sign up' }, { status: 500 })
  }
}
