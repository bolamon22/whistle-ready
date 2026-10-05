import { NextRequest, NextResponse } from 'next/server'
import { tasksGate } from '@/lib/tasksGate'
import { scopeTournaments } from '@/lib/tasks'
import { collectContacts, createContact, view } from '@/lib/contacts'

export const dynamic = 'force-dynamic'

// Event contacts (same access as Tasks: directors and admins).
// GET  /api/contacts?tournamentId=<id>  -> { contacts, tournaments, today }
//      no tournamentId = the whole directory; with one = contacts tagged with
//      that event plus every-event contacts. Each carries its open tasks.
// POST /api/contacts { name, role?, company?, category?, phone?, email?, ... }

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const g = await tasksGate(url.searchParams.get('viewOrgId'))
  if (!g.ok) return g.res
  const tid = url.searchParams.get('tournamentId') || undefined
  try {
    const data = await collectContacts(g.scope, { tournamentId: tid })
    if (tid && !data.tournaments.some(t => t.id === tid)) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (e) {
    console.error('[api/contacts] GET failed:', e)
    return NextResponse.json({ error: 'Could not load contacts' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  try {
    const ts = await scopeTournaments(g.scope)
    const eventIds = new Set(ts.filter(t => !g.orgId || t.orgId === g.orgId).map(t => t.id))
    const c = await createContact(g.orgId, b, eventIds, g.by)
    if (!c) return NextResponse.json({ error: 'A contact needs a name' }, { status: 400 })
    return NextResponse.json({ contact: { ...view(c), openTasks: [] } })
  } catch (e) {
    console.error('[api/contacts] POST failed:', e)
    return NextResponse.json({ error: 'Could not add the contact' }, { status: 500 })
  }
}
