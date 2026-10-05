import { NextRequest, NextResponse } from 'next/server'
import { tasksGate } from '@/lib/tasksGate'
import { getTask, updateTask, deleteTask, inScope, view } from '@/lib/tasks'
import { contactInScope } from '@/lib/contacts'

export const dynamic = 'force-dynamic'

// PATCH  /api/tasks/:id { title?, category?, dueDate?, notes?, steps?, done?, contactId? }
// DELETE /api/tasks/:id
// The setup checklist row (id "setup:<tournamentId>") is not a task: its items
// are saved by /api/tournaments/[id]/checklists, which staff use too.

async function load(id: string) {
  const g = await tasksGate()
  if (!g.ok) return { res: g.res }
  if (id.startsWith('setup:')) return { res: NextResponse.json({ error: 'Check off setup items on the checklist itself' }, { status: 400 }) }
  const task = await getTask(id)
  if (!task || !inScope(g.scope, task.orgId)) return { res: NextResponse.json({ error: 'Task not found' }, { status: 404 }) }
  return { g, task }
}

export async function PATCH(req: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const l = await load(params.taskId)
    if ('res' in l) return l.res
    const b = await req.json().catch(() => ({} as Record<string, unknown>))
    // Linking a contact: only one this login can see ('' unlinks).
    let contactId: string | undefined
    if (typeof b.contactId === 'string') {
      if (b.contactId && !(await contactInScope(l.g.scope, b.contactId))) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
      contactId = b.contactId
    }
    const task = await updateTask(l.task.id, {
      title: b.title, category: b.category, dueDate: b.dueDate, notes: b.notes, steps: b.steps,
      done: b.done === undefined ? undefined : !!b.done, contactId,
    }, l.g.by)
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    return NextResponse.json({ task: view(task) })
  } catch (e) {
    console.error('[api/tasks] PATCH failed:', e)
    return NextResponse.json({ error: 'Could not save the task' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const l = await load(params.taskId)
    if ('res' in l) return l.res
    await deleteTask(l.task.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/tasks] DELETE failed:', e)
    return NextResponse.json({ error: 'Could not delete the task' }, { status: 500 })
  }
}
