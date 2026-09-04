import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { createClient } from '@libsql/client'
import bcrypt from 'bcryptjs'
import { orgById } from '@/lib/org'
import { sendEmail, orgSender } from '@/lib/email'
import { encrypt } from '@/lib/encrypt'

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app'

/** Upcoming/current events for an org — shown as checkboxes on the signup form. */
async function upcomingEvents(client: ReturnType<typeof db>, orgId: string) {
  const res = await client.execute({
    sql: `SELECT id, name, startDate, endDate, location, logoUrl FROM "Tournament" WHERE orgId = ? ORDER BY CASE WHEN startDate = '' THEN 1 ELSE 0 END, startDate ASC`,
    args: [orgId],
  })
  const today = new Date().toISOString().slice(0, 10)
  return (res.rows as unknown as Record<string, unknown>[])
    .filter(t => { const last = String(t.endDate || '') || String(t.startDate || ''); return !last || last >= today })
    .slice(0, 8)
    .map(t => ({ id: String(t.id), name: String(t.name ?? ''), startDate: String(t.startDate || ''), endDate: String(t.endDate || ''), location: String(t.location || ''), logoUrl: String(t.logoUrl || '') }))
}
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

/** Short links carry only the code — resolve the org via joinCodeMap:{code},
 *  double-checked against joinCode:{orgId} so rotated codes die. Legacy links
 *  still pass an explicit org. Returns the orgId, or null when invalid. */
async function resolveOrg(orgId: string, code: string): Promise<string | null> {
  if (!code) return null
  if (orgId) return (await validCode(orgId, code)) ? orgId : null
  const map = await prisma.appSetting.findUnique({ where: { key: `joinCodeMap:${code}` } })
  const mapped = map?.value || ''
  if (!mapped) return null
  return (await validCode(mapped, code)) ? mapped : null
}

