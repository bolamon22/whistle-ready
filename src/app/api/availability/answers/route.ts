import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff, eventGate } from '@/lib/apiAuth'
import { fieldDirectorSees, workerJobs } from '@/lib/roleScope'
import { payScopeFor } from '@/lib/payScope'
import { seesPay, workerPayGroups } from '@/lib/payGroups'
import { workerIdForEmail } from '@/lib/staffW9'
import { tournamentOrgId } from '@/lib/org'
import { eventDayList } from '@/lib/eventDays'
import { AvailAnswer, isAvailAnswer, sortTimes, availLocked, dayTitle } from '@/lib/availabilityAnswers'
import { AVAILABILITY_MANAGERS, dayStates, gameSlots, publishedSchedules, reminderLog, saveAnswers } from '@/lib/availability'

// Availability answers (Bo, Oct 14 2026; lib/availabilityAnswers has the why).
//
// GET  ?tournamentId=  the head assigner's Availability page: every day of the event,
//      its game start times with the ref spots they need, and everyone on the staff
//      roster with their answer for each day (a field director: only their
//      scorekeepers, trainers and field ops). canRemind is false for someone outside
//      an assigner's staff groups (lib/payScope), the same rule as sending videos.
// POST { tournamentId, date | dates, answer, times?, workerId? }
//      Staff answer for themselves only: the worker is the one their login email
//      matches, never an id from the browser. The roles that manage staff set anyone's
//      (someone who texted the assigner instead). Either way they must be on the
//      event's staff roster. Saving replaces any older "out" record for those days.

async function sameOrg(gate: { role: string; orgId: string | null }, tournamentId: string): Promise<boolean> {
  if (gate.role === 'admin' || !gate.orgId) return true
  const org = await tournamentOrgId(tournamentId)
  return !org || org === gate.orgId
}

export async function GET(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!AVAILABILITY_MANAGERS.includes(gate.role)) return NextResponse.json({ error: 'Only the people who assign staff see everyone’s answers.' }, { status: 403 })
  const tid = new URL(req.url).searchParams.get('tournamentId') || ''
  if (!tid) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 })
  const refused = eventGate(gate, tid); if (refused) return refused
  const t = await prisma.tournament.findUnique({ where: { id: tid }, select: { id: true, name: true, startDate: true, endDate: true, dates: true, location: true, logoUrl: true } })
  if (!t || !(await sameOrg(gate, tid))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const roster = await prisma.rosterEntry.findMany({ where: { tournamentId: tid }, select: { worker: { select: { id: true, name: true, email: true, roles: true, defaultRole: true, gender: true } } } })
  let people = roster.map(r => r.worker).filter(Boolean)
  if (gate.role === 'field_director') people = people.filter(w => fieldDirectorSees(w))
  const scope = gate.role === 'assigner' ? await payScopeFor(gate.role, gate.userId) : null
  const [slots, states, log, published] = await Promise.all([
    gameSlots(tid), dayStates(tid, people.map(p => p.id)), reminderLog(tid), publishedSchedules([tid]),
  ])
  const remindedAt = new Map<string, string>()
  for (const e of log) for (const id of e.workerIds || []) if (!remindedAt.has(id)) remindedAt.set(id, e.at)

  return NextResponse.json({
    tournament: { id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, location: t.location, logoUrl: t.logoUrl },
    published: published.has(tid),
    days: eventDayList(t, Array.from(slots.keys())).map(d => ({ date: d, times: slots.get(d) || [] })),
    people: people
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
      .map(w => ({
        id: w.id,
        name: w.name,
        jobs: workerJobs(w),
        gender: w.gender || 'both',
        hasEmail: !!String(w.email || '').trim(),
        canRemind: !scope || seesPay(scope, workerPayGroups(w)),
        days: states.get(w.id) || {},
        remindedAt: remindedAt.get(w.id) || '',
      })),
    reminders: log[0] ? { at: log[0].at, by: log[0].by, n: (log[0].workerIds || []).length } : null,
  })
}

