import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { registrationId, amount, method, checkNumber, receivedAt, notes } = body
  if (!registrationId || !amount || !receivedAt) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  const payment = await prisma.registrationPayment.create({
    data: {
      registrationId,
      amount: Number(amount),
      method: method || 'check',
      checkNumber: checkNumber || '',
      receivedAt,
      notes: notes || '',
    },
  })
  return NextResponse.json(payment, { status: 201 })
}
