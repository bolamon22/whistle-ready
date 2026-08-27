import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

const METHODS = ['check', 'zelle', 'credit_card', 'ach', 'paypal', 'venmo', 'cash', 'other']

// Correct a payment row's method label (e.g. the Aug 27 card-recorded-as-ACH
// mislabel). Amount/notes stay immutable here — those carry the Stripe linkage.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const { method } = await req.json()
    if (!METHODS.includes(method)) return NextResponse.json({ error: 'Bad method' }, { status: 400 })
    const updated = await prisma.registrationPayment.update({ where: { id: params.id }, data: { method } })
    return NextResponse.json({ ok: true, method: updated.method })
  } catch {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Auth (Aug 2026): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  await prisma.registrationPayment.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
