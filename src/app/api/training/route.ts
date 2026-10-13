import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { TRAINING_VIDEOS, videosFor } from '@/lib/training'

// Staff training videos: which ones a person has watched.
//
// GET                  -> { roles, watched: [videoId] } for the signed-in staff member
// GET ?tournamentId=   -> { counts: { workerId: { watched, total } } } for that event's
//                         roster (directors and admins), shown on the Staff roster
// POST { videoId }     -> mark it watched (the player calls this near the end)
//
// Keyed by the Worker matched on the session email (the same lookup as the staff
// portal), so the roster can count it; a login with no Worker record is keyed
// 'user:<id>'. Raw table, made on first use.

let ready = false
async function ensureTable() {
  if (ready) return
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "StaffTraining" (
    "workerKey" TEXT NOT NULL, "videoId" TEXT NOT NULL, "watchedAt" TEXT NOT NULL,
    PRIMARY KEY ("workerKey", "videoId"))`)
  ready = true
}

type Row = Record<string, unknown>
async function me(email: string, userId: string) {
  const rows = email ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, roles, defaultRole FROM "Worker" WHERE lower(email) = ? ORDER BY createdAt ASC LIMIT 1`, email) : []
  const w = rows[0]
  let roles: string[] = []
  if (w) {
    try { const r = JSON.parse(String(w.roles ?? '[]')); if (Array.isArray(r)) roles = r.map(String) } catch { /* none */ }
    if (!roles.length && w.defaultRole) roles = [String(w.defaultRole)]
  }
  return { key: w ? String(w.id) : `user:${userId}`, roles }
}

export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  try {
    await ensureTable()
    const tid = req.nextUrl.searchParams.get('tournamentId')
    if (tid) {
      if (gate.role !== 'admin' && gate.role !== 'director') return NextResponse.json({ error: 'Directors only' }, { status: 403 })
      if (gate.role !== 'admin' && gate.orgId && (await tournamentOrgId(tid)) !== gate.orgId) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
      const roster = await prisma.$queryRawUnsafe<Row[]>(`SELECT w.id, w.roles, w.defaultRole FROM "RosterEntry" r JOIN "Worker" w ON w.id = r.workerId WHERE r.tournamentId = ?`, tid)
      const ids = roster.map((r: Row) => String(r.id))
      const seen = ids.length
        ? await prisma.$queryRawUnsafe<Row[]>(`SELECT workerKey, videoId FROM "StaffTraining" WHERE workerKey IN (${ids.map(() => '?').join(', ')})`, ...ids)
        : []
      const byWorker = new Map<string, Set<string>>()
      for (const s of seen) { const k = String(s.workerKey); if (!byWorker.has(k)) byWorker.set(k, new Set()); byWorker.get(k)!.add(String(s.videoId)) }
      const counts: Record<string, { watched: number; total: number }> = {}
      for (const w of roster) {
        let roles: string[] = []
        try { const r = JSON.parse(String(w.roles ?? '[]')); if (Array.isArray(r)) roles = r.map(String) } catch { /* none */ }
        if (!roles.length && w.defaultRole) roles = [String(w.defaultRole)]
        const want = videosFor(roles)
        const got = byWorker.get(String(w.id)) || new Set()
        counts[String(w.id)] = { watched: want.filter(v => got.has(v)).length, total: want.length }
      }
      return NextResponse.json({ counts })
    }
    const who = await me(String(gate.session?.user?.email ?? '').trim().toLowerCase(), gate.userId || '')
    const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT videoId FROM "StaffTraining" WHERE workerKey = ?`, who.key)
    return NextResponse.json({ roles: who.roles, watched: rows.map((r: Row) => String(r.videoId)) })
  } catch (e) {
    console.error('[api/training] GET failed:', e)
    return NextResponse.json({ error: 'Could not load training' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const videoId = String(b.videoId || '')
  if (!TRAINING_VIDEOS.some(v => v.id === videoId)) return NextResponse.json({ error: 'Unknown video' }, { status: 400 })
  try {
    await ensureTable()
    const who = await me(String(gate.session?.user?.email ?? '').trim().toLowerCase(), gate.userId || '')
    await prisma.$executeRawUnsafe(`INSERT OR IGNORE INTO "StaffTraining" ("workerKey", "videoId", "watchedAt") VALUES (?, ?, ?)`, who.key, videoId, new Date().toISOString())
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/training] POST failed:', e)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
}
