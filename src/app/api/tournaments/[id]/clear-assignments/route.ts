import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { deletedBy, date } = await req.json()
  if (!deletedBy) return NextResponse.json({ error: 'deletedBy required' }, { status: 400 })

  const where = date
    ? { game: { tournamentId: params.id, date } }
    : { game: { tournamentId: params.id } }

  const deleted = await prisma.assignment.deleteMany({ where })

  await prisma.auditLog.create({
    data: {
      tournamentId: params.id,
      action: 'CLEAR_ASSIGNMENTS',
      deletedBy,
      detail: date ? `Cleared ${deleted.count} assignments for date: ${date}` : `Cleared all ${deleted.count} assignments`,
    }
  })

  return NextResponse.json({ deleted: deleted.count })
}
