// Event costs: what each vendor charges us, event by event, so next year's
// budget starts from last year's real numbers and a price rise shows up on the
// line that rose.
//
// Pure -- no database import -- so the Budget tab, the contact card and the
// vendor emails can use it in the browser. The server side is lib/eventCosts.ts.
//
// Bo, Oct 5 2026: "can we start building this into the expenses so I can
// budget costs moving forward? I think they keep going up in price every
// year." A cost line is a quote broken into its items (10 tents at $110...),
// so a change in the unit price is measured, not guessed from the total.

/** Where a cost line stands. Only `paid` reaches Financials (as an expense). */
export type CostStatus = 'budget' | 'quoted' | 'booked' | 'paid'
export const COST_STATUSES: { key: CostStatus; label: string; tone: string }[] = [
  { key: 'budget', label: 'Budgeted', tone: 'bg-slate-100 text-slate-700' },
  { key: 'quoted', label: 'Quoted', tone: 'bg-amber-100 text-amber-800' },
  { key: 'booked', label: 'Booked', tone: 'bg-sky-100 text-sky-800' },
  { key: 'paid', label: 'Paid', tone: 'bg-emerald-100 text-emerald-800' },
]
export const isCostStatus = (v: unknown): v is CostStatus => COST_STATUSES.some(s => s.key === v)
export const costStatus = (k: string) => COST_STATUSES.find(s => s.key === k) || COST_STATUSES[0]

/** The Financials expense categories (financials/page.tsx), so a paid line lands in the right row there. */
export const COST_CATEGORIES: { key: string; label: string }[] = [
  { key: 'facility', label: 'Facility / Fields' },
  { key: 'rental', label: 'Rentals' },
  { key: 'supplies', label: 'Field Supplies' },
  { key: 'awards', label: 'Awards & Trophies' },
  { key: 'merch', label: 'Merchandise (Cost)' },
  { key: 'marketing', label: 'Marketing & Printing' },
  { key: 'insurance', label: 'Insurance / Permits' },
  { key: 'other_exp', label: 'Other Expense' },
]
export const isCostCategory = (v: unknown) => COST_CATEGORIES.some(c => c.key === v)
export const costCategory = (k: string) => COST_CATEGORIES.find(c => c.key === k) || COST_CATEGORIES[COST_CATEGORIES.length - 1]

/** A contact category's usual Financials category. */
export function categoryForContact(contactCategory: string): string {
  return ({ venue: 'facility', county: 'insurance', rentals: 'rental', insurance: 'insurance', food: 'other_exp', officials: 'other_exp', housing: 'other_exp' } as Record<string, string>)[contactCategory] || 'other_exp'
}

export type CostItem = { item: string; qty: number; unit: number }

export type CostView = {
  id: string
  tournamentId: string          // '' for a past event that isn't in Whistle Ready
  eventLabel: string            // the event's name when there's no tournament ("Fall Classic 2023, Tamarac")
  eventDate: string             // YYYY-MM-DD; a tournament's first day
  contactId: string
  vendor: string                // the company, kept even if the contact is deleted
  category: string
  status: CostStatus
  quoteRef: string              // the vendor's quote or invoice number
  quoteDate: string
  items: CostItem[]
  tax: number
  budget: number                // the planned amount before a quote came in; 0 = use the items
  notes: string
  paidDate: string
  method: string
  transactionId: string         // the Financials expense this became when paid
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
export const itemsTotal = (items: CostItem[]) => round2(items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.unit) || 0), 0))
/** What the line costs: its items plus tax, or the budget figure when no items are in yet. */
export const costTotal = (c: Pick<CostView, 'items' | 'tax' | 'budget'>) => {
  const sub = itemsTotal(c.items)
  return sub > 0 ? round2(sub + (Number(c.tax) || 0)) : round2(c.budget)
}
export const money = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const year = (d: string) => (/^\d{4}/.test(d) ? d.slice(0, 4) : '')

/**
 * "10x10 TENT'S ON GRASS" and "10x10 tents on grass" are the same thing.
 * Words in brackets count: "WEIGHTS (WATER BARRELS)" at $10 is not the $5 weight.
 */
export function itemKey(name: string): string {
  return name.toLowerCase()
    .replace(/['’]s\b/g, 's')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(\w+?)s\b/g, '$1')
    .trim()
}

/** The tax rate a line was charged, as a percent of what it was charged on (items). */
export const taxRate = (c: Pick<CostView, 'items' | 'tax'>) => {
  const sub = itemsTotal(c.items)
  return sub > 0 && c.tax > 0 ? Math.round((c.tax / sub) * 1000) / 10 : 0
}

export type PricePoint = { costId: string; date: string; label: string; qty: number; unit: number }
export type PriceRow = {
  key: string
  item: string                  // the newest spelling
  points: PricePoint[]          // oldest first
  change: number | null         // newest unit vs oldest, as a fraction (0.51 = +51%); null with one point
}

/**
 * One vendor's prices, item by item, oldest to newest. Lines still at
 * `budget` are left out: they're our guesses, not the vendor's prices.
 */
export function priceHistory(costs: CostView[], labelFor: (c: CostView) => string): PriceRow[] {
  const rows = new Map<string, PriceRow>()
  const dated = costs
    .filter(c => c.status !== 'budget')
    .sort((a, b) => (a.quoteDate || a.eventDate).localeCompare(b.quoteDate || b.eventDate))
  for (const c of dated) {
    for (const it of c.items) {
      if (!it.item.trim() || !(it.qty > 0)) continue
      const key = itemKey(it.item)
      const row = rows.get(key) || { key, item: it.item, points: [], change: null }
      row.item = it.item
      row.points.push({ costId: c.id, date: c.eventDate || c.quoteDate, label: labelFor(c), qty: it.qty, unit: round2(it.unit) })
      rows.set(key, row)
    }
  }
  return Array.from(rows.values()).map(r => {
    const a = r.points[0], b = r.points[r.points.length - 1]
    return { ...r, change: r.points.length > 1 && a.unit > 0 ? Math.round(((b.unit - a.unit) / a.unit) * 1000) / 1000 : null }
  })
}

/** "+51%", "−9%", "same", "" */
export function changeLabel(change: number | null): string {
  if (change === null) return ''
  if (Math.abs(change) < 0.005) return 'same'
  const pct = Math.round(Math.abs(change) * 100)
  return `${change > 0 ? '+' : '−'}${pct}%`
}

/** The newest real (non-budget) line for a vendor, the one a new budget copies. */
export function lastOrder(costs: CostView[], contactId: string, exceptTournamentId = ''): CostView | null {
  return costs
    .filter(c => c.contactId === contactId && c.status !== 'budget' && c.items.length && (!exceptTournamentId || c.tournamentId !== exceptTournamentId))
    .sort((a, b) => (b.eventDate || b.quoteDate).localeCompare(a.eventDate || a.quoteDate))[0] || null
}
