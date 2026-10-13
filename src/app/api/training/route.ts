import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { TRAINING_VIDEOS, videosFor, workerRoles } from '@/lib/training'
import { payScopeFor } from '@/lib/payScope'
import { seesPay, workerPayGroups } from '@/lib/payGroups'

// Staff training videos: which ones a person has watched.
//
// GET                  -> { roles, watched: [videoId], plays: {videoId: n} } for the signed-in staff member
// GET ?report=1        -> { people: [...] } every Staff Pool person with plays per video (Video library)
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
  // How many times they've watched it through, and when last (Bo, Oct 13 2026: "give us
  // a count on how many times they've watched it"). Guarded: the columns may exist.
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "StaffTraining" ADD COLUMN "plays" INTEGER NOT NULL DEFAULT 1`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "StaffTraining" ADD COLUMN "lastWatchedAt" TEXT`) } catch { /* exists */ }
  ready = true
}

type Row = Record<string, unknown>
async function me(email: string, userId: string, loginRole = '') {
  const rows = email ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, roles, defaultRole, isAssigner FROM "Worker" WHERE lower(email) = ? ORDER BY createdAt ASC LIMIT 1`, email) : []
  const w = rows[0]
  const roles = w ? workerRoles(w) : []
  if (loginRole === 'assigner' && !roles.includes('assigner')) roles.push('assigner')
  return { key: w ? String(w.id) : `user:${userId}`, roles }
}


export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  try {
    await ensureTable()
    // The Video library's "Who's watched": every Staff Pool person, what they should
    // watch, and per video how many times and when (directors and admins).
    if (req.nextUrl.searchParams.get('report')) {
      // An assigner sees only the staff groups they run (boys refs, girls refs, ...).
      const director = gate.role === 'admin' || gate.role === 'director'
      if (!director && gate.role !== 'assigner') return NextResponse.json({ error: 'Directors and assigners only' }, { status: 403 })
      const scope = director ? null : await payScopeFor(gate.role, gate.userId)
      let ws = gate.orgId
        ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner, gender FROM "Worker" WHERE orgId = ? ORDER BY name`, gate.orgId)
        : await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner, gender FROM "Worker" ORDER BY name`)
      if (scope) ws = ws.filter((w: Row) => seesPay(scope, workerPayGroups(w as any)))
      const ids = ws.map((w: Row) => String(w.id))
      const seen: Row[] = []
      for (let i = 0; i < ids.length; i += 400) {
        const part = ids.slice(i, i + 400)
        seen.push(...await prisma.$queryRawUnsafe<Row[]>(`SELECT workerKey, videoId, watchedAt, plays, lastWatchedAt FROM "StaffTraining" WHERE workerKey IN (${part.map(() => '?').join(', ')})`, ...part))
      }
      // Views saved while a login had no Staff Pool record with the same email are kept
      // under user:<id>. Fold them into the person whose email matches that login now,
      // so nobody's watching goes missing from the report (Bo, Oct 13 2026).
      const byEmail = new Map(ws.filter((w: Row) => w.email).map((w: Row) => [String(w.email).trim().toLowerCase(), String(w.id)]))
      const orphan = await prisma.$queryRawUnsafe<Row[]>(`SELECT s.workerKey, s.videoId, s.watchedAt, s.plays, s.lastWatchedAt, lower(u.email) AS email FROM "StaffTraining" s JOIN "User" u ON s.workerKey = 'user:' || u.id`).catch(() => [] as Row[])
      for (const r of orphan) { const wid = byEmail.get(String(r.email || '')); if (wid) seen.push({ ...r, workerKey: wid }) }
      const by = new Map<string, Record<string, { plays: number; first: string; last: string }>>()
      for (const r of seen) {
        const k = String(r.workerKey); const m = by.get(k) || {}
        const v = { plays: Number(r.plays ?? 1) || 1, first: String(r.watchedAt || ''), last: String(r.lastWatchedAt || r.watchedAt || '') }
        const o = m[String(r.videoId)]
        m[String(r.videoId)] = o ? { plays: o.plays + v.plays, first: o.first < v.first ? o.first : v.first, last: o.last > v.last ? o.last : v.last } : v
        by.set(k, m)
      }
      // Which events each person is on the staff roster for, so the library can pick
      // "everyone working Monster Mash" (Bo, Oct 13 2026). Current and upcoming events
      // only (ended more than two weeks ago drops off).
      const onEvent = new Map<string, string[]>()
      for (let i = 0; i < ids.length; i += 400) {
        const part = ids.slice(i, i + 400)
        const rs = await prisma.$queryRawUnsafe<Row[]>(`SELECT workerId, tournamentId FROM "RosterEntry" WHERE workerId IN (${part.map(() => '?').join(', ')})`, ...part)
        for (const r of rs) onEvent.set(String(r.workerId), [...(onEvent.get(String(r.workerId)) || []), String(r.tournamentId)])
      }
      const tids = Array.from(new Set(Array.from(onEvent.values()).flat()))
      const cutoff = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)
      const events = tids.length
        ? (await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, startDate, endDate FROM "Tournament" WHERE id IN (${tids.map(() => '?').join(', ')})`, ...tids))
            .filter((t: Row) => String(t.endDate || t.startDate || '9999') >= cutoff)
            .sort((a: Row, b: Row) => String(a.startDate).localeCompare(String(b.startDate)))
            .map((t: Row) => ({ id: String(t.id), name: String(t.name || ''), startDate: String(t.startDate || ''), endDate: String(t.endDate || '') }))
        : []
      const live = new Set(events.map(e => e.id))
      const people = ws.map((w: Row) => { const roles = workerRoles(w); return { id: String(w.id), name: String(w.name || ''), email: String(w.email || ''), roles, gender: String(w.gender || 'both'), assigned: videosFor(roles), watched: by.get(String(w.id)) || {}, events: (onEvent.get(String(w.id)) || []).filter(t => live.has(t)) } })
      return NextResponse.json({ people, events })
    }
    const tid = req.nextUrl.searchParams.get('tournamentId')
    if (tid) {
      if (gate.role !== 'admin' && gate.role !== 'director') return NextResponse.json({ error: 'Directors only' }, { status: 403 })
      if (gate.role !== 'admin' && gate.orgId && (await tournamentOrgId(tid)) !== gate.orgId) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
      const roster = await prisma.$queryRawUnsafe<Row[]>(`SELECT w.id, w.roles, w.defaultRole, w.isAssigner FROM "RosterEntry" r JOIN "Worker" w ON w.id = r.workerId WHERE r.tournamentId = ?`, tid)
      const ids = roster.map((r: Row) => String(r.id))
      const seen = ids.length
        ? await prisma.$queryRawUnsafe<Row[]>(`SELECT workerKey, videoId FROM "StaffTraining" WHERE workerKey IN (${ids.map(() => '?').join(', ')})`, ...ids)
        : []
      const byWorker = new Map<string, Set<string>>()
      for (const s of seen) { const k = String(s.workerKey); if (!byWorker.has(k)) byWorker.set(k, new Set()); byWorker.get(k)!.add(String(s.videoId)) }
      const counts: Record<string, { watched: number; total: number }> = {}
      for (const w of roster) {
        const want = videosFor(workerRoles(w))
        const got = byWorker.get(String(w.id)) || new Set()
        counts[String(w.id)] = { watched: want.filter(v => got.has(v)).length, total: want.length }
      }
      return NextResponse.json({ counts })
    }
    const who = await me(String(gate.session?.user?.email ?? '').trim().toLowerCase(), gate.userId || '', gate.role)
    const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT videoId, plays FROM "StaffTraining" WHERE workerKey = ?`, who.key)
    return NextResponse.json({ roles: who.roles, watched: rows.map((r: Row) => String(r.videoId)), plays: Object.fromEntries(rows.map((r: Row) => [String(r.videoId), Number(r.plays ?? 1) || 1])) })
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
    const who = await me(String(gate.session?.user?.email ?? '').trim().toLowerCase(), gate.userId || '', gate.role)
    const now = new Date().toISOString()
    // One call per viewing that reaches 85%: the first marks it watched, each one after adds a play.
    await prisma.$executeRawUnsafe(`INSERT INTO "StaffTraining" ("workerKey", "videoId", "watchedAt", "plays", "lastWatchedAt") VALUES (?, ?, ?, 1, ?)
      ON CONFLICT ("workerKey", "videoId") DO UPDATE SET "plays" = "plays" + 1, "lastWatchedAt" = excluded."lastWatchedAt"`, who.key, videoId, now, now)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/training] POST failed:', e)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
}
