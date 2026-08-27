import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  // Auth (Aug 2026): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  await prisma.registrationPayment.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
