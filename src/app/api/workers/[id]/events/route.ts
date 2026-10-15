import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { fieldDirectorSees } from '@/lib/roleScope'
import { releaseFilter } from '@/lib/staffReleaseStore'

// Which events a Staff Pool person is working, and which they can still be added to,
// for their profile on the Staff Pool and the Staff roster (Bo, Oct 14 2026: "make it so
// this lists which tournaments they're doing ... add someone to a tournament roster from
// this screen. ... I had to go to multiple spots to add someone.")
//
// GET -> { events: [{ id, name, startDate, endDate, games, onRoster }],
//          canAdd: [{ id, name, startDate, endDate }] }
//   events: every event they're on the staff roster for, plus any where they're on games
//   without a roster spot (schedules made before rosters); games = their games there.
//   canAdd: their org's events that haven't ended and that they're not on yet.
// Adding and removing go through the roster route (/api/tournaments/[id]/roster), which
// keeps its own checks. A field director gets only their own events, and only for the
// staff they run (scorekeepers, athletic trainers, field ops).

type Row = Record<string, unknown>
const day = (v: unknown) => String(v ?? '').slice(0, 10)

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const notFound = NextResponse.json({ error: 'Not found' }, { status: 404 })
  const w = (await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM "Worker" WHERE id = ?`, params.id))[0]
  if (!w) return notFound
  if (gate.role !== 'admin' && String(w.orgId || '') !== String(gate.orgId || '')) return notFound
  if (gate.role === 'field_director' && !fieldDirectorSees(w)) return notFound
  const mine = (id: string) => !gate.events || gate.events.includes(id)

  const [roster, slots] = await Promise.all([
    prisma.$queryRawUnsafe<Row[]>(`SELECT t.id AS id, t.name AS name, t.startDate AS startDate, t.endDate AS endDate
      FROM "RosterEntry" r JOIN "Tournament" t ON t.id = r.tournamentId WHERE r.workerId = ?`, params.id),
    prisma.$queryRawUnsafe<Row[]>(`SELECT t.id AS id, t.name AS name, t.startDate AS startDate, t.endDate AS endDate, a.role AS role, g.division AS division
      FROM "Assignment" a JOIN "Game" g ON g.id = a.gameId JOIN "Tournament" t ON t.id = g.tournamentId
      WHERE a.workerId = ?`, params.id),
  ])
  // Per-event game counts, leaving out crews the assigner hasn't shown to staff yet
  // when a ref or scorekeeper is asking (lib/staffRelease).
  const visible = await releaseFilter(gate.role, slots.map(s => String(s.id)))
  const games: Row[] = []
  const counted = new Map<string, Row>()
  for (const s of slots) {
    if (!visible(String(s.id), String(s.role || ''), String(s.division || ''))) continue
    const e = counted.get(String(s.id))
    if (e) e.n = Number(e.n) + 1
    else { const row: Row = { id: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, n: 1 }; counted.set(String(s.id), row); games.push(row) }
  }
  const byId = new Map<string, { id: string; name: string; startDate: string; endDate: string; games: number; onRoster: boolean }>()
  for (const r of roster) byId.set(String(r.id), { id: String(r.id), name: String(r.name || ''), startDate: day(r.startDate), endDate: day(r.endDate), games: 0, onRoster: true })
  for (const g of games) {
    const id = String(g.id), n = Number(g.n) || 0
    const e = byId.get(id)
    if (e) e.games = n
    else byId.set(id, { id, name: String(g.name || ''), startDate: day(g.startDate), endDate: day(g.endDate), games: n, onRoster: false })
  }
  const events = Array.from(byId.values()).filter(e => mine(e.id)).sort((a, b) => a.startDate.localeCompare(b.startDate))

  // Events in their org that haven't ended yet (Eastern time, like every event date).
  const orgId = String(w.orgId || gate.orgId || '')
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const onRoster = new Set(events.filter(e => e.onRoster).map(e => e.id))
  const open = orgId
    ? await prisma.$queryRawUnsafe<Row[]>(`SELECT id, name, startDate, endDate FROM "Tournament" WHERE orgId = ?`, orgId).catch(() => [] as Row[])
    : []
  const canAdd = open
    .map(t => ({ id: String(t.id), name: String(t.name || ''), startDate: day(t.startDate), endDate: day(t.endDate) }))
    .filter(t => (t.endDate || t.startDate || '9999') >= today && !onRoster.has(t.id) && mine(t.id))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
  return NextResponse.json({ events, canAdd })
}
