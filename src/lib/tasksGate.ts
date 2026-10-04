import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { requireFeature } from '@/lib/apiAuth'
import { taskScope, type Scope } from '@/lib/tasks'

// Who may use Tasks, and which org's tasks they see. The `tasks` feature in
// role-permissions.json is the switch (director yes, everyone else no; admin
// always), the same one middleware uses for /tasks and /tournaments/*/tasks.
// An admin sees the org they are previewing (the org picker on the
// tournaments page), else their own, else every org's.

export type TasksGate =
  | { ok: true; scope: Scope; orgId: string; by: string }
  | { ok: false; res: NextResponse }

export async function tasksGate(viewOrgId?: string | null): Promise<TasksGate> {
  const gate = await requireFeature('tasks')
  if (!gate.ok) return gate
  let preview: string | null = null
  if (gate.role === 'admin') {
    try { preview = viewOrgId || headers().get('x-preview-org') || cookies().get('preview-org')?.value || null } catch { preview = viewOrgId || null }
  }
  const scope = taskScope(gate.role, gate.orgId, preview)
  if (!scope) return { ok: false, res: NextResponse.json({ error: 'Your login is not part of an organization yet' }, { status: 403 }) }
  const user = (gate.session?.user || {}) as { name?: string; email?: string }
  return { ok: true, scope, orgId: 'orgId' in scope ? scope.orgId : '', by: user.name || user.email || 'Staff' }
}