// GET /api/join?org=&code= — validate a recruiting link, return the org name
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code') || ''
  const orgId = await resolveOrg(url.searchParams.get('org') || '', code)
  if (!orgId) {
    return NextResponse.json({ error: 'This signup link is not active. Ask your coordinator for the current link.' }, { status: 404 })
  }
  const org = await orgById(orgId)
  return NextResponse.json({ orgName: org?.name ?? null, events: await upcomingEvents(db(), orgId) })
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

    const code = String(body.code ?? '')
    const orgId = await resolveOrg(String(body.org ?? ''), code)
    if (!orgId) {
      return NextResponse.json({ error: 'This signup link is no longer active.' }, { status: 403 })
    }

    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const phone = body.phone ? String(body.phone).trim() : null
    const role = ROLES.has(String(body.role)) ? String(body.role) : 'ref'
    const gender = GENDERS.has(String(body.gender)) ? String(body.gender) : 'both'
    const certLevel = CERTS.has(String(body.certLevel)) ? String(body.certLevel) : 'youth'
    const password = String(body.password ?? '')
    // Payment details — ALL methods are collected and stored on the Worker (Bo: "if we
    // can't pay them one way, we'd rather try the next"); payMethod is the PREFERENCE.
    // payHandle mirrors the preferred method's handle so existing payroll code keeps working.
    const payMethod = ['check', 'venmo', 'zelle'].includes(String(body.payMethod)) ? String(body.payMethod) : 'check'
    const venmoHandle = body.venmoHandle ? String(body.venmoHandle).slice(0, 120) : null
    const zelleHandle = body.zelleHandle ? String(body.zelleHandle).slice(0, 120) : null
    const mailingAddress = body.mailingAddress ? String(body.mailingAddress).slice(0, 400) : null
    const payHandle = payMethod === 'venmo' ? venmoHandle : payMethod === 'zelle' ? zelleHandle : null

    if (!name || !email || !password) return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })

    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists — sign in instead.' }, { status: 409 })
    }

    const client = db()

    // Raw Worker columns for payment/tax details (guarded, same pattern as association)
    try { await client.execute(`ALTER TABLE "Worker" ADD COLUMN "mailingAddress" TEXT`) } catch { /* exists */ }
    try { await client.execute(`ALTER TABLE "Worker" ADD COLUMN "venmoHandle" TEXT`) } catch { /* exists */ }
    try { await client.execute(`ALTER TABLE "Worker" ADD COLUMN "zelleHandle" TEXT`) } catch { /* exists */ }
    try { await client.execute(`ALTER TABLE "Worker" ADD COLUMN "w9OnFile" INTEGER NOT NULL DEFAULT 0`) } catch { /* exists */ }

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
      const wr = w as Record<string, unknown>
      if (!wr.payHandle && !wr.mailingAddress && !wr.venmoHandle && !wr.zelleHandle && (venmoHandle || zelleHandle || mailingAddress)) {
        await client.execute({
          sql: `UPDATE "Worker" SET payMethod = ?, payHandle = ?, venmoHandle = ?, zelleHandle = ?, mailingAddress = ?, updatedAt = datetime('now') WHERE id = ?`,
          args: [payMethod, payHandle, venmoHandle, zelleHandle, mailingAddress, workerId],
        })
      }
    } else {
      workerId = crypto.randomUUID()
      await client.execute({
        sql: `INSERT INTO "Worker" (id, name, email, phone, certLevel, defaultRole, roles, isAssigner, gender, payMethod, payHandle, venmoHandle, zelleHandle, mailingAddress, orgId, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        args: [workerId, name, email, phone, certLevel, role, JSON.stringify([role]), gender, payMethod, payHandle, venmoHandle, zelleHandle, mailingAddress, orgId],
      })
    }

    // Optional headshot (client-compressed data URL) — goes on their staff ID card.
    const photo = typeof body.photo === 'string' && body.photo.startsWith('data:image/') && body.photo.length < 400000 ? body.photo : null
    if (photo) {
      await client.execute({ sql: `UPDATE "Worker" SET photoUrl = ?, updatedAt = datetime('now') WHERE id = ?`, args: [photo, workerId] })
    }

    // W-9 (photo or PDF): encrypted at rest (AES-256-GCM, src/lib/encrypt), stored under
    // AppSetting w9:{workerId} — NOT on the Worker row, so it never rides along in list
    // payloads. Retrieval is director-only (/api/workers/[id]/w9).
    const w9 = typeof body.w9 === 'string' && (body.w9.startsWith('data:image/') || body.w9.startsWith('data:application/pdf')) && body.w9.length < 2000000 ? body.w9 : null
    if (w9) {
      const value = encrypt(w9)
      await prisma.appSetting.upsert({ where: { key: `w9:${workerId}` }, update: { value }, create: { key: `w9:${workerId}`, value } })
      await client.execute({ sql: `UPDATE "Worker" SET w9OnFile = 1, updatedAt = datetime('now') WHERE id = ?`, args: [workerId] })
    }

    // Events they said they can work → straight onto those rosters (same pool the
    // Staff Roster page and Assigner read).
    const wanted = Array.isArray(body.tournamentIds) ? body.tournamentIds.filter((x: unknown): x is string => typeof x === 'string').slice(0, 8) : []
    const valid = await upcomingEvents(client, orgId)
    const joined: { id: string; name: string; startDate: string; endDate: string; logoUrl: string }[] = []
    for (const tid of wanted) {
      const ev = valid.find(e => e.id === tid)
      if (!ev) continue
      await client.execute({
        sql: `INSERT OR IGNORE INTO "RosterEntry" (id, workerId, tournamentId, gameTarget, createdAt) VALUES (?, ?, ?, 0, datetime('now'))`,
        args: [crypto.randomUUID(), workerId, tid],
      })
      joined.push({ id: ev.id, name: ev.name, startDate: ev.startDate, endDate: ev.endDate, logoUrl: ev.logoUrl })
    }

    const hashed = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({ data: { name, email, password: hashed, role: 'staff' } })
    try { await client.execute({ sql: `UPDATE "User" SET orgId = ? WHERE id = ?`, args: [orgId, user.id] }) } catch { /* raw column */ }

    // Welcome letter, from the org (the employer — same rule as staff invites).
    const org = await orgById(orgId)
    const orgLabel = org?.name || 'Whistle Ready'
    const firstName = name.split(/\s+/)[0] || ''
    const eventLines = joined.length
      ? `<p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;"><strong>You signed up to work:</strong></p><ul style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;padding-left:20px;">${joined.map(e => `<li>${e.name}${e.startDate ? ` — ${e.startDate}${e.endDate && e.endDate !== e.startDate ? ` to ${e.endDate}` : ''}` : ''}</li>`).join('')}</ul>`
      : ''
    await sendEmail({
      ...orgSender(org),
      to: email,
      subject: `Welcome to the ${orgLabel} staff team`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
          <h2 style="font-size: 22px; font-weight: 700; color: #0f172a; margin: 0 0 8px;">Welcome to the crew${firstName ? `, ${firstName}` : ''}!</h2>
          <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            You're on the ${orgLabel} staff list. Your staff portal is where your events, schedule,
            availability, and assignments live.
          </p>
          ${eventLines}
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
            You're set up to be paid by <strong>${payMethod === 'venmo' ? 'Venmo' : payMethod === 'zelle' ? 'Zelle' : 'check'}</strong>${payHandle ? ` (${payHandle})` : ''}${[payMethod !== 'venmo' && venmoHandle ? 'Venmo' : '', payMethod !== 'zelle' && zelleHandle ? 'Zelle' : '', payMethod !== 'check' && mailingAddress ? 'check' : ''].filter(Boolean).length ? `, with ${[payMethod !== 'venmo' && venmoHandle ? 'Venmo' : '', payMethod !== 'zelle' && zelleHandle ? 'Zelle' : '', payMethod !== 'check' && mailingAddress ? 'check' : ''].filter(Boolean).join(' and ')} as backup` : ''}.
            ${w9 ? 'Your W-9 is on file.' : 'One thing before your first paycheck: we\'ll need a completed W-9 — you can send it to us anytime.'}
          </p>
          <p style="color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
            <strong>What happens next:</strong><br>
            1. Sign in to your staff portal.<br>
            2. Set your availability for each event.<br>
            3. Game assignments land in your portal — pay follows each event.
          </p>
          <a href="${APP_URL}/login"
            style="display: inline-block; background: #14b8a6; color: white; font-weight: 600;
                   font-size: 15px; padding: 12px 28px; border-radius: 10px; text-decoration: none;">
            Sign in to your portal &rarr;
          </a>
          <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">
            Questions? Just reply to this email.
          </p>
        </div>
      `,
    })

    return NextResponse.json({ ok: true, linked, workerId, events: joined.map(e => ({ name: e.name, logoUrl: e.logoUrl })) }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to sign up' }, { status: 500 })
  }
}
