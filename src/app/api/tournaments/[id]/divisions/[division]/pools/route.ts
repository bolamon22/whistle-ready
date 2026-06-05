import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET all pools for a division
export async function GET(_req: NextRequest, { params }: { params: { id: string; division: string } }) {
  const pools = await prisma.pool.findMany({
    where: { tournamentId: params.id, division: decodeURIComponent(params.division) },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(pools.map(p => ({ ...p, teamNames: JSON.parse(p.teamNames || '[]') })))
}

// POST — create a pool
export async function POST(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  const { name } = await req.json()
  const pool = await prisma.pool.create({
    data: { tournamentId: params.id, division: decodeURIComponent(params.division), name, teamNames: '[]' },
  })
  return NextResponse.json({ ...pool, teamNames: [] }, { status: 201 })
}

// PATCH — update teams in a pool
export async function PATCH(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  const { poolId, teamNames } = await req.json()
  const pool = await prisma.pool.update({
    where: { id: poolId },
    data: { teamNames: JSON.stringify(teamNames) },
  })
  return NextResponse.json({ ...pool, teamNames: JSON.parse(pool.teamNames) })
}

// DELETE — remove a pool
export async function DELETE(req: NextRequest, { params }: { params: { id: string; division: string } }) {
  const { poolId } = await req.json()
  await prisma.pool.delete({ where: { id: poolId } })
  return NextResponse.json({ ok: true })
}
