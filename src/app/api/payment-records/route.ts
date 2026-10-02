import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaffPay } from '@/lib/apiAuth'
// Staff pay records: these had no sign-in check at all (anyone could read, add or
// delete what each official was paid).

export async function GET(req: Request) {
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  const { searchParams } = new URL(req.url)
  const workerId = searchParams.get('workerId')
  const tournamentId = searchParams.get('tournamentId')
  const where: Record<string, string> = {}
  if (workerId) where.workerId = workerId
  if (tournamentId) where.tournamentId = tournamentId
  const records = await prisma.paymentRecord.findMany({
    where,
    include: { tournament: { select: { id: true, name: true, startDate: true } }, worker: { select: { id: true, name: true } } },
    orderBy: { paidAt: 'desc' },
  })
  return NextResponse.json(records)
}

export async function POST(req: Request) {
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  const { workerId, tournamentId, amount, method, notes, paidBy } = await req.json()
  const record = await prisma.paymentRecord.create({
    data: { workerId, tournamentId, amount, method: method ?? 'check', notes, paidBy },
    include: { tournament: { select: { id: true, name: true, startDate: true } } },
  })
  return NextResponse.json(record, { status: 201 })
}
