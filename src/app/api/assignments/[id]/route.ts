import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
// Staff only: this deleted any assignment for anyone who asked.
export async function DELETE(_: Request, { params }: { params:{id:string} }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  await prisma.assignment.delete({where:{id:params.id}}); return NextResponse.json({ok:true})
}