export async function POST(req: Request) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const tid = String(b.tournamentId || '')
  if (!tid) return NextResponse.json({ error: 'tournamentId is required' }, { status: 400 })
  const refused = eventGate(gate, tid); if (refused) return refused
  if (!(await sameOrg(gate, tid))) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const manager = AVAILABILITY_MANAGERS.includes(gate.role)
  let workerId = String(b.workerId || '')
  if (!manager) {
    const own = await workerIdForEmail(String(gate.session?.user?.email || ''))
    if (!own) return NextResponse.json({ error: 'Your login isn’t linked to a staff record yet. Contact your coordinator.' }, { status: 403 })
    if (workerId && workerId !== own) return NextResponse.json({ error: 'You can only set your own days' }, { status: 403 })
    workerId = own
  }
  if (!workerId) return NextResponse.json({ error: 'workerId is required' }, { status: 400 })
  const w = await prisma.worker.findUnique({ where: { id: workerId }, select: { id: true, roles: true, defaultRole: true } })
  if (!w) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (gate.role === 'field_director' && !fieldDirectorSees(w)) return NextResponse.json({ error: 'Not one of your staff' }, { status: 403 })
  const onRoster = await prisma.rosterEntry.findUnique({ where: { workerId_tournamentId: { workerId, tournamentId: tid } }, select: { id: true } })
  if (!onRoster) return NextResponse.json({ error: manager ? 'Add them to the staff roster first.' : 'Sign up to work this event first.' }, { status: 400 })

  const answer = String(b.answer || '')
  if (!isAvailAnswer(answer)) return NextResponse.json({ error: 'Pick All day, Morning, Afternoon or Can’t work.' }, { status: 400 })
  const t = await prisma.tournament.findUnique({ where: { id: tid }, select: { startDate: true, endDate: true, dates: true } })
  if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const slots = await gameSlots(tid)
  const days = eventDayList(t, Array.from(slots.keys()))
  const asked = Array.isArray(b.dates) ? b.dates : [b.date]
  const dates = Array.from(new Set(asked.map((d: unknown) => String(d || '').slice(0, 10)).filter(Boolean))) as string[]
  if (!dates.length || dates.some(d => !days.includes(d))) return NextResponse.json({ error: 'That day isn’t part of this event.' }, { status: 400 })
  // 48 hours' notice (lib/availabilityAnswers): staff can't change a day once it locks;
  // the assigner still can, for the emergency that comes in by phone.
  const shut = manager ? [] : dates.filter(d => availLocked(d))
  if (shut.length) return NextResponse.json({ error: `${shut.map(d => dayTitle(d).split(',')[0]).join(' and ')} locked 48 hours before the day. Call or text the assigner to change it.`, locked: shut }, { status: 403 })

  let a: AvailAnswer = answer
  let times: string[] = []
  if (a === 'times') {
    if (dates.length !== 1) return NextResponse.json({ error: 'Pick game times one day at a time.' }, { status: 400 })
    const posted = (slots.get(dates[0]) || []).map(s => s.t)
    times = sortTimes((Array.isArray(b.times) ? b.times : []).map(String).filter((x: string) => posted.includes(x)))
    if (!times.length) return NextResponse.json({ error: 'Pick at least one game time.' }, { status: 400 })
    if (times.length === posted.length) { a = 'all'; times = [] }   // every game is All day
  }

  await saveAnswers({
    workerId, tournamentId: tid, dates, answer: a, times,
    setBy: manager ? (gate.userId || 'manager') : 'self',
    setByName: manager ? String(gate.session?.user?.name || gate.session?.user?.email || '') : '',
  })
  const states = await dayStates(tid, [workerId])
  return NextResponse.json({ ok: true, days: states.get(workerId) || {} })
}
