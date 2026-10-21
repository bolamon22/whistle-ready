// The 1099 export (Bo, Oct 21 2026; Head Assigner backlog): what each official and
// hourly staff member was paid in a calendar year, for the 1099-NEC. Server only for
// rows1099; the rest is pure.
//
// - Paid means a PaymentRecord (Staff pay's Mark paid, and the tournament director's
//   Mark paid in their area), counted in the year of its paid date, not the event's.
//   Earned but not yet paid isn't income for the year, so it isn't here.
// - One row per person per payer. On the Assigner plan the tournament director
//   normally pays the staff (Bo, Oct 17 2026), so a 1099 is theirs to file, not the
//   head assigner's. The payer is who paid each payment (lib/officialsPayer: its own
//   pick on Mark paid, else the event's Officials are paid by, which starts on the
//   tournament director on the Assigner plan). The IRS threshold
//   is per payer, so a ref paid $1,500 by two tournament directors needs no 1099.
// - Threshold: $600 through tax year 2025; $2,000 for payments made in 2026 (the One
//   Big Beautiful Bill Act, July 2025), indexed for inflation from 2027 (check the IRS
//   figure then and add it to THRESHOLDS).
// - No tax ID or address: those live only in each person's uploaded W-9 (lib/staffW9,
//   encrypted). The export says whether one is on file.
// - The organization is always the caller's own (View as: the viewed one). Never
//   another organization's events or people.

export const THRESHOLDS: Record<number, number> = { 2026: 2000 }
export function threshold1099(year: number): number {
  if (THRESHOLDS[year]) return THRESHOLDS[year]
  if (year < 2026) return 600
  const known = Object.keys(THRESHOLDS).map(Number).filter(y => y <= year).sort((a, b) => b - a)[0]
  return THRESHOLDS[known] ?? 2000
}

export type Rec1099 = { id?: string; workerId: string; tournamentId: string; amount: number; paidBy: string | null }
export type Person1099 = { id: string; name: string; email: string; phone: string; payMethod: string; w9OnFile: boolean }
export type Payer1099 = { key: string; name: string; kind: 'org' | 'td' }
export type Row1099 = {
  workerId: string; name: string; email: string; phone: string; payMethod: string; w9OnFile: boolean
  payer: string; payerKey: string; payerKind: 'org' | 'td'; events: number; payments: number; total: number; needs1099: boolean
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** One row per person per payer, biggest totals first within each payer. */
export function build1099(recs: Rec1099[], people: Map<string, Person1099>, payerOf: (r: Rec1099) => Payer1099, year: number): Row1099[] {
  const min = threshold1099(year)
  const map = new Map<string, Row1099 & { _ev: Set<string> }>()
  for (const r of recs) {
    const p = people.get(r.workerId)
    if (!p || !(r.amount > 0)) continue
    const payer = payerOf(r)
    const k = p.id + '|' + payer.key
    let row = map.get(k)
    if (!row) {
      row = { workerId: p.id, name: p.name, email: p.email, phone: p.phone, payMethod: p.payMethod, w9OnFile: p.w9OnFile, payer: payer.name, payerKey: payer.key, payerKind: payer.kind, events: 0, payments: 0, total: 0, needs1099: false, _ev: new Set() }
      map.set(k, row)
    }
    row.total += r.amount; row.payments += 1; row._ev.add(r.tournamentId)
  }
  return Array.from(map.values()).map(({ _ev, ...row }) => {
    const total = round2(row.total)
    return { ...row, total, events: _ev.size, needs1099: total >= min }
  }).sort((a, b) => (a.payerKind === b.payerKind ? 0 : a.payerKind === 'org' ? -1 : 1) || a.payer.localeCompare(b.payer) || b.total - a.total || a.name.localeCompare(b.name))
}

/** A spreadsheet cell: quoted, and never read as a formula (a name like "=HYPERLINK(…)"). */
export function csvCell(v: unknown): string {
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}

export const PAY_METHOD_NAMES: Record<string, string> = { zelle: 'Zelle', check: 'Check', venmo: 'Venmo', cash: 'Cash', other: 'Other' }

export function csv1099(rows: Row1099[], year: number): string {
  const head = ['Payer', 'Name', 'Email', 'Phone', `Total paid ${year}`, `Needs a 1099 ($${threshold1099(year).toLocaleString('en-US')}+)`, 'W-9 on file', 'Events', 'Payments', 'Pay method']
  const lines = rows.map(r => [r.payer, r.name, r.email, r.phone, r.total.toFixed(2), r.needs1099 ? 'Yes' : 'No', r.w9OnFile ? 'Yes' : 'No', r.events, r.payments, PAY_METHOD_NAMES[r.payMethod] || r.payMethod].map(csvCell).join(','))
  return '﻿' + [head.map(csvCell).join(','), ...lines].join('\r\n') + '\r\n'
}
