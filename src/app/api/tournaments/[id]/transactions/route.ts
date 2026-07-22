import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireDirector } from '@/lib/apiAuth'

// Financials are director-only (the tournament_financials permission), so both reading
// and writing transactions require the director. Previously neither was gated.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
  const transactions = await prisma.tournamentTransaction.findMany({
    where: { tournamentId: params.id },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json(transactions)
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireDirector(); if (!gate.ok) return gate.res
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
