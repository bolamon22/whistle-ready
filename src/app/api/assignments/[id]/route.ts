import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGate, requireStaff } from '@/lib/apiAuth'
import { actorOf, sendOfficialChanges, spotOf } from '@/lib/officialChangeAlerts'
// Staff only: this deleted any assignment for anyone who asked. And only at events of
// the organization this login works in (lib/orgScope).
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const a = await prisma.assignment.findUnique({ where: { id: params.id }, select: { workerId: true, role: true, game: true } })
  if (a) { const away = await orgGate(gate, a.game.tournamentId); if (away) return away }
  await prisma.assignment.delete({where:{id:params.id}})
  // A published official taken off a game is told (lib/officialChangeAlerts).
  if (a) await sendOfficialChanges(a.game.tournamentId, [{ kind: 'removed', workerId: a.workerId, role: a.role, spot: spotOf(a.game) }], actorOf(gate))
  return NextResponse.json({ok:true})
}
