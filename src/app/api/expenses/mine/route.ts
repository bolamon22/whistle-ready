import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { planOffFor } from '@/lib/orgPlanStore'
import { realAdmin, staffContext } from '@/lib/expenseGate'
import { eventsOfOrgs, listMine, pickableEvents, rosterEvents, todayET, view } from '@/lib/eventExpenses'

export const runtime = 'nodejs'

// The receipt card on a staff home (components/expenses/StaffReceipts): the events
// this person can turn a receipt in for, and their own receipts with where each
// stands. Organizations with Event money switched off in their plan (lib/orgPlans)
// get no receipts, the same as their Financials page.

export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const ctx = await staffContext(gate)
  const orgs: string[] = []
  for (const o of Array.from(ctx.orgs)) if (realAdmin(gate) || !(await planOffFor(o)).includes('money')) orgs.push(o)
  const today = todayET()
  const working = await rosterEvents(ctx.workers.map(w => w.id))
  let events = pickableEvents(await eventsOfOrgs(orgs), working, today)
  if (gate.events) events = events.filter(e => gate.events!.includes(e.id))   // a field director: their events
  const mine = (await listMine(gate.userId, ctx.workers.map(w => w.id))).filter(e => !e.orgId || orgs.includes(e.orgId) || realAdmin(gate))
  return NextResponse.json({
    canAdd: events.length > 0,
    me: { name: ctx.workers[0]?.name || String(gate.session?.user?.name || '') },
    events,
    expenses: mine.map(view),
    today,
  })
}
