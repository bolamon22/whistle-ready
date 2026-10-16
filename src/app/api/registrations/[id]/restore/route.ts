import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { orgGateRegistration, requireStaff } from '@/lib/apiAuth'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const away = await orgGateRegistration(gate, params.id); if (away) return away
  const registration = await prisma.teamRegistration.update({
    where: { id: params.id },
    data: { deletedAt: null },
  })
  return NextResponse.json(registration)
}
