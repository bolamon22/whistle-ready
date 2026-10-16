import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff, eventGate } from '@/lib/apiAuth'
import { fieldDirectorSees } from '@/lib/roleScope'
import { rosterWorkerIds } from '@/lib/fieldDirector'
import { tournamentOrgId } from '@/lib/org'
import { TRAINING_VIDEOS, videosFor, workerRoles } from '@/lib/training'
import { payScopeFor } from '@/lib/payScope'
import { seesPay, workerPayGroups } from '@/lib/payGroups'
import { trainingEmailsTo } from '@/lib/trainingSends'
import { planOffFor } from '@/lib/orgPlanStore'

// Staff training videos: which ones a person has watched.
//
// GET                  -> { roles, watched: [videoId], plays: {videoId: n}, planOff } for the signed-in staff member
// GET ?report=1        -> { people: [...] } every Staff Pool person with plays per video (Video library)
// GET ?tournamentId=   -> { counts: { workerId: { watched, total } } } for that event's
//                         roster (directors, admins, field directors, and an assigner for
//                         their own staff groups), shown on the Staff roster
// GET ?workerId=       -> { roles, assigned, watched, lastSent, hasEmail, email, sends } for
//                         one person's profile on the Staff Pool and the Staff roster
//                         (same people); sends = every training email to them (lib/trainingSends)
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

// What each person should watch follows their organization's plan (lib/training
// videoOnPlan): an Assigner-plan organization's people aren't counted against, or shown,
// videos about pages their plan doesn't have (Bo, Oct 16 2026). One read per organization.
function plans() {
  const seen = new Map<string, Promise<string[]>>()
  return (orgId: unknown): Promise<string[]> => {
    const k = String(orgId || '')
    if (!k) return Promise.resolve([])
    if (!seen.has(k)) seen.set(k, planOffFor(k).catch(() => []))
    return seen.get(k)!
  }
}

