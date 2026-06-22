// Shared registration-pricing model used by the public register form, the staff
// registrations page, the setup wizard and tournament settings.
//
// Three independent, fully add/remove-able axes:
//  - tiers:  auto-chaining volume brackets (last has max:null = "and up")
//  - flats:  division-based flat rates — a team whose division name contains
//            `match` pays this instead of the volume rate (e.g. 7v7, Youth, HS)
//  - dates:  early-bird discounts — `amount`/`percent` off per team if the team
//            registers on/before `until` (the best applicable discount applies)

export type Bracket = { max: number | null; price: number }
export type FlatTier = { label: string; match: string; price: number }
export type DateTier = { label: string; until: string; kind: 'amount' | 'percent'; value: number }
export type RegPricing = { tiers: Bracket[]; flats: FlatTier[]; dates: DateTier[] }

export const DEFAULT_REG_PRICING: RegPricing = {
  tiers: [
    { max: 3, price: 1495 },
    { max: 6, price: 1450 },
    { max: null, price: 1395 },
  ],
  flats: [{ label: '7v7 teams', match: '7v7', price: 1095 }],
  dates: [],
}

const clone = (p: RegPricing): RegPricing => ({
  tiers: p.tiers.map(t => ({ ...t })),
  flats: p.flats.map(f => ({ ...f })),
  dates: p.dates.map(d => ({ ...d })),
})

function normFlat(f: any): FlatTier {
  return { label: String(f?.label ?? 'Flat-rate teams'), match: String(f?.match ?? ''), price: Number(f?.price) || 0 }
}
function normDate(d: any): DateTier {
  return {
    label: String(d?.label ?? 'Early bird'),
    until: String(d?.until ?? ''),
    kind: d?.kind === 'percent' ? 'percent' : 'amount',
    value: Number(d?.value) || 0,
  }
}

// Accepts the current shape, the older {flat:{...}} single-flat shape, the legacy
// {tier1,tier1Max,...,sevenVSeven} shape, or a JSON string of any — always returns
// a valid RegPricing.
export function parsePricing(raw: any): RegPricing {
  let o: any = raw
  if (typeof raw === 'string') { try { o = JSON.parse(raw || '{}') } catch { o = {} } }
  o = o || {}

  if (Array.isArray(o.tiers) && o.tiers.length) {
    const tiers: Bracket[] = o.tiers.map((t: any) => ({
      max: (t.max === null || t.max === undefined || t.max === '') ? null : Number(t.max),
      price: Number(t.price) || 0,
    }))
    if (!tiers.some(t => t.max === null)) tiers.push({ max: null, price: tiers[tiers.length - 1]?.price || 0 })
    const flats: FlatTier[] = Array.isArray(o.flats)
      ? o.flats.map(normFlat)
      : (o.flat ? [normFlat(o.flat)] : [])
    const dates: DateTier[] = Array.isArray(o.dates) ? o.dates.map(normDate) : []
    return { tiers, flats, dates }
  }

  if (o.tier1 !== undefined) {
    const t1m = Number(o.tier1Max) || 3, t2m = Number(o.tier2Max) || 6
    const tiers: Bracket[] = [
      { max: t1m, price: Number(o.tier1) || 0 },
      { max: t2m, price: Number(o.tier2) || 0 },
      { max: null, price: Number(o.tier3) || 0 },
    ]
    const flats: FlatTier[] = (o.sevenVSeven !== undefined && o.sevenVSeven !== null)
      ? [{ label: '7v7 teams', match: '7v7', price: Number(o.sevenVSeven) || 0 }]
      : []
    return { tiers, flats, dates: [] }
  }

  return clone(DEFAULT_REG_PRICING)
}

export function serializePricing(p: RegPricing): string { return JSON.stringify(p) }

export function baseFee(p: RegPricing): number { return p.tiers[0]?.price || 0 }

function rateForCount(tiers: Bracket[], n: number): number {
  for (const t of tiers) { if (t.max === null || n <= t.max) return t.price }
  return tiers[tiers.length - 1]?.price || 0
}

function matchedFlat(flats: FlatTier[], division?: string): FlatTier | null {
  if (!division) return null
  const d = division.toLowerCase()
  return flats.find(f => f.match && d.includes(f.match.toLowerCase())) || null
}

const todayISO = () => new Date().toISOString().slice(0, 10)

function dateDiscount(base: number, dates: DateTier[], asOf: string): number {
  let best = 0
  for (const d of dates) {
    if (d.until && asOf <= d.until) {
      const disc = d.kind === 'percent' ? base * (d.value / 100) : d.value
      if (disc > best) best = disc
    }
  }
  return best
}

// Total invoice for a set of teams (each with a `division` string), as of a given
// registration date (defaults to today — used for early-bird evaluation).
export function calcFee(teams: { division?: string }[], p: RegPricing, asOf?: string): number {
  const when = asOf || todayISO()
  const regularCount = teams.filter(t => !matchedFlat(p.flats, t.division)).length
  const regRate = rateForCount(p.tiers, regularCount)
  let total = 0
  for (const t of teams) {
    const f = matchedFlat(p.flats, t.division)
    const base = f ? f.price : regRate
    total += Math.max(0, base - dateDiscount(base, p.dates, when))
  }
  return total
}

const fmtMoney = (n: number) => '$' + (n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const fmtDate = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); const dt = new Date(+y, +m - 1, +day); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

// Human-readable "view fee schedule" lines.
export function feeScheduleLines(p: RegPricing): string[] {
  const lines: string[] = []
  let prev = 0
  p.tiers.forEach((t) => {
    if (t.max === null) lines.push(`${prev + 1}+ teams: ${fmtMoney(t.price)}/team`)
    else { lines.push(`${prev + 1}-${t.max} teams: ${fmtMoney(t.price)}/team`); prev = t.max }
  })
  p.flats.forEach(f => lines.push(`${f.label || 'Flat-rate teams'}: ${fmtMoney(f.price)}/team`))
  p.dates.forEach(d => {
    const off = d.kind === 'percent' ? `${d.value || 0}% off` : `${fmtMoney(d.value)} off`
    lines.push(`${d.label || 'Early bird'}: ${off}/team if registered by ${fmtDate(d.until)}`)
  })
  return lines
}
