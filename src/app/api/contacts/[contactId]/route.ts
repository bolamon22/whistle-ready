import { NextRequest, NextResponse } from 'next/server'
import { tasksGate } from '@/lib/tasksGate'
import { inScope, scopeTournaments } from '@/lib/tasks'
import { getContact, updateContact, deleteContact, view } from '@/lib/contacts'

export const dynamic = 'force-dynamic'

// PATCH  /api/contacts/:id { any contact field }
// DELETE /api/contacts/:id  (soft: a task pointing at it keeps showing the name)

async function load(id: string) {
  const g = await tasksGate()
  if (!g.ok) return { res: g.res }
  const contact = await getContact(id)
  if (!contact || !inScope(g.scope, contact.orgId)) return { res: NextResponse.json({ error: 'Contact not found' }, { status: 404 }) }
  return { g, contact }
}

export async function PATCH(req: NextRequest, { params }: { params: { contactId: string } }) {
  try {
    const l = await load(params.contactId)
    if ('res' in l) return l.res
    const b = await req.json().catch(() => ({} as Record<string, unknown>))
    // Event tags must be the contact's own org's tournaments.
    const ts = await scopeTournaments(l.g.scope)
    const eventIds = new Set(ts.filter(t => !l.contact.orgId || t.orgId === l.contact.orgId).map(t => t.id))
    const c = await updateContact(l.contact.id, b, eventIds)
    if (!c) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    return NextResponse.json({ contact: view(c) })
  } catch (e) {
    console.error('[api/contacts] PATCH failed:', e)
    return NextResponse.json({ error: 'Could not save the contact' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { contactId: string } }) {
  try {
    const l = await load(params.contactId)
    if ('res' in l) return l.res
    await deleteContact(l.contact.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/contacts] DELETE failed:', e)
    return NextResponse.json({ error: 'Could not delete the contact' }, { status: 500 })
  }
}
