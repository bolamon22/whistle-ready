import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { canSeeRefLevel, workerJobs } from '@/lib/roleScope'
import { payScopeFor } from '@/lib/payScope'
import { seesPay, workerPayGroups } from '@/lib/payGroups'
import { refLevelsFor } from '@/lib/refLevelDb'
import { eventToday } from '@/lib/availabilityAnswers'
import { answersFor, officialSlots, readAsk, saveAnswer, stateOf, upcoming } from '@/lib/officialConfirm'

// Officials' confirmations for one event (lib/officialConfirm has the why): the
// Confirmations page and the marks on the Assigner board.
//
// GET   the ask (confirm-by date, who asked), each official's answers (games
//       confirmed, waiting, changed since they confirmed, and the games they can't
//       work with the reason and whether the slot has been filled), and per slot:
//       `slots` ('yes' | 'changed' | 'waiting' for whoever holds it) and
//       `openDeclines` (slots still open after someone said no).
// POST  { action: 'confirm', workerId }  the official confirmed another way (a call
//       or a text): marks their games from today on as confirmed, by this user.
// Directors, admins and assigners, the people who send Notify officials.

const ROLES = ['admin', 'director', 'assigner']
type Gate = { role: string; orgId: string | null; userId: string; session: any }

async function sameOrg(gate: Gate, tournamentId: string): Promise<boolean> {
  if (gate.role === 'admin' || !gate.orgId) return true
  const org = await tournamentOrgId(tournamentId)
  return !org || org === gate.orgId
}

type Event = { id: string; name: string; logoUrl: string; startDate: string; endDate: string; location: string }
const EVENT = { id: true, name: true, logoUrl: true, startDate: true, endDate: true, location: true } as const

