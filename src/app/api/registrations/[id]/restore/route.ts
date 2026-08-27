import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const registration = await prisma.teamRegistration.update({
    where: { id: params.id },
    data: { deletedAt: null },
  })
  return NextResponse.json(registration)
}
