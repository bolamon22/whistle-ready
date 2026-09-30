import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { cleanPoolName, poolKey, renamePoolRefs } from '@/lib/pools'

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
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
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
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const body = await req.json()
    const { poolId, teamNames } = body
    const division = decodeURIComponent(params.division)

    // RENAME. Bo, Sep 30 2026: "Sometimes we want to call them north, south."
    // A pool name is a string key, and the scheduler wrote a copy of it onto every
    // game, so this cannot be a bare column update -- see lib/pools.
    if (typeof body.name === 'string') {
      const name = cleanPoolName(body.name)
      if (!name) return NextResponse.json({ error: 'Give the pool a name.' }, { status: 400 })

      const current = await prisma.pool.findUnique({ where: { id: poolId } })
      if (!current || current.tournamentId !== params.id || current.division !== division) {
        return NextResponse.json({ error: 'Pool not found in this division' }, { status: 404 })
      }

      // Two pools called the same thing in one division would be indistinguishable
      // on every screen AND on every game, since games only carry the name.
      const siblings = await prisma.pool.findMany({ where: { tournamentId: params.id, division } })
      if (siblings.some(p => p.id !== poolId && poolKey(p.name) === poolKey(name))) {
        return NextResponse.json({ error: `This division already has a pool called ${name}.` }, { status: 409 })
      }

      if (name === current.name) return NextResponse.json({ ...current, teamNames: JSON.parse(current.teamNames || '[]'), games: 0 })

      const updated = await prisma.pool.update({ where: { id: poolId }, data: { name } })
      // Order matters: the row first, so a failure here leaves the pool renamed and
      // the games findable by the old key, rather than games pointing at a pool
      // name that was never saved.
      const moved = await renamePoolRefs(params.id, division, current.name, name)
      return NextResponse.json({ ...updated, teamNames: JSON.parse(updated.teamNames || '[]'), games: moved.games })
    }

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
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const { poolId } = await req.json()
    await prisma.pool.delete({ where: { id: poolId } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete pool' }, { status: 500 })
  }
}
