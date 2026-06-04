import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Find the worker record linked to this user's email
  const worker = await prisma.worker.findFirst({ where: { email: session.user.email ?? '' } })
  if (!worker) return NextResponse.json([])

  const assignments = await prisma.assignment.findMany({
    where: { workerId: worker.id },
    include: { game: true },
    orderBy: [{ game: { date: 'asc' } }, { game: { startTime: 'asc' } }],
  })

  return NextResponse.json(assignments)
}
