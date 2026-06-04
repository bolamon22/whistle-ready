import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET - fetch club director's linked clubs
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = req.nextUrl.searchParams.get('userId') || session.user.id

  // Only admin can look up other users
  if (userId !== session.user.id && session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const links = await prisma.clubDirectorLink.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(links)
}

// POST - create a link (admin only)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, tournamentId, clubName } = await req.json()
  const link = await prisma.clubDirectorLink.upsert({
    where: { userId_tournamentId_clubName: { userId, tournamentId, clubName } },
    update: {},
    create: { userId, tournamentId, clubName },
  })
  return NextResponse.json(link)
}

// DELETE - remove a link (admin only)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { userId, tournamentId, clubName } = await req.json()
  await prisma.clubDirectorLink.deleteMany({ where: { userId, tournamentId, clubName } })
  return NextResponse.json({ ok: true })
}
