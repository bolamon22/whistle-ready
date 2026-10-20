// Receipts: what staff buy for an event and who gets paid back (Bo, Oct 20 2026:
// "Sometimes we have people run out and buy ... water for the event, or I had to buy
// paint to paint the goals" and "we would need the name of the person, what they
// bought, from who, and whether they were reimbursed and paid back yet ... snap a
// picture of the receipt").
//
// Pure -- no database import -- so the staff home's receipt card, the Financials
// Expenses tab and lib/finance share it in the browser. Server side: lib/eventExpenses.

export type ExpenseStatus = 'pending' | 'approved' | 'declined'
export type PaidWith = 'own' | 'company_card' | 'company_cash'

/** What the money went on. The receipt reader picks one; anyone can change it. */
export const EXPENSE_CATEGORIES: { key: string; label: string }[] = [
  { key: 'water', label: 'Water, ice & drinks' },
  { key: 'food', label: 'Food' },
  { key: 'field', label: 'Field supplies' },
  { key: 'equipment', label: 'Equipment & repairs' },
  { key: 'medical', label: 'First aid' },
  { key: 'printing', label: 'Printing & office' },
  { key: 'travel', label: 'Gas & travel' },
  { key: 'other', label: 'Other' },
]
export const isExpenseCategory = (v: unknown): v is string => EXPENSE_CATEGORIES.some(c => c.key === v)
export const categoryLabel = (k: string) => (EXPENSE_CATEGORIES.find(c => c.key === k) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1]).label

/** Who paid at the register. Only `own` is paid back. */
export const PAID_WITH: { key: PaidWith; label: string; staff: string }[] = [
  { key: 'own', label: 'Their own money', staff: 'My own money (pay me back)' },
  { key: 'company_card', label: 'Company card', staff: 'Company card' },
  { key: 'company_cash', label: 'Company cash', staff: 'Company cash' },
]
export const isPaidWith = (v: unknown): v is PaidWith => PAID_WITH.some(p => p.key === v)
export const paidWithLabel = (k: string) => (PAID_WITH.find(p => p.key === k) || PAID_WITH[0]).label

/** How someone was paid back. */
export const PAY_BACK_METHODS: { key: string; label: string }[] = [
  { key: 'zelle', label: 'Zelle' },
  { key: 'venmo', label: 'Venmo' },
  { key: 'check', label: 'Check' },
  { key: 'cash', label: 'Cash' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'other', label: 'Other' },
]
export const isPayBackMethod = (v: unknown): v is string => PAY_BACK_METHODS.some(m => m.key === v)
export const payBackLabel = (k: string) => PAY_BACK_METHODS.find(m => m.key === k)?.label || k || ''

export type ExpenseLog = { at: string; by: string; text: string }

export type ExpenseView = {
  id: string
  tournamentId: string
  eventName: string             // filled on the staff list, which spans events
  personName: string            // who bought it
  workerId: string              // their Staff Pool record, when they have one
  userId: string                // the login that turned it in ('' when the office typed it)
  what: string                  // what they bought
  vendor: string                // from who: the store
  amount: number                // the total paid, tax included
  purchasedOn: string           // YYYY-MM-DD
  category: string
  paidWith: PaidWith
  notes: string
  status: ExpenseStatus
  declineReason: string
  paidBackOn: string            // YYYY-MM-DD; '' = not paid back yet
  paidBackMethod: string
  paidBackNote: string          // a check number, a Zelle confirmation
  receiptId: string             // '' = no receipt
  receiptType: '' | 'image' | 'pdf'
  /** The total the receipt reader saw on the receipt (server-set), null when unread. */
  receiptTotal: number | null
  createdAt: string             // ISO
  createdBy: string             // a name
  log: ExpenseLog[]
}

/** Where one receipt stands, from the office's side. */
export type ExpenseState = 'waiting' | 'owed' | 'paid_back' | 'company' | 'declined'

export function expenseState(e: Pick<ExpenseView, 'status' | 'paidWith' | 'paidBackOn'>): ExpenseState {
  if (e.status === 'declined') return 'declined'
  if (e.status !== 'approved') return 'waiting'
  if (e.paidWith !== 'own') return 'company'
  return e.paidBackOn ? 'paid_back' : 'owed'
}

export const STATE_LABEL: Record<ExpenseState, string> = {
  waiting: 'Waiting for approval', owed: 'To pay back', paid_back: 'Paid back', company: 'Company paid', declined: 'Not approved',
}
/** The same, as the person who turned it in reads it. */
export const STAFF_STATE_LABEL: Record<ExpenseState, string> = {
  waiting: 'Waiting for approval', owed: 'Approved, paying you back', paid_back: 'Paid back', company: 'Approved', declined: 'Not approved',
}
/** The Financials pill tones (financials/parts StatusPill) plus red for a refusal. */
export const STATE_TONE: Record<ExpenseState, string> = {
  waiting: 'bg-slate-100 text-slate-700', owed: 'bg-amber-100 text-amber-800', paid_back: 'bg-emerald-100 text-emerald-800',
  company: 'bg-emerald-100 text-emerald-800', declined: 'bg-red-100 text-red-800',
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + (Number(x) || 0), 0))

export type ExpenseTotals = {
  count: number                         // not counting refused ones
  spent: number                         // approved, any way paid
  waiting: { count: number; amount: number }
  owed: number                          // approved, their own money, not paid back
  paidBack: number
  company: number
  declined: number
  people: number                        // different people with a receipt in
}

