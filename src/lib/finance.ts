// One tournament's money, worked out once for the Financials page: what was
// billed and collected, what we owe and have paid, and the projected P&L.
//
// Pure -- no database import -- so the page computes it in the browser and the
// tests run it on plain objects.
//
// Bo, Oct 5 2026, on the old page: Total Expenses mixed two rules (staff counted
// when owed, the tent vendor only when paid), so profit read too high. Here
// every cost counts once it is COMMITTED (a quote booked, a staff schedule),
// next to what has actually been PAID; profit uses committed, cash uses paid.

import { costTotal, lastOrder, paidSoFar, round2, type CostPayment, type CostView } from '@/lib/costTypes'

export type FinReg = { id: string; clubName: string; invoiceAmount: number; discountAmount: number; paymentMethod?: string; teams?: unknown[]; payments?: { amount: number }[] }
export type FinIndividual = { feeTierAmount: number; paymentStatus: string }
export type FinVendor = { id: string; status?: string; amountDue?: number; paymentStatus?: string; data?: { companyName?: string } }
export type FinStaff = { worker: { id: string; name: string; payMethod?: string | null }; games?: { role?: string; pay?: number }[]; timeEntries?: unknown[]; totalPay: number }
export type FinTx = { id: string; type: 'income' | 'expense'; category: string; description: string; amount: number; method: string; date: string; notes: string }
export type FinDoc = { id: string; name: string; category: string; size?: number }

/** Budget-only lines (income, and the staff plan) kept per event. `planned` null = not planned yet. */
export type PlanLine = { kind: 'income' | 'cost'; key: string; name: string; planned: number | null }

/** Words of a name, for spotting the same club or person entered twice. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter(w => w.length > 1).join(' ').trim()
}

/** Names that appear more than once (by nameKey), each group as typed. */
export function duplicateGroups(names: string[]): string[][] {
  const by = new Map<string, string[]>()
  for (const n of names) { const k = nameKey(n); if (!k) continue; by.set(k, [...(by.get(k) || []), n]) }
  return Array.from(by.values()).filter(g => g.length > 1)
}

/** A cost line's payments: the recorded list, or (older lines) one payment built from `paid`. */
export function paymentsOf(c: Pick<CostView, 'payments' | 'paid' | 'paidDate' | 'method' | 'status' | 'items' | 'tax' | 'budget'>): CostPayment[] {
  if (c.payments && c.payments.length) return c.payments
  const amt = c.status === 'paid' ? costTotal(c) : round2(c.paid || 0)
  return amt > 0 ? [{ date: c.paidDate || '', amount: amt, method: c.method || '', ref: '' }] : []
}

/** What a line is expected to cost: the plan, else what's committed, else its items as budgeted. */
export function projectedCost(c: CostView): number {
  if (c.planned > 0) return c.planned
  return costTotal(c)
}
/** Money we have agreed to spend: anything past Budgeted. */
export const committedCost = (c: CostView) => c.status === 'budget' ? 0 : costTotal(c)

export type BillRow = {
  id: string; kind: 'vendor' | 'staff' | 'manual'
  name: string; sub: string
  status: string; tone: 'waiting' | 'owed' | 'deposit' | 'paid'
  committed: number; paid: number; owed: number
  projected: number; planned: number | null
  last: { total: number; label: string; change: number | null } | null
  cost?: CostView; tx?: FinTx
}

export type StaffRow = { id: string; name: string; role: string; games: number; method: string; pay: number; paid: boolean; dup: boolean }

export type ClubRow = { id: string; club: string; teams: number; billed: number; paid: number; owed: number; method: string }

export type Finance = {
  income: {
    billed: number; collected: number; outstanding: number
    teams: { billed: number; collected: number; owed: number; regs: number; teamCount: number; owing: ClubRow[]; zero: string[]; dups: string[][] }
    players: { billed: number; collected: number; count: number }
    booths: { billed: number; collected: number; rows: { name: string; status: string; amount: number; paid: boolean }[] }
    other: { billed: number; rows: FinTx[] }
  }
  bills: BillRow[]
  staff: { rows: StaffRow[]; owed: number; paid: number; dups: string[][]; refs: number; refsPay: number; others: number; othersPay: number }
  committed: number; paid: number; owed: number
  profitAll: number; cash: number
  waiting: number
}

