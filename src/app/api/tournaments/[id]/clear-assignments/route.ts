import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const { deletedBy, date, category } = await req.json()
  if (!deletedBy) return NextResponse.json({ error: 'deletedBy required' }, { status: 400 })

  const gameWhere: Record<string, unknown> = { tournamentId: params.id }
  if (date) gameWhere.date = date

  // Category-based role/division filtering
  let roleFilter: Record<string, unknown> | undefined
  let divisionFilter: string | undefined

  if (category === 'scorekeepers') {
    roleFilter = { role: 'scorekeeper' }
  } else if (category === 'girls-refs') {
    roleFilter = { role: { in: ['ref1', 'ref2', 'ref3'] } }
    divisionFilter = 'girls'
  } else if (category === 'boys-refs') {
    roleFilter = { role: { in: ['ref1', 'ref2', 'ref3'] } }
    divisionFilter = 'boys'
  }

  // Build where clause
  let where: Record<string, unknown>
  if (category && divisionFilter) {
    // Filter by ref roles + division gender (division name contains 'girls'/'boys')
    const games = await prisma.game.findMany({
      where: {
        tournamentId: params.id,
        ...(date ? { date } : {}),
        division: { contains: divisionFilter, mode: 'insensitive' },
      },
      select: { id: true },
    })
    const gameIds = games.map(g => g.id)
    where = { gameId: { in: gameIds }, ...roleFilter }
  } else if (category && roleFilter) {
    where = { game: gameWhere, ...roleFilter }
  } else {
    where = { game: gameWhere }
  }

  const deleted = await prisma.assignment.deleteMany({ where })

  const categoryLabel = category === 'girls-refs' ? 'Girls Referees'
    : category === 'boys-refs' ? 'Boys Referees'
    : category === 'scorekeepers' ? 'Score Keepers'
    : 'All'

  await prisma.auditLog.create({
    data: {
      tournamentId: params.id,
      action: 'CLEAR_ASSIGNMENTS',
      deletedBy,
      detail: `Cleared ${deleted.count} ${categoryLabel} assignments${date ? ` for date: ${date}` : ''}`,
    }
  })

  return NextResponse.json({ deleted: deleted.count })
}
