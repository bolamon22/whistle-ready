import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { gameGender } from '@/lib/gameGender'

// Clear a day's assignments by kind (girls' refs, boys' refs, scorekeepers) and,
// optionally, by field (Bo, Oct 12 2026: "maybe we can do by field").
//
// The kinds used to be ignored: the dialog's tick boxes never reached here, so
// ticking only "Girls Referees" cleared every assignment that day. And the
// division match used Prisma's case-insensitive mode, which this database doesn't
// support. Kinds are now required, and games are sorted boys / girls / both by
// lib/gameGender (a coed game's refs go with either refs kind).
const KINDS = ['girls-refs', 'boys-refs', 'scorekeepers'] as const
type Kind = typeof KINDS[number]
const REF_ROLES = new Set(['ref1', 'ref2', 'ref3'])
const LABEL: Record<Kind, string> = { 'girls-refs': "girls' refs", 'boys-refs': "boys' refs", scorekeepers: 'scorekeepers' }

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const body = await req.json().catch(() => ({}))
  const deletedBy = String(body.deletedBy ?? '').trim()
  const date = typeof body.date === 'string' ? body.date : ''
  // `category` is the old single-kind field; still accepted.
  const raw: unknown[] = Array.isArray(body.kinds) ? body.kinds : body.category ? [body.category] : []
  const kinds = new Set(raw.filter((k): k is Kind => (KINDS as readonly string[]).includes(String(k))))
  const fields: string[] = Array.isArray(body.fields) ? body.fields.filter((f: unknown) => typeof f === 'string') : []
  if (!deletedBy) return NextResponse.json({ error: 'Your name is required for the audit log' }, { status: 400 })
  if (!date) return NextResponse.json({ error: 'Pick a day' }, { status: 400 })
  if (kinds.size === 0) return NextResponse.json({ error: 'Pick what to clear' }, { status: 400 })

  const games = await prisma.game.findMany({
    where: { tournamentId: params.id, date, ...(fields.length ? { location: { in: fields } } : {}) },
    select: { id: true, division: true, assignments: { select: { id: true, role: true } } },
  })
  const ids: string[] = []
  for (const g of games) {
    const gg = gameGender(g.division)
    for (const a of g.assignments) {
      const hit = a.role === 'scorekeeper'
        ? kinds.has('scorekeepers')
        : REF_ROLES.has(a.role) && (gg === 'girls' ? kinds.has('girls-refs') : gg === 'boys' ? kinds.has('boys-refs') : kinds.has('girls-refs') || kinds.has('boys-refs'))
      if (hit) ids.push(a.id)
    }
  }
  const deleted = ids.length ? await prisma.assignment.deleteMany({ where: { id: { in: ids } } }) : { count: 0 }

  const what = KINDS.filter(k => kinds.has(k)).map(k => LABEL[k]).join(', ')
  const where = fields.length ? ` on ${fields.map(f => f.split(' - ').pop() || f).join(', ')}` : ''
  await prisma.auditLog.create({
    data: {
      tournamentId: params.id,
      action: 'CLEAR_ASSIGNMENTS',
      deletedBy,
      detail: `Cleared ${deleted.count} assignments (${what})${where} for ${date}`,
    },
  })

  return NextResponse.json({ deleted: deleted.count })
}
