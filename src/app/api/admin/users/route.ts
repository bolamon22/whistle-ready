import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { presenceByEmail } from '@/lib/presence'
import { ensureClubAccess } from '@/lib/clubAccess'

// What each login is linked to, so the list can say who a "Staff" login is and
// search it. Bo, Oct 13 2026: an athletic trainer showed only as Staff, and
// searching "trainer" found nobody. Every event worker logs in as Staff; their job
// lives on their Staff Pool record, matched by email like everywhere else (no FK).
type StaffLink = { workerId: string; jobs: string[]; gender: string; records: number }

async function staffByEmail(): Promise<Map<string, StaffLink>> {
  const out = new Map<string, StaffLink>()
  try {
    const ws = await prisma.worker.findMany({
      where: { email: { not: null } },
      select: { id: true, email: true, roles: true, defaultRole: true, gender: true },
      orderBy: { createdAt: 'asc' },
    })
    for (const w of ws) {
      const e = (w.email || '').trim().toLowerCase()
      if (!e) continue
      let jobs: string[] = []
      try { const r = JSON.parse(w.roles || '[]'); if (Array.isArray(r)) jobs = r.map(String) } catch { /* bad JSON: defaultRole */ }
      if (!jobs.length && w.defaultRole) jobs = [w.defaultRole]
      const cur = out.get(e)
      if (cur) { cur.records++; for (const j of jobs) if (!cur.jobs.includes(j)) cur.jobs.push(j) }
      else out.set(e, { workerId: w.id, jobs, gender: w.gender || 'both', records: 1 })   // oldest record is the link
    }
  } catch (e) { console.error('[admin users] staff records', e) }
  return out
}

/** Club names each login can open in the club portal (lib/clubAccess). */
async function clubsByUser(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  try {
    await ensureClubAccess()
    const rows = await prisma.$queryRawUnsafe<{ userId: string; clubName: string }[]>(
      `SELECT a.userId AS userId, r.clubName AS clubName FROM "ClubRegAccess" a JOIN "TeamRegistration" r ON r.id = a.registrationId
        WHERE r.deletedAt IS NULL ORDER BY r.createdAt DESC`)
    for (const r of rows) {
      const id = String(r.userId), club = String(r.clubName || '').trim()
      if (!club) continue
      const list = out.get(id) ?? []
      if (!list.some(c => c.toLowerCase() === club.toLowerCase())) list.push(club)
      out.set(id, list)
    }
  } catch (e) { console.error('[admin users] clubs', e) }
  return out
}

/** How many player waivers each parent login is linked to (lib/parentWaivers). A count only. */
async function playersByUser(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  try {
    // Made on first use by lib/parentWaivers; skip quietly until then (Prisma logs a failed query).
    const has = await prisma.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ParentWaiverLink'`)
    if (!has.length) return out
    const rows = await prisma.$queryRawUnsafe<{ userId: string; n: number }[]>(
      `SELECT "userId" AS userId, COUNT(*) AS n FROM "ParentWaiverLink" GROUP BY "userId"`)
    for (const r of rows) out.set(String(r.userId), Number(r.n) || 0)
  } catch { /* no links table yet */ }
  return out
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, email: true, role: true, createdAt: true } })
  const [seen, staff, clubs, players] = await Promise.all([presenceByEmail(), staffByEmail(), clubsByUser(), playersByUser()])
  return NextResponse.json(users.map(u => {
    const email = (u.email || '').trim().toLowerCase()
    const p = seen.get(email)
    return {
      ...u, lastSeenAt: p?.lastSeenAt ?? null, lastLoginAt: p?.lastLoginAt ?? null,
      staff: staff.get(email) ?? null, clubs: clubs.get(u.id) ?? [], players: players.get(u.id) ?? 0,
    }
  }))
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, role } = await req.json()
  const user = await prisma.user.update({ where: { id }, data: { role } })
  return NextResponse.json(user)
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json()
  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
