import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const profile = await prisma.coachProfile.findUnique({ where: { userId: session.user.id } })
  if (!profile) return NextResponse.json({ error: 'No profile' }, { status: 404 })
  return NextResponse.json(profile)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { tournamentId, teamName } = await req.json()
  const profile = await prisma.coachProfile.upsert({
    where: { userId: session.user.id },
    update: { tournamentId, teamName },
    create: { userId: session.user.id, tournamentId, teamName },
  })
  return NextResponse.json(profile)
}
