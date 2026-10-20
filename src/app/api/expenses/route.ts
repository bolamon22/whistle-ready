import { NextRequest, NextResponse } from 'next/server'
import { orgGate, requireMoney, requireStaff } from '@/lib/apiAuth'
import { buyerFor, isOffice, mayUseEvent, realAdmin, receiptProblem, staffContext } from '@/lib/expenseGate'
import {
  eventInfo, eventPeople, getExpense, insertExpense, line, listEventExpenses, money,
  text, todayET, view, workerById, ymd, type ExpenseFields,
} from '@/lib/eventExpenses'
import { isExpenseCategory, isPaidWith, isPayBackMethod, type PaidWith } from '@/lib/expenseTypes'

export const runtime = 'nodejs'

// Receipts for an event (lib/eventExpenses).
// GET  ?tournamentId=  the office: every receipt of the event, and the people who can
//                      be picked as the buyer (its Staff roster, with how they get paid).
// POST                 a new receipt. The office adds one for anyone, approved unless
//                      it says otherwise; anyone else on staff turns in their own, which
//                      waits for the office's approval.

export async function GET(req: NextRequest) {
  const gate = await requireMoney()
  if (!gate.ok) return gate.res
  const tournamentId = String(req.nextUrl.searchParams.get('tournamentId') || '')
  if (!tournamentId) return NextResponse.json({ error: 'Which event?' }, { status: 400 })
  const refused = await orgGate(gate, tournamentId)
  if (refused) return refused
  const ev = await eventInfo(tournamentId)
  if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const rows = await listEventExpenses(tournamentId)
  const people = await eventPeople(tournamentId, rows.map(r => r.workerId))
  return NextResponse.json({ expenses: rows.map(view), people, today: todayET() })
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* checked below */ }

  const ev = await eventInfo(String(b.tournamentId || ''))
  if (!ev) return NextResponse.json({ error: 'Pick the event this was for.' }, { status: 400 })
  const office = isOffice(gate)
  if (office) {
    const refused = await orgGate(gate, ev.id)
    if (refused) return refused
  }
  const ctx = office ? null : await staffContext(gate)
  if (ctx && !mayUseEvent(gate, ctx, ev)) return NextResponse.json({ error: 'That event is not one of yours.' }, { status: 403 })

  const what = line(b.what, 200)
  const amount = money(b.amount)
  if (!what) return NextResponse.json({ error: 'Say what was bought.' }, { status: 400 })
  if (!amount) return NextResponse.json({ error: 'Enter the total from the receipt.' }, { status: 400 })
  const paidWith: PaidWith = isPaidWith(b.paidWith) ? b.paidWith : 'own'

  // Who bought it: the office names anyone; staff are always themselves.
  let personName = '', workerId = ''
  if (office) {
    personName = line(b.personName, 120)
    if (!personName) return NextResponse.json({ error: 'Say who bought it.' }, { status: 400 })
    const wid = String(b.workerId || '')
    if (wid) {
      const w = await workerById(wid)
      if (!w || (w.orgId && ev.orgId && w.orgId !== ev.orgId)) return NextResponse.json({ error: 'That person is not in this organization’s Staff Pool.' }, { status: 400 })
      workerId = w.id
    }
  } else {
    ;({ personName, workerId } = buyerFor(gate, ctx!, ev))
  }

  const receiptId = String(b.receiptId || '')
  if (receiptId) {
    const bad = await receiptProblem(receiptId, gate.userId, realAdmin(gate))
    if (bad) return NextResponse.json({ error: bad }, { status: 400 })
  }

  const status = office ? (b.status === 'pending' ? 'pending' : 'approved') : 'pending'
  const paid = office && paidWith === 'own' && b.paidBack && typeof b.paidBack === 'object' ? b.paidBack as Record<string, unknown> : null
  const by = office ? String(gate.session?.user?.name || 'The office').slice(0, 120) : personName
  const fields: ExpenseFields = {
    orgId: ev.orgId, tournamentId: ev.id,
    personName, workerId, userId: office ? '' : gate.userId,
    what, vendor: line(b.vendor, 120), amount,
    purchasedOn: ymd(b.purchasedOn) || todayET(),
    category: isExpenseCategory(b.category) ? String(b.category) : 'other',
    paidWith, notes: text(b.notes, 1000),
    status: paid ? 'approved' : status, declineReason: '',
    paidBackOn: paid ? (ymd(paid.on) || todayET()) : '',
    paidBackMethod: paid && isPayBackMethod(paid.method) ? String(paid.method) : '',
    paidBackNote: paid ? line(paid.note, 160) : '',
    receiptId,
  }
  const id = await insertExpense(fields, by, office ? `Added${fields.status === 'approved' ? ' and approved' : ''}${paid ? ', paid back' : ''}` : 'Turned in')
  const row = await getExpense(id)
  return NextResponse.json({ expense: row ? view(row) : null })
}
