import { NextRequest, NextResponse } from 'next/server'
import { orgGate, requireMoney } from '@/lib/apiAuth'
import { getExpense, line, todayET, updateExpense, ymd } from '@/lib/eventExpenses'
import { isPayBackMethod, payBackLabel } from '@/lib/expenseTypes'

export const runtime = 'nodejs'

// Pay someone back for several receipts at once (one Zelle for all of Jamie's):
// POST { ids, method, on, note } marks each approved-or-waiting receipt paid with
// their own money as paid back. The office only. Anything else is skipped and said.

export async function POST(req: NextRequest) {
  const gate = await requireMoney()
  if (!gate.ok) return gate.res
  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* checked below */ }
  const ids = Array.isArray(b.ids) ? Array.from(new Set(b.ids.map(String).filter(Boolean))).slice(0, 100) : []
  if (!ids.length) return NextResponse.json({ error: 'Pick the receipts.' }, { status: 400 })
  const method = isPayBackMethod(b.method) ? String(b.method) : ''
  if (!method) return NextResponse.json({ error: 'Pick how you paid them back.' }, { status: 400 })
  const on = ymd(b.on) || todayET()
  const note = line(b.note, 160)
  const by = String(gate.session?.user?.name || 'The office').slice(0, 120)
  const when = new Date(on + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

  const allowed = new Map<string, boolean>()
  const done: string[] = [], skipped: string[] = []
  for (const id of ids) {
    const e = await getExpense(id)
    if (!e || e.deletedAt) { skipped.push(id); continue }
    if (!allowed.has(e.tournamentId)) allowed.set(e.tournamentId, !(await orgGate(gate, e.tournamentId)))
    if (!allowed.get(e.tournamentId) || e.paidWith !== 'own' || e.status === 'declined' || e.paidBackOn) { skipped.push(id); continue }
    const log = e.status !== 'approved' ? ['Approved'] : []
    log.push(`Paid back by ${payBackLabel(method)} on ${when}${note ? ` (${note})` : ''}`)
    await updateExpense(e.id, { status: 'approved', paidBackOn: on, paidBackMethod: method, paidBackNote: note }, by, log)
    done.push(id)
  }
  return NextResponse.json({ done, skipped })
}
