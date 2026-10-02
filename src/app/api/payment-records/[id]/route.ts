import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaffPay } from '@/lib/apiAuth'
// Staff pay records: these had no sign-in check at all (anyone could read, add or
// delete what each official was paid).
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const gate = await requireStaffPay(); if (!gate.ok) return gate.res
  await prisma.paymentRecord.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
