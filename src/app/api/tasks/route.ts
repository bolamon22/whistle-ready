import { NextRequest, NextResponse } from 'next/server'
import { tasksGate } from '@/lib/tasksGate'
import { collectTasks, createTask, orgForNewTask, view } from '@/lib/tasks'

export const dynamic = 'force-dynamic'

// GET  /api/tasks?tournamentId=<id>|general  -> { tasks, tournaments, today }
//      (no tournamentId = every task in scope). Tracked tasks come back with
//      what the app can see ("4 clubs unpaid"), and the ones it can prove are
//      finished are checked off here, once.
// POST /api/tasks { tournamentId?, title, category?, dueDate?, notes?, steps? }

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const g = await tasksGate(url.searchParams.get('viewOrgId'))
  if (!g.ok) return g.res
  const tid = url.searchParams.get('tournamentId')
  const only = tid === 'general' ? '' : tid || undefined
  try {
    const data = await collectTasks(g.scope, { tournamentId: only, signals: true })
    if (only && !data.tournaments.some(t => t.id === only)) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (e) {
    console.error('[api/tasks] GET failed:', e)
    return NextResponse.json({ error: 'Could not load tasks' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  const tournamentId = typeof b.tournamentId === 'string' ? b.tournamentId : ''
  try {
    const orgId = await orgForNewTask(g.scope, tournamentId)
    if (orgId === null) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    const task = await createTask({
      orgId, tournamentId, title: String(b.title ?? ''), category: b.category, dueDate: b.dueDate,
      notes: b.notes, steps: b.steps, createdBy: g.by,
    })
    if (!task) return NextResponse.json({ error: 'A task needs a title' }, { status: 400 })
    return NextResponse.json({ task: view(task) })
  } catch (e) {
    console.error('[api/tasks] POST failed:', e)
    return NextResponse.json({ error: 'Could not add the task' }, { status: 500 })
  }
}
