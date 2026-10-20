import { NextRequest, NextResponse } from 'next/server'
import { orgGate, requireStaff } from '@/lib/apiAuth'
import { buyerFor, isOffice, mayUseEvent, realAdmin, receiptProblem, staffContext } from '@/lib/expenseGate'
import {
  deleteExpense, eventInfo, getExpense, line, money, text, todayET, updateExpense, view, workerById, ymd, type ExpenseFields,
} from '@/lib/eventExpenses'
import { isExpenseCategory, isPaidWith, isPayBackMethod, paidWithLabel, payBackLabel } from '@/lib/expenseTypes'

export const runtime = 'nodejs'

// One receipt (lib/eventExpenses).
// PATCH   the office changes anything, and settles it with `action`: approve,
//         decline (with a reason), reopen, paidBack (method, on, note) or unpay.
//         The person who turned it in changes their own details until the office
//         approves or refuses it.
// DELETE  the office, or the person who turned it in while it waits. Never once it is
//         marked paid back: that money left the business, so undo that first.

type Ctx = { params: { id: string } }
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })
const no = (error: string, status = 400) => NextResponse.json({ error }, { status })
const day = (ymdStr: string) => new Date(ymdStr + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const usd = (n: number) => '$' + n.toFixed(2)

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const e = await getExpense(params.id)
  if (!e || e.deletedAt) return notFound()
  const office = isOffice(gate)
  if (office) {
    const refused = await orgGate(gate, e.tournamentId)
    if (refused) return refused
  } else if (!e.userId || e.userId !== gate.userId) return notFound()

  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* nothing to change */ }
  if (!office && e.status !== 'pending') {
    return no(e.status === 'approved' ? 'The office approved this one, so it can’t be changed here. Ask them to fix it.' : 'This one wasn’t approved. Turn in a new one, or ask the office.', 409)
  }
  const by = office ? String(gate.session?.user?.name || 'The office').slice(0, 120) : e.personName
  const set: Partial<ExpenseFields> = {}
  const log: string[] = []

  if ('what' in b) { const v = line(b.what, 200); if (!v) return no('Say what was bought.'); if (v !== e.what) set.what = v }
  if ('vendor' in b) { const v = line(b.vendor, 120); if (v !== e.vendor) set.vendor = v }
  if ('amount' in b) {
    const v = money(b.amount)
    if (!v) return no('Enter the total from the receipt.')
    if (v !== e.amount) { set.amount = v; log.push(`Amount changed from ${usd(e.amount)} to ${usd(v)}`) }
  }
  if ('purchasedOn' in b) { const v = ymd(b.purchasedOn); if (!v) return no('Pick the day it was bought.'); if (v !== e.purchasedOn) set.purchasedOn = v }
  if ('category' in b && isExpenseCategory(b.category) && b.category !== e.category) set.category = String(b.category)
  if ('paidWith' in b && isPaidWith(b.paidWith) && b.paidWith !== e.paidWith) {
    if (e.paidBackOn) return no('It’s marked paid back. Undo that first.', 409)
    set.paidWith = b.paidWith
    log.push(`Paid with changed to ${paidWithLabel(b.paidWith).toLowerCase()}`)
  }
  if ('notes' in b) { const v = text(b.notes, 1000); if (v !== e.notes) set.notes = v }
  if ('receiptId' in b) {
    const rid = String(b.receiptId || '')
    if (rid !== e.receiptId) {
      if (rid) { const bad = await receiptProblem(rid, gate.userId, realAdmin(gate), e.id); if (bad) return no(bad) }
      set.receiptId = rid
      log.push(rid ? (e.receiptId ? 'Receipt replaced' : 'Receipt added') : 'Receipt removed')
    }
  }
  if ('tournamentId' in b && String(b.tournamentId || '') !== e.tournamentId) {
    const ev = await eventInfo(String(b.tournamentId || ''))
    if (!ev) return no('Pick the event this was for.')
    if (office) {
      const refused = await orgGate(gate, ev.id)
      if (refused) return refused
    } else {
      const ctx = await staffContext(gate)
      if (!mayUseEvent(gate, ctx, ev)) return no('That event is not one of yours.', 403)
      Object.assign(set, buyerFor(gate, ctx, ev))
    }
    set.tournamentId = ev.id; set.orgId = ev.orgId
    log.push(`Moved to ${ev.name}`)
  }

  if (office) {
    if ('personName' in b) {
      const v = line(b.personName, 120)
      if (!v) return no('Say who bought it.')
      if (v !== e.personName) { set.personName = v; log.push(`Buyer changed to ${v}`) }
    }
    if ('workerId' in b) {
      const wid = String(b.workerId || '')
      if (wid !== e.workerId) {
        if (wid) {
          const w = await workerById(wid)
          if (!w || (w.orgId && e.orgId && w.orgId !== e.orgId)) return no('That person is not in this organization’s Staff Pool.')
        }
        set.workerId = wid
      }
    }
    const action = String(b.action || '')
    const paidWith = set.paidWith ?? e.paidWith
    if (action === 'approve') {
      if (e.status !== 'approved') { set.status = 'approved'; set.declineReason = ''; log.push('Approved') }
    } else if (action === 'decline') {
      if (e.paidBackOn) return no('It’s marked paid back. Undo that first.', 409)
      const reason = line(b.reason, 200)
      set.status = 'declined'; set.declineReason = reason
      log.push(reason ? `Not approved: ${reason}` : 'Not approved')
    } else if (action === 'reopen') {
      if (e.paidBackOn) return no('It’s marked paid back. Undo that first.', 409)
      if (e.status !== 'pending') { set.status = 'pending'; set.declineReason = ''; log.push('Back to waiting for approval') }
    } else if (action === 'paidBack') {
      if (paidWith !== 'own') return no('Only a receipt paid with their own money gets paid back.', 409)
      if (e.status === 'declined') return no('This one wasn’t approved.', 409)
      const method = isPayBackMethod(b.method) ? String(b.method) : ''
      if (!method) return no('Pick how you paid them back.')
      const on = ymd(b.on) || todayET()
      if (e.status !== 'approved') log.push('Approved')
      set.status = 'approved'; set.paidBackOn = on; set.paidBackMethod = method; set.paidBackNote = line(b.note, 160)
      log.push(`Paid back by ${payBackLabel(method)} on ${day(on)}${set.paidBackNote ? ` (${set.paidBackNote})` : ''}`)
    } else if (action === 'unpay') {
      if (e.paidBackOn) { set.paidBackOn = ''; set.paidBackMethod = ''; set.paidBackNote = ''; log.push('Paid back undone') }
    } else if (action) return no('Unknown action')
  }

  if (!Object.keys(set).length) return NextResponse.json({ expense: view(e) })
  await updateExpense(e.id, set, by, log)
  const fresh = await getExpense(e.id)
  return NextResponse.json({ expense: fresh ? view(fresh) : null })
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const e = await getExpense(params.id)
  if (!e || e.deletedAt) return notFound()
  const office = isOffice(gate)
  if (office) {
    const refused = await orgGate(gate, e.tournamentId)
    if (refused) return refused
  } else {
    if (!e.userId || e.userId !== gate.userId) return notFound()
    if (e.status !== 'pending') return no('The office has this one now. Ask them to remove it.', 409)
  }
  if (e.paidBackOn) return no('It’s marked paid back. Undo that first.', 409)
  await deleteExpense(e.id, office ? String(gate.session?.user?.name || 'The office').slice(0, 120) : e.personName)
  return NextResponse.json({ ok: true })
}
