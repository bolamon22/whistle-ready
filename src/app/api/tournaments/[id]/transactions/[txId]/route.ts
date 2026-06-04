import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function DELETE(_: Request, { params }: { params: { id: string; txId: string } }) {
  await prisma.tournamentTransaction.delete({ where: { id: params.txId } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: Request, { params }: { params: { id: string; txId: string } }) {
  const data = await req.json()
  const tx = await prisma.tournamentTransaction.update({
    where: { id: params.txId },
    data: {
      ...(data.type        !== undefined && { type: data.type }),
      ...(data.category    !== undefined && { category: data.category }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.amount      !== undefined && { amount: Number(data.amount) }),
      ...(data.method      !== undefined && { method: data.method }),
      ...(data.date        !== undefined && { date: data.date }),
      ...(data.notes       !== undefined && { notes: data.notes }),
    },
  })
  return NextResponse.json(tx)
}
