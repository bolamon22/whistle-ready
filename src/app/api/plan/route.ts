import { NextRequest, NextResponse } from 'next/server'
import { tasksGate } from '@/lib/tasksGate'
import { scopeTournaments } from '@/lib/tasks'
import { cleanPlan, getPlan, savePlan } from '@/lib/eventPlan'

export const dynamic = 'force-dynamic'

// The Budget tab's plan lines for one event (same access as Costs: directors and admins).
// GET /api/plan?tournamentId=<id>        -> { lines }
// PUT /api/plan { tournamentId, lines }  -> { lines }   (replaces the event's lines)

async function eventFor(g: Extract<Awaited<ReturnType<typeof tasksGate>>, { ok: true }>, id: string) {
  return (await scopeTournaments(g.scope)).find(t => t.id === id) || null
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const g = await tasksGate(url.searchParams.get('viewOrgId'))
  if (!g.ok) return g.res
  const tid = url.searchParams.get('tournamentId') || ''
  try {
    if (!(await eventFor(g, tid))) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    return NextResponse.json({ lines: await getPlan(tid) })
  } catch (e) {
    console.error('[api/plan] GET failed:', e)
    return NextResponse.json({ error: 'Could not load the budget' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const tid = String(b.tournamentId || '')
  try {
    const t = await eventFor(g, tid)
    if (!t) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    return NextResponse.json({ lines: await savePlan(t.orgId || g.orgId, tid, cleanPlan(b.lines)) })
  } catch (e) {
    console.error('[api/plan] PUT failed:', e)
    return NextResponse.json({ error: 'Could not save the budget' }, { status: 500 })
  }
}