const STATUS: Record<string, [string, BillRow['tone']]> = {
  budget: ['Waiting on a bill', 'waiting'], quoted: ['Quoted', 'owed'], booked: ['Booked', 'owed'], paid: ['Paid', 'paid'],
}

export function buildFinance(o: {
  tournamentId: string
  regs: FinReg[]; individuals: FinIndividual[]; vendors: FinVendor[]
  staff: FinStaff[]; staffPaidIds: Set<string>
  txs: FinTx[]; costs: CostView[]
  labelFor: (c: CostView) => string
}): Finance {
  const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + (Number(x) || 0), 0))

  // Income
  const clubs: ClubRow[] = o.regs.map(r => {
    const billed = round2((r.invoiceAmount || 0) - (r.discountAmount || 0))
    const paid = sum((r.payments || []).map(p => p.amount))
    return { id: r.id, club: r.clubName, teams: (r.teams || []).length, billed, paid, owed: round2(billed - paid), method: r.paymentMethod || '' }
  })
  const teams = {
    billed: sum(clubs.map(c => c.billed)), collected: sum(clubs.map(c => c.paid)), owed: 0,
    regs: clubs.length, teamCount: clubs.reduce((s, c) => s + c.teams, 0),
    owing: clubs.filter(c => c.owed > 0.005).sort((a, b) => b.owed - a.owed),
    zero: clubs.filter(c => c.billed <= 0).map(c => c.club),
    dups: duplicateGroups(clubs.map(c => c.club)),
  }
  teams.owed = round2(teams.billed - teams.collected)
  const players = {
    billed: sum(o.individuals.map(i => i.feeTierAmount)),
    collected: sum(o.individuals.filter(i => i.paymentStatus === 'paid').map(i => i.feeTierAmount)),
    count: o.individuals.length,
  }
  // Approved booths only: an unreviewed application has no agreed price.
  const boothRows = o.vendors.map(v => ({ name: v.data?.companyName || 'Vendor', status: v.status || 'pending', amount: Number(v.amountDue) || 0, paid: v.paymentStatus === 'paid' }))
  const booths = {
    billed: sum(boothRows.filter(b => b.status === 'approved').map(b => b.amount)),
    collected: sum(boothRows.filter(b => b.paid).map(b => b.amount)),
    rows: boothRows,
  }
  // Hand-entered income on Other entries counts as billed and collected.
  const otherIncome = o.txs.filter(t => t.type === 'income')
  const other = { billed: sum(otherIncome.map(t => t.amount)), rows: otherIncome }
  const billed = round2(teams.billed + players.billed + booths.billed + other.billed)
  const collected = round2(teams.collected + players.collected + booths.collected + other.billed)

  // Staff
  const dupStaff = duplicateGroups(o.staff.map(s => s.worker.name))
  const dupNames = new Set(dupStaff.flat())
  const staffRows: StaffRow[] = o.staff.map(s => ({
    id: s.worker.id, name: s.worker.name,
    role: (s.games || []).map(g => g.role || '').find(Boolean) || ((s.timeEntries || []).length ? 'Hourly' : 'Staff'),
    games: (s.games || []).length, method: s.worker.payMethod || '', pay: round2(s.totalPay),
    paid: o.staffPaidIds.has(s.worker.id), dup: dupNames.has(s.worker.name),
  })).sort((a, b) => a.name.localeCompare(b.name))
  const isRef = (r: StaffRow) => /ref|umpire|official/i.test(r.role)
  const staff = {
    rows: staffRows, owed: sum(staffRows.map(r => r.pay)), paid: sum(staffRows.filter(r => r.paid).map(r => r.pay)), dups: dupStaff,
    refs: staffRows.filter(isRef).length, refsPay: sum(staffRows.filter(isRef).map(r => r.pay)),
    others: staffRows.filter(r => !isRef(r)).length, othersPay: sum(staffRows.filter(r => !isRef(r)).map(r => r.pay)),
  }

  // Bills
  const mine = o.costs.filter(c => c.tournamentId === o.tournamentId)
  const linkedTx = new Set(mine.map(c => c.transactionId).filter(Boolean))
  const bills: BillRow[] = mine.map(c => {
    const committed = committedCost(c)
    const paid = paidSoFar(c)
    const [label, tone0] = STATUS[c.status] || STATUS.budget
    const deposit = c.status !== 'paid' && paid > 0
    const prev = c.contactId ? lastOrder(o.costs, c.contactId, o.tournamentId) : null
    const prevTotal = prev ? costTotal(prev) : 0
    const now = committed || projectedCost(c)
    return {
      id: c.id, kind: 'vendor', name: c.vendor, sub: billSub(c), cost: c,
      status: deposit ? 'Deposit paid' : label, tone: deposit ? 'deposit' : tone0,
      committed, paid, owed: round2(Math.max(0, committed - paid)),
      projected: projectedCost(c), planned: c.planned > 0 ? c.planned : null,
      last: prev ? { total: prevTotal, label: o.labelFor(prev), change: prevTotal > 0 && now > 0 ? (now - prevTotal) / prevTotal : null } : null,
    }
  })
  if (staffRows.length) {
    bills.push({
      id: 'staff', kind: 'staff', name: 'Referees & game staff',
      sub: `${staffRows.length} pay line${staffRows.length === 1 ? '' : 's'}${staff.refs ? ` · ${staff.refs} referee${staff.refs === 1 ? '' : 's'}` : ''}${staff.others ? ` · ${staff.others} other` : ''} · from Staff Pay`,
      status: staff.paid >= staff.owed - 0.005 ? 'Paid' : staff.paid > 0 ? 'Part paid' : 'Unpaid',
      tone: staff.paid >= staff.owed - 0.005 ? 'paid' : 'owed',
      committed: staff.owed, paid: staff.paid, owed: round2(staff.owed - staff.paid),
      projected: staff.owed, planned: null, last: null,
    })
  }
  for (const t of o.txs.filter(t => t.type === 'expense' && !linkedTx.has(t.id))) {
    bills.push({
      id: 'tx:' + t.id, kind: 'manual', name: t.description || 'Expense', sub: 'Entered on Other entries', tx: t,
      status: 'Paid', tone: 'paid', committed: round2(t.amount), paid: round2(t.amount), owed: 0, projected: round2(t.amount), planned: null, last: null,
    })
  }

  const committed = sum(bills.map(b => b.committed))
  const paidOut = sum(bills.map(b => b.paid))
  return {
    income: { billed, collected, outstanding: round2(billed - collected), teams, players, booths, other },
    bills, staff,
    committed, paid: paidOut, owed: round2(committed - paidOut),
    profitAll: round2(billed - committed), cash: round2(collected - paidOut),
    waiting: bills.filter(b => b.tone === 'waiting').length,
  }
}

