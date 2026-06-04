import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const transactions = await prisma.tournamentTransaction.findMany({
    where: { tournamentId: params.id },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json(transactions)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { type, category, description, amount, method, date, notes } = await req.json()
  const tx = await prisma.tournamentTransaction.create({
    data: {
      tournamentId: params.id,
      type, category, description,
      amount: Number(amount),
      method: method || 'check',
      date,
      notes: notes || '',
    },
  })
  return NextResponse.json(tx, { status: 201 })
}
