import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string; division: string } }) {
  try {
    const pools = await prisma.pool.findMany({
      where: { tournamentId: params.id, division: decodeURIComponent(params.division) },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(pools.map(p => ({ ...p, teamNames: JSON.parse(p.teamNames || '[]') })))
  } catch {
    return NextResponse.json({ error: 'Pool table not yet migrated. Run: node migrate-pools.js' }, { status: 503 })
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  try {
    const { name } = await req.json()
    const pool = await prisma.pool.create({
      data: { tournamentId: params.id, division: decodeURIComponent(params.division), name, teamNames: '[]' },
    })
    return NextResponse.json({ ...pool, teamNames: [] }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create pool. Run: node migrate-pools.js' }, { status: 503 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  try {
    const { poolId, teamNames } = await req.json()
    const pool = await prisma.pool.update({
      where: { id: poolId },
      data: { teamNames: JSON.stringify(teamNames) },
    })
    return NextResponse.json({ ...pool, teamNames: JSON.parse(pool.teamNames) })
  } catch {
    return NextResponse.json({ error: 'Failed to update pool' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  try {
    const { poolId } = await req.json()
    await prisma.pool.delete({ where: { id: poolId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete pool' }, { status: 500 })
  }
}