export function expenseTotals(list: ExpenseView[]): ExpenseTotals {
  const live = list.filter(e => e.status !== 'declined')
  const by = (s: ExpenseState) => live.filter(e => expenseState(e) === s)
  return {
    count: live.length,
    spent: sum(live.filter(e => e.status === 'approved').map(e => e.amount)),
    waiting: { count: by('waiting').length, amount: sum(by('waiting').map(e => e.amount)) },
    owed: sum(by('owed').map(e => e.amount)),
    paidBack: sum(by('paid_back').map(e => e.amount)),
    company: sum(by('company').map(e => e.amount)),
    declined: list.length - live.length,
    people: new Set(live.map(personKey)).size,
  }
}

/** One person across their receipts: their Staff Pool record, else their name. */
export function personKey(e: Pick<ExpenseView, 'workerId' | 'personName'>): string {
  if (e.workerId) return 'w:' + e.workerId
  return 'n:' + e.personName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export type OwedPerson = { key: string; personName: string; workerId: string; ids: string[]; amount: number; waiting: number }

/** Approved receipts paid with someone's own money and not paid back yet, one row per
 *  person, largest first, so one Zelle can cover all of theirs. `waiting` is what they
 *  have turned in that nobody has approved yet. */
export function owedByPerson(list: ExpenseView[]): OwedPerson[] {
  const m = new Map<string, OwedPerson>()
  for (const e of list) {
    const st = expenseState(e)
    if (st !== 'owed' && !(st === 'waiting' && e.paidWith === 'own')) continue
    const k = personKey(e)
    const p = m.get(k) || { key: k, personName: e.personName, workerId: e.workerId, ids: [], amount: 0, waiting: 0 }
    if (st === 'owed') { p.ids.push(e.id); p.amount = round2(p.amount + e.amount) } else p.waiting = round2(p.waiting + e.amount)
    m.set(k, p)
  }
  return Array.from(m.values()).filter(p => p.ids.length).sort((a, b) => b.amount - a.amount || a.personName.localeCompare(b.personName))
}

/** The receipt reader's total when it isn't what was entered (more than a cent off). */
export function receiptMismatch(e: Pick<ExpenseView, 'amount' | 'receiptTotal'>): number | null {
  return e.receiptTotal !== null && e.receiptTotal > 0 && Math.abs(e.receiptTotal - e.amount) > 0.01 ? e.receiptTotal : null
}

/** Receipts that look entered twice (turned in by a staff member and typed by the
 *  office, say): same event, same amount, same day, and the same store when both
 *  name one. id -> the ids it matches. Refused ones don't count. */
export function possibleDuplicates(list: ExpenseView[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const live = list.filter(e => e.status !== 'declined' && e.amount > 0)
  const store = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j]
      if (a.tournamentId !== b.tournamentId || Math.abs(a.amount - b.amount) > 0.005 || a.purchasedOn !== b.purchasedOn) continue
      const sa = store(a.vendor), sb = store(b.vendor)
      if (sa && sb && !sa.includes(sb) && !sb.includes(sa)) continue
      out.set(a.id, [...(out.get(a.id) || []), b.id])
      out.set(b.id, [...(out.get(b.id) || []), a.id])
    }
  }
  return out
}

/** Spent per category, approved receipts only, largest first. */
export function byCategory(list: ExpenseView[]): { key: string; label: string; amount: number; count: number }[] {
  const m = new Map<string, { amount: number; count: number }>()
  for (const e of list.filter(x => x.status === 'approved')) {
    const k = isExpenseCategory(e.category) ? e.category : 'other'
    const c = m.get(k) || { amount: 0, count: 0 }
    m.set(k, { amount: round2(c.amount + e.amount), count: c.count + 1 })
  }
  return Array.from(m.entries()).map(([key, v]) => ({ key, label: categoryLabel(key), ...v })).sort((a, b) => b.amount - a.amount)
}

/** A spreadsheet of the receipts, for the books. */
export function expensesCsv(list: ExpenseView[], eventName = ''): string {
  const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const head = ['Date bought', 'Event', 'Who bought it', 'What', 'From', 'Category', 'Amount', 'Paid with', 'Status', 'Paid back on', 'Paid back by', 'Paid back note', 'Receipt', 'Notes']
  const rows = list.map(e => [
    e.purchasedOn, e.eventName || eventName, e.personName, e.what, e.vendor, categoryLabel(e.category), e.amount.toFixed(2),
    paidWithLabel(e.paidWith), STATE_LABEL[expenseState(e)], e.paidBackOn, payBackLabel(e.paidBackMethod), e.paidBackNote,
    e.receiptId ? 'Yes' : 'No', e.status === 'declined' && e.declineReason ? `Not approved: ${e.declineReason}${e.notes ? ` · ${e.notes}` : ''}` : e.notes,
  ])
  return [head, ...rows].map(r => r.map(q).join(',')).join('\r\n') + '\r\n'
}

/** What the receipt reader sends back to fill the form. */
export type ReceiptRead = { isReceipt: boolean; vendor: string; date: string; total: number; what: string; category: string }

/** Biggest receipt file the server keeps (a photo is shrunk well under this first). */
export const RECEIPT_MAX_BYTES = 4 * 1024 * 1024