function billSub(c: CostView): string {
  const goods = c.items.filter(i => i.item.trim() && i.qty > 0 && !/deliver|set ?up|fee|tax/i.test(i.item)).map(i => `${i.qty} ${i.item.toLowerCase()}`)
  const bits = [goods.slice(0, 3).join(', ') + (goods.length > 3 ? '…' : '')].filter(Boolean)
  if (c.quoteRef) bits.push(`quote #${c.quoteRef}`)
  if (!bits.length) bits.push(c.notes ? c.notes.split('\n')[0].slice(0, 80) : 'No quote yet')
  return bits.join(' · ')
}

// ── Projected P&L ─────────────────────────────────────────────────────────────

export const BUILTIN_INCOME: { key: string; name: string; note: string }[] = [
  { key: 'teams', name: 'Team fees', note: 'Starts at what is billed so far' },
  { key: 'players', name: 'Individual players', note: 'Starts at what is billed so far' },
  { key: 'booths', name: 'Vendor booths', note: 'Approved booths' },
  { key: 'sponsor', name: 'Sponsorship', note: 'Grants and sponsors, if any' },
]

export type ProjIncome = { key: string; name: string; note: string; planned: number | null; billed: number | null; collected: number | null; custom: boolean; projected: number }
export type ProjCost = { id: string; name: string; sub: string; planned: number | null; committed: number; paid: number; projected: number; left: number | null; cost?: CostView; staff?: boolean }