async function me(email: string, userId: string, loginRole = '') {
  const rows = email ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, roles, defaultRole, isAssigner, orgId FROM "Worker" WHERE lower(email) = ? ORDER BY createdAt ASC LIMIT 1`, email) : []
  const w = rows[0]
  const roles = w ? workerRoles(w) : []
  if (loginRole === 'assigner' && !roles.includes('assigner')) roles.push('assigner')
  // Schedulers are a login role, not a Staff Pool job, so their videos follow the login.
  if (loginRole === 'scheduler' && !roles.includes('scheduler')) roles.push('scheduler')
  return { key: w ? String(w.id) : `user:${userId}`, roles, orgId: w?.orgId ? String(w.orgId) : null }
}

type Watched = Record<string, { plays: number; first: string; last: string }>
/** What each of these Staff Pool people has watched, per video: plays, first and last
 *  time. Views saved while a login had no Staff Pool record with the same email are kept
 *  under user:<id>; they're folded into the person whose email matches that login now,
 *  so nobody's watching goes missing (Bo, Oct 13 2026). The report, the roster's Training
 *  column and a person's profile all count from here, so they can't disagree.
 *  A person with two records under one email counts the views of both: a login's views
 *  are saved under its oldest record (me()), so the newer duplicate showed 0 of 13
 *  watched while she'd watched 5 (Haylee Lamon, Oct 15 2026). */
async function watchedBy(ws: Row[]): Promise<Map<string, Watched>> {
  const em = (v: unknown) => String(v || '').trim().toLowerCase()
  const ids = new Set(ws.map((w: Row) => String(w.id)))
  const forEmail = new Map<string, string[]>()          // email -> these people with it
  for (const w of ws) { const e = em(w.email); if (e) forEmail.set(e, [...(forEmail.get(e) || []), String(w.id)]) }
  const emailOf = new Map<string, string>(ws.map((w: Row) => [String(w.id), em(w.email)]))
  // Other records with the same emails (a duplicate that isn't in this list).
  const emails = Array.from(forEmail.keys())
  for (let i = 0; i < emails.length; i += 400) {
    const part = emails.slice(i, i + 400)
    const twins = await prisma.$queryRawUnsafe<Row[]>(`SELECT id, lower(email) AS email FROM "Worker" WHERE lower(email) IN (${part.map(() => '?').join(', ')})`, ...part)
    for (const t of twins) if (!emailOf.has(String(t.id))) emailOf.set(String(t.id), em(t.email))
  }
  const keys = Array.from(emailOf.keys())
  const seen: Row[] = []
  for (let i = 0; i < keys.length; i += 400) {
    const part = keys.slice(i, i + 400)
    seen.push(...await prisma.$queryRawUnsafe<Row[]>(`SELECT workerKey, videoId, watchedAt, plays, lastWatchedAt FROM "StaffTraining" WHERE workerKey IN (${part.map(() => '?').join(', ')})`, ...part))
  }
  if (forEmail.size) {
    const orphan = await prisma.$queryRawUnsafe<Row[]>(`SELECT s.workerKey, s.videoId, s.watchedAt, s.plays, s.lastWatchedAt, lower(u.email) AS email FROM "StaffTraining" s JOIN "User" u ON s.workerKey = 'user:' || u.id`).catch(() => [] as Row[])
    for (const r of orphan) if (forEmail.has(em(r.email))) seen.push({ ...r, workerKey: '', email: em(r.email) })
  }
  const by = new Map<string, Watched>()
  for (const r of seen) {
    // Everyone here with the view's email gets it; a record with no email keeps its own.
    const e = r.workerKey ? emailOf.get(String(r.workerKey)) || '' : String(r.email || '')
    const to = e ? forEmail.get(e) || [] : ids.has(String(r.workerKey)) ? [String(r.workerKey)] : []
    const v = { plays: Number(r.plays ?? 1) || 1, first: String(r.watchedAt || ''), last: String(r.lastWatchedAt || r.watchedAt || '') }
    for (const k of to) {
      const m = by.get(k) || {}
      const o = m[String(r.videoId)]
      m[String(r.videoId)] = o ? { plays: o.plays + v.plays, first: o.first < v.first ? o.first : v.first, last: o.last > v.last ? o.last : v.last } : v
      by.set(k, m)
    }
  }
  return by
}

export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  try {
    await ensureTable()
    // The Video library's "Who's watched": every Staff Pool person, what they should
    // watch, and per video how many times and when (directors and admins).
    if (req.nextUrl.searchParams.get('report')) {
      // An assigner sees only the staff groups they run (boys refs, girls refs, ...); a
      // field director the scorekeepers, athletic trainers and field ops on their events.
      const director = gate.role === 'admin' || gate.role === 'director'
      const fd = gate.role === 'field_director'
      if (!director && gate.role !== 'assigner' && !fd) return NextResponse.json({ error: 'Directors, assigners and field directors only' }, { status: 403 })
      const scope = director || fd ? null : await payScopeFor(gate.role, gate.userId)
      // An admin also sees the records with no organization (api/training/send).
      let ws = gate.orgId
        ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner, gender, orgId FROM "Worker" WHERE orgId = ?${gate.role === 'admin' ? ` OR orgId IS NULL OR orgId = ''` : ''} ORDER BY name`, gate.orgId)
        : await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, email, roles, defaultRole, isAssigner, gender, orgId FROM "Worker" ORDER BY name`)
      if (scope) ws = ws.filter((w: Row) => seesPay(scope, workerPayGroups(w as any)))
      if (fd) {
        const on = gate.events ? await rosterWorkerIds(gate.events) : null
        ws = ws.filter((w: Row) => fieldDirectorSees(w) && (!on || on.has(String(w.id))))
      }
      const ids = ws.map((w: Row) => String(w.id))
      const by = await watchedBy(ws)
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
            .filter((t: Row) => String(t.endDate || t.startDate || '9999') >= cutoff && (!gate.events || gate.events.includes(String(t.id))))
            .sort((a: Row, b: Row) => String(a.startDate).localeCompare(String(b.startDate)))
            .map((t: Row) => ({ id: String(t.id), name: String(t.name || ''), startDate: String(t.startDate || ''), endDate: String(t.endDate || '') }))
        : []
      const live = new Set(events.map(e => e.id))
      const planOf = plans()
      const offs = new Map<string, string[]>()
      for (const o of Array.from(new Set(ws.map((w: Row) => String(w.orgId || ''))))) offs.set(o, await planOf(o))
      const people = ws.map((w: Row) => { const roles = workerRoles(w); return { id: String(w.id), name: String(w.name || ''), email: String(w.email || ''), roles, gender: String(w.gender || 'both'), assigned: videosFor(roles, offs.get(String(w.orgId || ''))), watched: by.get(String(w.id)) || {}, events: (onEvent.get(String(w.id)) || []).filter(t => live.has(t)) } })
      return NextResponse.json({ people, events })
    }
    // One person, for their profile on the Staff Pool and the Staff roster: what they
    // should watch, what they've watched, and when they were last sent videos (Bo, Oct 14
    // 2026: "send them the staff videos from their user and ... let me know if they
    // watched them"). The same people the report shows this viewer.
    const wid = req.nextUrl.searchParams.get('workerId')
    if (wid) {
      const director = gate.role === 'admin' || gate.role === 'director'
      const fd = gate.role === 'field_director'
      if (!director && gate.role !== 'assigner' && !fd) return NextResponse.json({ error: 'Directors, assigners and field directors only' }, { status: 403 })
      const notFound = NextResponse.json({ error: 'Not found' }, { status: 404 })
      const w = (await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM "Worker" WHERE id = ?`, wid))[0]
      if (!w || (gate.role !== 'admin' && gate.orgId && String(w.orgId || '') !== gate.orgId)) return notFound
      if (gate.role === 'assigner' && !seesPay(await payScopeFor(gate.role, gate.userId), workerPayGroups(w as any))) return notFound
      if (fd && (!fieldDirectorSees(w) || (gate.events && !(await rosterWorkerIds(gate.events)).has(wid)))) return notFound
      const roles = workerRoles(w)
      const email = String(w.email || '').trim().toLowerCase()
      // Every training email to them, failures included (lib/trainingSends, kept from Oct
      // 15 2026). Others than directors see only their own sends, as in the library's
      // Sent tab. Sends from before then are only in the library's log, which still
      // gives the last one.
      const sends = email ? await trainingEmailsTo(email, director ? undefined : gate.userId || '-').catch(() => []) : []
      const newest = sends.find(x => x.ok)
      let lastSent: { at: string; by: string } | null = newest ? { at: newest.at, by: newest.by } : null
      if (email && !lastSent) {
        try {
          const log = JSON.parse((await prisma.appSetting.findUnique({ where: { key: 'trainingSends' } }))?.value || '[]')
          const hit = (Array.isArray(log) ? log : []).find((e: any) => (director || (e?.byUserId && e.byUserId === gate.userId))
            && Array.isArray(e?.to) && e.to.some((t: any) => String(t?.email || '').trim().toLowerCase() === email))
          if (hit) lastSent = { at: String(hit.at || ''), by: String(hit.by || '') }
        } catch { /* no log yet */ }
      }
      return NextResponse.json({ roles, assigned: videosFor(roles, await planOffFor(w.orgId as string | null).catch(() => [])), watched: (await watchedBy([w])).get(wid) || {}, lastSent, hasEmail: !!email, email, sends })
    }
    const tid = req.nextUrl.searchParams.get('tournamentId')
    if (tid) {
      const fd = gate.role === 'field_director'
      if (gate.role !== 'admin' && gate.role !== 'director' && !fd && gate.role !== 'assigner') return NextResponse.json({ error: 'Directors, assigners and field directors only' }, { status: 403 })
      const refused = eventGate(gate, tid); if (refused) return refused
      const eventOrg = await tournamentOrgId(tid)
      if (gate.role !== 'admin' && gate.orgId && eventOrg !== gate.orgId) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
      const off = await planOffFor(eventOrg).catch(() => [])
      const all = await prisma.$queryRawUnsafe<Row[]>(`SELECT w.id, w.email, w.roles, w.defaultRole, w.isAssigner, w.gender FROM "RosterEntry" r JOIN "Worker" w ON w.id = r.workerId WHERE r.tournamentId = ?`, tid)
      // An assigner sees the staff groups they run (lib/payGroups), as in the report.
      const scope = gate.role === 'assigner' ? await payScopeFor(gate.role, gate.userId) : null
      const roster = fd ? all.filter((w: Row) => fieldDirectorSees(w)) : scope ? all.filter((w: Row) => seesPay(scope, workerPayGroups(w as any))) : all
      const by = await watchedBy(roster)
      const counts: Record<string, { watched: number; total: number }> = {}
      for (const w of roster) {
        const want = videosFor(workerRoles(w), off)
        const got = by.get(String(w.id)) || {}
        counts[String(w.id)] = { watched: want.filter(v => got[v]).length, total: want.length }
      }
      return NextResponse.json({ counts })
    }
    const who = await me(String(gate.session?.user?.email ?? '').trim().toLowerCase(), gate.userId || '', gate.role)
    const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT videoId, plays FROM "StaffTraining" WHERE workerKey = ?`, who.key)
    // planOff: their organization's plan, for the Training page and the ref page to show
    // only its videos. An admin's View as gets the viewed organization's.
    const planOff = await planOffFor(gate.viewing ? gate.orgId : (who.orgId || gate.orgId)).catch(() => [])
    return NextResponse.json({ roles: who.roles, watched: rows.map((r: Row) => String(r.videoId)), plays: Object.fromEntries(rows.map((r: Row) => [String(r.videoId), Number(r.plays ?? 1) || 1])), planOff })
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
