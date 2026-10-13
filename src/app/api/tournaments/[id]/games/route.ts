import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { requireStaff, isStaffRequest, viewer } from '@/lib/apiAuth'
import { redactWorker, redactWorkerPay } from '@/lib/roleScope'
import { assignmentPayGroups, seesPay } from '@/lib/payGroups'
import { payScopeFor } from '@/lib/payScope'
import { getPublicVisibility, applyPublicView } from '@/lib/publicView'
import { getIfNeeded, withIfNeeded, bracketMeta } from '@/lib/ifNeeded'
import { refsLookup } from '@/lib/refRules'
import { syncBracketPlaceholders } from '@/lib/bracketPlaceholders'

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
    // Heal bracket placeholders written with a flight's own numbering (lib/bracketPlaceholders).
    await syncBracketPlaceholders(params.id)
    const rows = await prisma.game.findMany({
      where: { tournamentId: params.id }, orderBy,
      include: { assignments:{ include:{ worker:true } } },
    })
    // Pay on each slot only for those who see it (Oct 13 2026): none for the
    // scheduler or Whistle Ready staff, an assigner's own pay groups, all of it for
    // the director. This list used to hand every rate and payout handle to any staff.
    const who = await viewer()
    const scope = await payScopeFor(who.role, who.userId)
    const games = rows.map(g => scope.all ? g : ({
      ...g,
      assignments: g.assignments.map(a => ({
        ...a,
        payRate: seesPay(scope, assignmentPayGroups(a.role, g.division, a.worker?.gender)) ? a.payRate : null,
        // A field director also gets the email and phone of their own staff only, not refs'.
        worker: who.role === 'field_director' ? redactWorker(a.worker, who.role, scope) : redactWorkerPay(a.worker, who.role, scope),
      })),
    }))
    const [ids, meta] = await Promise.all([getIfNeeded(params.id), bracketMeta(params.id)])
    return NextResponse.json(withIfNeeded(games, ids, meta), { headers: { 'Cache-Control': 'private, no-store' } })
  }
  const [games, vis, ifNeeded, meta] = await Promise.all([
    prisma.game.findMany({ where: { tournamentId: params.id }, orderBy }),
    getPublicVisibility(params.id),
    getIfNeeded(params.id),
    bracketMeta(params.id),
  ])
  const out = withIfNeeded(applyPublicView(games, vis), ifNeeded, meta).map(g => ({ ...g, assignments: [] as unknown[] }))
  return NextResponse.json(out, {
    headers: { 'Cache-Control': publicView ? 'public, s-maxage=5, stale-while-revalidate=30' : 'private, no-store' },
  })
}

export async function POST(req: Request, { params }: { params:{id:string} }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  // Assigners staff games; adding or importing them is the scheduler's job (Bo, Oct 13 2026).
  if (gate.role === 'assigner') return NextResponse.json({ error: 'Assigners can’t add or import games.' }, { status: 403 })
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
    refCount:     b.refCount !== undefined ? Number(b.refCount) : (await refsLookup(params.id))(String(b.division ?? ''), Boolean(b.isChampionship)),
    isChampionship: Boolean(b.isChampionship),
  }})
  return NextResponse.json(game, { status:201 })
}
