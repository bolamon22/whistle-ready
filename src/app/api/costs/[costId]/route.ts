import { NextRequest, NextResponse } from 'next/server'
import { tasksGate } from '@/lib/tasksGate'
import { deleteCost, updateCost, view } from '@/lib/eventCosts'

export const dynamic = 'force-dynamic'

// PATCH  /api/costs/<id> { any cost field }  -> { cost }
//        status 'paid' on a tournament line adds (or updates) its Financials expense;
//        any other status removes it.
// DELETE /api/costs/<id>                     -> removes the line and its expense

export async function PATCH(req: NextRequest, { params }: { params: { costId: string } }) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  const b = await req.json().catch(() => ({} as Record<string, unknown>))
  try {
    const r = await updateCost(g.scope, params.costId, b)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.error === 'Not found' ? 404 : 400 })
    return NextResponse.json({ cost: view(r.cost) })
  } catch (e) {
    console.error('[api/costs] PATCH failed:', e)
    return NextResponse.json({ error: 'Could not save the cost' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { costId: string } }) {
  const g = await tasksGate()
  if (!g.ok) return g.res
  try {
    const ok = await deleteCost(g.scope, params.costId)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[api/costs] DELETE failed:', e)
    return NextResponse.json({ error: 'Could not delete the cost' }, { status: 500 })
  }
}
