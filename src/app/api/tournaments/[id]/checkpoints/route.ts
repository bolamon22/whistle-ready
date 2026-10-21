import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { orgGate, requireFeature } from '@/lib/apiAuth'
import { currentGames, getCheckpoint, listCheckpoints, saveCheckpoint } from '@/lib/assignCheckpoint'
import { diffCheckpoint, touchesOfficials } from '@/lib/checkpointDiff'

export const runtime = 'nodejs'

// Checkpoints of who was on each game (lib/assignCheckpoint; Bo, Oct 21 2026). Whoever
// can open the Assigner board (director, assigner, scheduler, admin), this organization's
// events only.
// GET           -> { checkpoints: [{ id, at, by, reason, games }], latest: { id, at, affected } | null }
//                  affected: games with officials that moved, changed teams, were canceled
//                  or removed since the newest checkpoint (the board's banner).
// GET ?cp=      -> { checkpoint (with data), current, diff }
//                  Not ?id=: Next.js on Vercel strips any query key named like a route
//                  segment ([id]) before the handler sees it, so ?id= arrived empty and the
//                  list came back instead (Oct 21 2026, the Checkpoints page crashed).
// POST          -> saves one now ("Save a checkpoint") -> its meta
async function gate(id: string) {
  const g = await requireFeature('tournament_schedule'); if (!g.ok) return { res: g.res }
  const away = await orgGate(g, id); if (away) return { res: away }
  const t = await prisma.tournament.findUnique({ where: { id }, select: { id: true } })
  if (!t) return { res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { g }
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const a = await gate(params.id); if ('res' in a) return a.res
  const cid = new URL(req.url).searchParams.get('cp')
  if (cid) {
    const [cp, current] = await Promise.all([getCheckpoint(prisma, params.id, cid), currentGames(prisma, params.id)])
    if (!cp) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ checkpoint: cp, current, diff: diffCheckpoint(cp.data, current) }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const checkpoints = await listCheckpoints(prisma, params.id)
  let latest = null
  if (checkpoints[0]) {
    const [cp, current] = await Promise.all([getCheckpoint(prisma, params.id, checkpoints[0].id), currentGames(prisma, params.id)])
    latest = cp ? { id: cp.id, at: cp.at, affected: diffCheckpoint(cp.data, current).filter(touchesOfficials).length } : null
  }
  return NextResponse.json({ checkpoints, latest }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const a = await gate(params.id); if ('res' in a) return a.res
  const by = String(a.g.session?.user?.name || a.g.session?.user?.email || '')
  return NextResponse.json(await saveCheckpoint(prisma, params.id, 'manual', by), { status: 201 })
}
