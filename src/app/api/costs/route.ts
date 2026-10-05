import { NextRequest, NextResponse } from 'next/server'
import { tasksGate } from '@/lib/tasksGate'
import { scopeTournaments } from '@/lib/tasks'
import { collectContacts } from '@/lib/contacts'
import { collectCosts, createCost, view } from '@/lib/eventCosts'

export const dynamic = 'force-dynamic'

// Event costs (same access as Tasks and Contacts: directors and admins).
// GET  /api/costs?tournamentId=<id>  -> that event's lines, plus every other
//      line from the same vendors or the event's contacts (to compare years)
// GET  /api/costs?contactId=<id>     -> one vendor's lines, every year
// GET  /api/costs                    -> everything
//      Each answer also carries { tournaments: [{ id, name, firstDay }] } for labels.
// POST /api/costs { tournamentId | eventLabel+eventDate, contactId?, vendor?, items?, ... }

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const g = await tasksGate(url.searchParams.get('viewOrgId'))
  if (!g.ok) return g.res
  const tournamentId = url.searchParams.get('tournamentId') || undefined
  const contactId = url.searchParams.get('contactId') || undefined
  try {
    const ts = await scopeTournaments(g.scope)
    if (tournamentId && !ts.some(t => t.id === tournamentId)) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
    const vendorIds = tournamentId ? (await collectContacts(g.scope, { tournamentId })).contacts.map(c => c.id) : undefined
    const costs = await collectCosts(g.scope, { tournamentId, contactId, vendorIds })
    return NextResponse.json({ costs, tournaments: ts.map(t => ({ id: t.id, name: t.name, firstDay: t.firstDay })) })
  } catch (e) {
    console.error('[api/costs] GET failed:', e)
    return NextResponse.json({ error: 'Could not load costs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  try {
    const r = await createCost(g.scope, b, g.by)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ cost: view(r.cost) })
  } catch (e) {
    console.error('[api/costs] POST failed:', e)
    return NextResponse.json({ error: 'Could not add the cost' }, { status: 500 })
  }
}
