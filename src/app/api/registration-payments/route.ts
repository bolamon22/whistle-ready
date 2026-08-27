import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

export async function POST(req: NextRequest) {
  // Auth (Aug 2026): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
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
