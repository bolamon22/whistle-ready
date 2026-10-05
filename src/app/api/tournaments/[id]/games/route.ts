import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff, isStaffRequest } from '@/lib/apiAuth'
import { getPublicVisibility, applyPublicView } from '@/lib/publicView'
import { getIfNeeded, withIfNeeded } from '@/lib/ifNeeded'

// Two audiences, two URLs:
//   ?view=public  -> what the public schedule may show. Never includes staff
//                    assignments, and only what the Publish switches allow
//                    (lib/publicView). Shared-cached (hit on every public page load).
//   (no param)    -> staff get everything, including who is working each game;
//                    anyone else gets the public shape. Never shared-cached, because
//                    the CDN keys on URL only and would hand one audience's copy to
//                    the other.
// Before this, the one cached URL returned every assigned worker's email, phone,
// pay rate and pay handle to anyone holding the schedule link.
export async function GET(req: Request, { params }: { params:{id:string} }) {
  const publicView = new URL(req.url).searchParams.get('view') === 'public'
  const staff = publicView ? false : await isStaffRequest()
  const orderBy = [{ date:'asc' as const },{ startTime:'asc' as const },{ location:'asc' as const }]
  if (staff) {
    const games = await prisma.game.findMany({
      where: { tournamentId: params.id }, orderBy,
      include: { assignments:{ include:{ worker:true } } },
    })
    return NextResponse.json(withIfNeeded(games, await getIfNeeded(params.id)), { headers: { 'Cache-Control': 'private, no-store' } })
  }
  const [games, vis, ifNeeded] = await Promise.all([
    prisma.game.findMany({ where: { tournamentId: params.id }, orderBy }),
    getPublicVisibility(params.id),
    getIfNeeded(params.id),
  ])
  const out = withIfNeeded(applyPublicView(games, vis), ifNeeded).map(g => ({ ...g, assignments: [] as unknown[] }))
  return NextResponse.json(out, {
    headers: { 'Cache-Control': publicView ? 'public, s-maxage=5, stale-while-revalidate=30' : 'private, no-store' },
  })
}

export async function POST(req: Request, { params }: { params:{id:string} }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const b = await req.json()
  const game = await prisma.game.create({ data:{
    tournamentId: params.id,
    gameNumber:   String(b.gameNumber ?? ''),
    date:         String(b.date),
    startTime:    String(b.startTime),
    division:     String(b.division ?? ''),
    pool:         b.pool || null,
    location:     String(b.location ?? ''),
    team1:        String(b.team1 ?? 'TBD'),
    team2:        String(b.team2 ?? 'TBD'),
    refCount:     Number(b.refCount ?? 2),
    isChampionship: Boolean(b.isChampionship),
  }})
  return NextResponse.json(game, { status:201 })
}