export function projectPL(f: Finance, plan: PlanLine[], costs: CostView[], tournamentId: string): {
  income: ProjIncome[]; costs: ProjCost[]; incomeTotal: number; costTotal: number; profit: number; margin: number | null; unplanned: number
} {
  const get = (key: string) => plan.find(p => p.kind === 'income' && p.key === key)
  const actual: Record<string, [number, number]> = {
    teams: [f.income.teams.billed, f.income.teams.collected],
    players: [f.income.players.billed, f.income.players.collected],
    booths: [f.income.booths.billed, f.income.booths.collected],
    sponsor: [0, 0],
  }
  const income: ProjIncome[] = BUILTIN_INCOME
    .filter(b => b.key !== 'players' || f.income.players.count > 0 || get('players'))
    .map(b => {
      const p = get(b.key)
      const [bl, cl] = actual[b.key]
      const planned = p ? p.planned : null
      return { key: b.key, name: p?.name || b.name, note: b.note, planned, billed: b.key === 'sponsor' ? null : bl, collected: b.key === 'sponsor' ? null : cl, custom: false, projected: planned ?? bl }
    })
  if (f.income.other.billed > 0) income.push({ key: 'other', name: 'Other income', note: 'Entered on Other entries', planned: null, billed: f.income.other.billed, collected: f.income.other.billed, custom: false, projected: f.income.other.billed })
  for (const p of plan.filter(p => p.kind === 'income' && !BUILTIN_INCOME.some(b => b.key === p.key) && p.key !== 'other')) {
    income.push({ key: p.key, name: p.name, note: '', planned: p.planned, billed: null, collected: null, custom: true, projected: p.planned ?? 0 })
  }

  const rows: ProjCost[] = costs.filter(c => c.tournamentId === tournamentId).map(c => {
    const committed = committedCost(c)
    const planned = c.planned > 0 ? c.planned : null
    return {
      id: c.id, name: c.vendor, sub: billSub(c), planned, committed, paid: paidSoFar(c),
      projected: planned ?? costTotal(c),
      left: planned === null ? null : round2(planned - committed), cost: c,
    }
  })
  const sp = plan.find(p => p.kind === 'cost' && p.key === 'staff')
  if (f.staff.rows.length || sp) {
    const planned = sp ? sp.planned : null
    rows.push({ id: 'staff', name: 'Referees & game staff', sub: `From the game schedule · ${f.staff.rows.length} pay lines`, planned, committed: f.staff.owed, paid: f.staff.paid, projected: planned ?? f.staff.owed, left: planned === null ? null : round2(planned - f.staff.owed), staff: true })
  }
  for (const b of f.bills.filter(b => b.kind === 'manual')) {
    rows.push({ id: b.id, name: b.name, sub: b.sub, planned: null, committed: b.committed, paid: b.paid, projected: b.committed, left: null })
  }
  const incomeTotal = round2(income.reduce((s, i) => s + i.projected, 0))
  const costTotalAll = round2(rows.reduce((s, r) => s + r.projected, 0))
  const profit = round2(incomeTotal - costTotalAll)
  return {
    income, costs: rows, incomeTotal, costTotal: costTotalAll, profit,
    margin: incomeTotal > 0 ? Math.round((profit / incomeTotal) * 100) : null,
    unplanned: rows.filter(r => r.projected <= 0).length,
  }
}

/** Documents that look like they belong to a bill: the quote number or the vendor's name in the file name. */
export function docsFor(c: Pick<CostView, 'vendor' | 'quoteRef'>, docs: FinDoc[]): FinDoc[] {
  const words = nameKey(c.vendor).split(' ').filter(w => w.length > 3 && !['party', 'rental', 'rentals', 'county', 'events', 'group'].includes(w))
  return docs.filter(d => {
    const n = nameKey(d.name)
    return (c.quoteRef && d.name.includes(c.quoteRef)) || words.some(w => n.split(' ').includes(w))
  })
}
