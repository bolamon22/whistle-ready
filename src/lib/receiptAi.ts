import { EXPENSE_CATEGORIES, isExpenseCategory, round2, type ReceiptRead } from '@/lib/expenseTypes'

// Reading a receipt photo for the receipt form (api/expenses/receipts/[id]/read):
// the store, the day, the total and a few words on what was bought, so whoever
// snapped it only has to check them. Same model and key as the other AI helpers.
// Pure, so the prompt and the clean-up are tested without calling the model.

export const RECEIPT_MODEL = 'claude-haiku-4-5-20251001'

export const RECEIPT_TOOL = {
  name: 'receipt',
  description: 'Report what the receipt shows.',
  input_schema: {
    type: 'object' as const,
    properties: {
      isReceipt: { type: 'boolean', description: 'false when the picture is not a receipt, invoice or order confirmation at all' },
      vendor: { type: 'string', description: 'The store or business, the way people say it: "Home Depot", "Publix", "Walmart", "Amazon". Empty if you cannot read it.' },
      date: { type: 'string', description: 'The day of the purchase as YYYY-MM-DD. Empty if you cannot read it.' },
      total: { type: 'number', description: 'The total actually charged, after tax and discounts. Not the subtotal, not the cash handed over, not the change. 0 if you cannot read it.' },
      what: { type: 'string', description: 'What was bought, in a few everyday words, under 80 characters: "2 cases of water, 6 bags of ice", "Field paint (12 cans)". No item codes or prices.' },
      category: { type: 'string', enum: EXPENSE_CATEGORIES.map(c => c.key), description: EXPENSE_CATEGORIES.map(c => `${c.key} = ${c.label}`).join('; ') },
    },
    required: ['isReceipt', 'vendor', 'date', 'total', 'what', 'category'],
  },
}

export function receiptSystem(today: string): string {
  return `You read photos of store receipts for a youth sports tournament company's expense records. Staff buy things for events (water, ice, field paint, cones, first aid) and turn in the receipt to be paid back.
Today is ${today}. A receipt that prints a two-digit year (10/18/26) means 20xx; a date can't be in the future.
Rules:
- Read only what is printed. If part of the receipt is cut off, blurry or missing, leave that field empty (or 0 for the total) rather than guess.
- The total is the amount charged: "Total", "Amount due", "Grand total", "Charged", the card amount. Never the subtotal, never "Cash" tendered or "Change".
- Keep "what" short and plain, the way a person would say it.
- Use the receipt tool once.`
}

const s = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** The model's answer, made safe to fill a form with. A date in the future or older
 *  than three years is dropped (it was misread); so is a total of $100,000 or more. */
export function cleanRead(input: unknown, today: string): ReceiptRead {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  let date = s(o.date, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date + 'T12:00:00Z')) || date > today
    || Date.parse(date + 'T12:00:00Z') < Date.parse(today + 'T12:00:00Z') - 3 * 366 * 86_400_000) date = ''
  const n = typeof o.total === 'string' ? parseFloat(o.total.replace(/[$,\s]/g, '')) : Number(o.total)
  const total = Number.isFinite(n) && n > 0 && n < 100_000 ? round2(n) : 0
  return {
    isReceipt: o.isReceipt !== false,
    vendor: s(o.vendor, 120),
    date,
    total,
    what: s(o.what, 200),
    category: isExpenseCategory(o.category) ? String(o.category) : 'other',
  }
}
