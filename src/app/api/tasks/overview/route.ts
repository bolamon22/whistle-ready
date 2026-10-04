import { NextRequest, NextResponse } from 'next/server'
import { tasksGate } from '@/lib/tasksGate'
import { collectTasks } from '@/lib/tasks'
import { TASK_CATEGORIES, byDue, countTasks, type TaskView } from '@/lib/taskTemplate'

export const dynamic = 'force-dynamic'

// GET /api/tasks/overview?tournamentId=<id>&counts=1
// What the dashboards and the nav badges show. counts=1 is the cheap version
// for the badges (no tracked lookups): { today, counts }. Otherwise also the
// next six open tasks, each tournament's progress, and -- for one tournament --
// which categories have the most open and its setup checklist.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const g = await tasksGate(url.searchParams.get('viewOrgId'))
  if (!g.ok) return g.res
  const tid = url.searchParams.get('tournamentId') || undefined
  const countsOnly = url.searchParams.get('counts') === '1'
  try {
    const { tasks, tournaments, today } = await collectTasks(g.scope, { tournamentId: tid, signals: !countsOnly })
    const counts = countTasks(tasks, today)
    if (countsOnly) return NextResponse.json({ today, counts })

    const open = tasks.filter(t => !t.done).sort(byDue)
    const ofT = (id: string) => tasks.filter(t => t.tournamentId === id)
    const realOf = (list: TaskView[]) => list.filter(t => t.kind === 'task')
    const byTournament = tournaments
      .filter(t => (!tid || t.id === tid) && (t.lastDay >= today || realOf(ofT(t.id)).some(x => !x.done)))
      .map(t => {
        const list = ofT(t.id)
        const next = list.filter(x => !x.done).sort(byDue)[0]
        const cl = list.find(x => x.kind === 'checklist')
        return {
          ...t,
          counts: countTasks(list, today),
          hasTasks: realOf(list).length > 0,
          next: next ? { title: next.title, dueDate: next.dueDate } : null,
          checklist: cl ? { ...(cl.progress || { done: 0, total: 0 }), dueDate: cl.dueDate } : null,
        }
      })
    const general = tid ? null : countTasks(tasks.filter(t => !t.tournamentId), today)
    const categories = TASK_CATEGORIES
      .map(c => ({ key: c.key, label: c.label, open: open.filter(t => t.kind === 'task' && t.category === c.key).length }))
      .filter(c => c.open > 0)
      .sort((a, b) => b.open - a.open)
    return NextResponse.json({ today, counts, upNext: open.slice(0, 6), byTournament, general, categories })
  } catch (e) {
    console.error('[api/tasks/overview] failed:', e)
    return NextResponse.json({ error: 'Could not load tasks' }, { status: 500 })
  }
}