async function board(event: Event, gate: Gate) {
  const tournamentId = event.id
  const today = eventToday()
  const [ask, allSlots, answers, notice] = await Promise.all([
    readAsk(tournamentId), officialSlots(tournamentId), answersFor(tournamentId),
    prisma.appSetting.findUnique({ where: { key: `officialNotice:${tournamentId}` } }).catch(() => null),
  ])
  let sent: Record<string, { sentAt?: string }> = {}
  try { sent = notice?.value ? JSON.parse(notice.value) || {} : {} } catch { /* none sent */ }

  const slots: Record<string, string> = {}
  const holder = new Map<string, string>()
  for (const s of allSlots) { slots[`${s.gameId}|${s.role}`] = stateOf(s, answers); holder.set(`${s.gameId}|${s.role}`, s.workerName) }

  type Decline = { gameId: string; role: string; num: string; date: string; time: string; field: string; teams: string; note: string; at: string; filledBy: string | null }
  type Person = { id: string; name: string; games: number; yes: number; waiting: number; changed: number; changedGames: { num: string; date: string; time: string; field: string }[]; declined: Decline[]; answeredAt: string; askedAt: string }
  const people = new Map<string, Person>()
  const person = (id: string, name: string) => {
    let p = people.get(id)
    if (!p) { p = { id, name, games: 0, yes: 0, waiting: 0, changed: 0, changedGames: [], declined: [], answeredAt: '', askedAt: String(sent[id]?.sentAt || '') }; people.set(id, p) }
    return p
  }
  for (const s of upcoming(allSlots, today)) {
    const p = person(s.workerId, s.workerName)
    p.games++
    const st = stateOf(s, answers)
    if (st === 'yes') p.yes++
    else if (st === 'changed') { p.changed++; p.changedGames.push({ num: s.num, date: s.date, time: s.time, field: s.field }) }
    else p.waiting++
  }
  for (const a of Array.from(answers.values())) {
    const p = people.get(a.workerId)
    if (p && a.at > p.answeredAt) p.answeredAt = a.at
  }

  // The games people said no to and aren't back on.
  const held = new Set(allSlots.map(s => `${s.gameId}|${s.role}|${s.workerId}`))
  const nos = Array.from(answers.values()).filter(a => a.answer === 'no' && !held.has(`${a.gameId}|${a.role}|${a.workerId}`))
  const openDeclines: Record<string, { name: string; note: string }> = {}
  if (nos.length) {
    const [games, workers] = await Promise.all([
      prisma.game.findMany({ where: { id: { in: Array.from(new Set(nos.map(a => a.gameId))) }, isCanceled: false }, select: { id: true, date: true, startTime: true, location: true, gameNumber: true, team1: true, team2: true } }),
      prisma.worker.findMany({ where: { id: { in: Array.from(new Set(nos.map(a => a.workerId))) } }, select: { id: true, name: true } }),
    ])
    const g = new Map(games.map(x => [x.id, x])), wName = new Map(workers.map(x => [x.id, x.name]))
    for (const a of nos) {
      const game = g.get(a.gameId), name = wName.get(a.workerId)
      if (!game || !name || game.date < today) continue
      const filledBy = holder.get(`${a.gameId}|${a.role}`) ?? null
      const p = person(a.workerId, name)
      p.declined.push({ gameId: a.gameId, role: a.role, num: game.gameNumber, date: game.date, time: game.startTime, field: game.location, teams: `${game.team1} vs ${game.team2}`, note: a.note, at: a.at, filledBy })
      if (a.at > p.answeredAt) p.answeredAt = a.at
      if (filledBy === null) openDeclines[`${a.gameId}|${a.role}`] = { name, note: a.note }
    }
  }

  // Jobs, email and (for those who see them) ref levels.
  const ids = Array.from(people.keys())
  const [workers, levels, scope] = await Promise.all([
    ids.length ? prisma.worker.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, roles: true, defaultRole: true, gender: true } }) : Promise.resolve([]),
    canSeeRefLevel(gate.role) ? refLevelsFor(ids).catch(() => new Map<string, number>()) : Promise.resolve(new Map<string, number>()),
    gate.role === 'assigner' ? payScopeFor(gate.role, gate.userId) : Promise.resolve(null),
  ])
  const info = new Map(workers.map(w => [w.id, w]))
  const list = Array.from(people.values()).map(p => {
    const w = info.get(p.id)
    const jobs = w ? workerJobs(w) : []
    return {
      ...p, jobs, hasEmail: !!String(w?.email || '').trim(),
      level: jobs.includes('ref') && w && (!scope || seesPay(scope, workerPayGroups(w))) ? levels.get(p.id) ?? null : null,
      declined: p.declined.sort((x, y) => x.date !== y.date ? (x.date < y.date ? -1 : 1) : x.time.localeCompare(y.time)),
    }
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  const withGames = list.filter(p => p.games > 0)
  return {
    event,
    ask,
    deadlinePassed: !!ask?.confirmBy && today > ask.confirmBy,
    totals: {
      officials: withGames.length,
      confirmed: withGames.filter(p => p.yes === p.games).length,
      waiting: list.filter(p => p.waiting > 0).length,
      changed: list.filter(p => p.changed > 0).length,
      declinedGames: list.reduce((n, p) => n + p.declined.length, 0),
      declinedPeople: list.filter(p => p.declined.length > 0).length,
      openDeclines: Object.keys(openDeclines).length,
    },
    people: list,
    slots,
    openDeclines,
  }
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!ROLES.includes(gate.role)) return NextResponse.json({ error: 'Only assigners and directors see confirmations.' }, { status: 403 })
  const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: EVENT })
  if (!t || !(await sameOrg(gate, params.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(await board(t, gate))
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!ROLES.includes(gate.role)) return NextResponse.json({ error: 'Only assigners and directors can do that.' }, { status: 403 })
  const t = await prisma.tournament.findUnique({ where: { id: params.id }, select: EVENT })
  if (!t || !(await sameOrg(gate, params.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const workerId = String(b.workerId || '')
  if (b.action !== 'confirm' || !workerId) return NextResponse.json({ error: 'Pick who confirmed.' }, { status: 400 })
  const mine = upcoming(await officialSlots(params.id, workerId))
  if (!mine.length) return NextResponse.json({ error: 'They have no games at this event.' }, { status: 400 })
  const answers = await answersFor(params.id, workerId)
  const by = String(gate.session?.user?.name || 'the assigner').slice(0, 80)
  let n = 0
  for (const s of mine) {
    if (stateOf(s, answers) === 'yes') continue
    await saveAnswer(params.id, { gameId: s.gameId, role: s.role, workerId, answer: 'yes', sig: s.sig, note: '', by })
    n++
  }
  return NextResponse.json({ ok: true, marked: n, ...(await board(t, gate)) })
}
