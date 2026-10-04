import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { tasksGate } from '@/lib/tasksGate'
import { addStarterItems, orgForNewTask } from '@/lib/tasks'
import { firstGameDay, templateItem } from '@/lib/taskTemplate'

export const dynamic = 'force-dynamic'

// POST /api/tasks/starter { tournamentId, keys: string[] } -> { added }
// Adds the chosen starter-checklist items to a tournament, due dates counted
// back from its first game day. Items it already has are skipped, so the
// dialog can be used again later to add more.

export async function POST(req: NextRequest) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const tournamentId = typeof b.tournamentId === 'string' ? b.tournamentId : ''
  const keys = Array.isArray(b.keys) ? b.keys.filter((k: unknown): k is string => typeof k === 'string' && !!templateItem(k)) : []
  if (!tournamentId) return NextResponse.json({ error: 'Pick a tournament' }, { status: 400 })
  if (!keys.length) return NextResponse.json({ error: 'Pick at least one item' }, { status: 400 })
  try {
    const orgId = await orgForNewTask(g.scope, tournamentId)
    if (orgId === null) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { startDate: true, dates: true } })
    const added = await addStarterItems({ id: tournamentId, orgId, firstDay: t ? firstGameDay(t) : '' }, keys, g.by)
    return NextResponse.json({ added })
  } catch (e) {
    console.error('[api/tasks/starter] failed:', e)
    return NextResponse.json({ error: 'Could not add the checklist' }, { status: 500 })
  }
}
