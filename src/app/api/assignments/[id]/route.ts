import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGate, requireStaff } from '@/lib/apiAuth'
// Staff only: this deleted any assignment for anyone who asked. And only at events of
// the organization this login works in (lib/orgScope).
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const a = await prisma.assignment.findUnique({ where: { id: params.id }, select: { game: { select: { tournamentId: true } } } })
  if (a) { const away = await orgGate(gate, a.game.tournamentId); if (away) return away }
  await prisma.assignment.delete({where:{id:params.id}}); return NextResponse.json({ok:true})
}
