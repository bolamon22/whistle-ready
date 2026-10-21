import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireDirector } from '@/lib/apiAuth'
import { assigningFeesMany, feePaymentsMany, feeStatus, feeTotal } from '@/lib/assigningFee'
import { eventClientOf } from '@/lib/eventClient'
import { orgEventIds } from '@/lib/form1099Store'
import { orgPaidStaffMany } from '@/lib/officialsPayer'

export const runtime = 'nodejs'

// What tournament directors owe across the head assigner's events (Bo, Oct 21 2026):
// his assigning fee plus staff pay his organization paid for them (lib/officialsPayer),
// less what they've paid him. The caller's own organization only. Events with nothing
// owed and no payments are left out. GET -> { events: [{ id, name, startDate, endDate,
// td, fee, fronted, total, paid, due, state }], totals: { total, paid, due } }
export async function GET() {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const ids = gate.orgId ? await orgEventIds(gate.orgId) : []
  const [fees, pays, fronted] = await Promise.all([assigningFeesMany(ids), feePaymentsMany(ids), orgPaidStaffMany(ids)])
  const withFee = ids.filter(id => fees[id].amount > 0 || pays[id].length > 0 || fronted[id] > 0)
  const [events, staffed, tds] = await Promise.all([
    withFee.length ? prisma.tournament.findMany({ where: { id: { in: withFee } }, select: { id: true, name: true, startDate: true, endDate: true } }) : Promise.resolve([]),
    withFee.length ? prisma.game.groupBy({ by: ['tournamentId'], where: { tournamentId: { in: withFee }, isCanceled: false, assignments: { some: {} } }, _count: { _all: true } }) : Promise.resolve([]),
    Promise.all(withFee.map(id => eventClientOf(id).then(c => [id, c?.name || ''] as const))),
  ])
  const games = new Map(staffed.map(s => [s.tournamentId, s._count._all]))
  const td = new Map(tds)
  const list = events.map(t => {
    const fee = feeTotal(fees[t.id], games.get(t.id) || 0)
    const total = Math.round((fee + fronted[t.id]) * 100) / 100
    return { id: t.id, name: t.name, startDate: t.startDate, endDate: t.endDate, td: td.get(t.id) || '', fee, fronted: fronted[t.id], total, ...feeStatus(total, pays[t.id]) }
  }).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
  const r2 = (n: number) => Math.round(n * 100) / 100
  const totals = { total: r2(list.reduce((s, e) => s + e.total, 0)), paid: r2(list.reduce((s, e) => s + e.paid, 0)), due: r2(list.reduce((s, e) => s + e.due, 0)) }
  return NextResponse.json({ events: list, totals }, { headers: { 'Cache-Control': 'no-store' } })
}
