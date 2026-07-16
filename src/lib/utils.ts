export function formatTime(time: string): string {
  const [h, m] = time.split(':')
  const hour = parseInt(h, 10)
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`
}

export function formatDate(date: string): string {
  const d = new Date(date + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export interface PayRates {
  youth: number; hs: number; college: number
  scorekeeper: number; athletic_trainer: number; field_ops: number; assigner: number
  [key: string]: number
}

export const DEFAULT_PAY_RATES: PayRates = {
  youth: 50, hs: 60, college: 70, scorekeeper: 15, athletic_trainer: 25, field_ops: 20, assigner: 10
}

// Only 3 assignment roles shown in grid now
export const GRID_ROLES = [
  { value: 'ref1', label: 'Ref 1', short: 'R1', color: '#0284c7' },
  { value: 'ref2', label: 'Ref 2', short: 'R2', color: '#7c3aed' },
  { value: 'scorekeeper', label: 'Scorekeeper', short: 'SK', color: '#059669' },
]

export const ALL_ROLES = [
  ...GRID_ROLES,
  { value: 'ref3',             label: 'Ref 3',            short: 'R3', color: '#db2777' },
  { value: 'athletic_trainer', label: 'Athletic Trainer', short: 'AT', color: '#d97706' },
  { value: 'field_ops',        label: 'Field Ops',        short: 'FO', color: '#0d9488' },
]

export const WORKER_ROLES = [
  { value: 'ref',              label: 'Referee' },
  { value: 'scorekeeper',      label: 'Scorekeeper' },
  { value: 'athletic_trainer', label: 'Athletic Trainer' },
  { value: 'field_ops',        label: 'Field Operations' },
]

export const CERT_LEVELS = [
  { value: 'youth',   label: 'Youth' },
  { value: 'hs',      label: 'High School' },
  { value: 'college', label: 'College' },
  { value: 'none',    label: 'N/A' },
]

export const PAY_METHODS = [
  { value: 'check',  label: 'Check' },
  { value: 'venmo',  label: 'Venmo' },
  { value: 'zelle',  label: 'Zelle' },
  { value: 'cash',   label: 'Cash' },
  { value: 'other',  label: 'Other' },
]

export function certLabel(c: string): string {
  return CERT_LEVELS.find(x => x.value === c)?.label ?? c
}

export function roleLabel(r: string): string {
  return ALL_ROLES.find(x => x.value === r)?.label ?? WORKER_ROLES.find(x => x.value === r)?.label ?? r
}

export function getPayRate(certLevel: string, role: string, payRates: PayRates): number {
  if (role === 'assigner')         return payRates.assigner ?? 10
  if (role === 'scorekeeper')      return payRates.scorekeeper ?? 15
  if (role === 'athletic_trainer') return payRates.athletic_trainer ?? 25
  if (role === 'field_ops')        return payRates.field_ops ?? 20
  switch (certLevel) {
    case 'college': return payRates.college ?? 70
    case 'hs':      return payRates.hs ?? 60
    default:        return payRates.youth ?? 50
  }
}

export function excelSerialToDate(serial: number): string {
  const d = new Date((serial - 25569) * 86400 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`
}

export function excelSerialToTime(serial: number): string {
  const m = Math.round(serial * 24 * 60)
  return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`
}

export function isHourlyRole(role: string): boolean {
  return role === 'athletic_trainer' || role === 'field_ops'
}

// Division color palette — consistent across grid
const DIV_COLORS = [
  { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' }, // blue
  { bg: '#fdf4ff', border: '#a855f7', text: '#7e22ce' }, // purple
  { bg: '#f0fdf4', border: '#22c55e', text: '#15803d' }, // green
  { bg: '#fff7ed', border: '#f97316', text: '#c2410c' }, // orange
  { bg: '#fff1f2', border: '#f43f5e', text: '#be123c' }, // rose
  { bg: '#f0fdfa', border: '#14b8a6', text: '#0f766e' }, // teal
  { bg: '#fefce8', border: '#eab308', text: '#a16207' }, // yellow
  { bg: '#f5f3ff', border: '#8b5cf6', text: '#6d28d9' }, // violet
]

const divColorCache = new Map<string, typeof DIV_COLORS[0]>()
let divColorIndex = 0

export function getDivisionColor(division: string): typeof DIV_COLORS[0] {
  if (!divColorCache.has(division)) {
    divColorCache.set(division, DIV_COLORS[divColorIndex % DIV_COLORS.length])
    divColorIndex++
  }
  return divColorCache.get(division)!
}

export function resetDivisionColors() {
  divColorCache.clear()
  divColorIndex = 0
}

// Parses payRates from either v1 (legacy) or v2 (new builder) format
// Always returns a PayRates-compatible object so existing routes keep working
export function parsePayRates(raw: string): PayRates {
  try {
    let parsed = JSON.parse(raw || '{}')
    // Heal double-encoded values: an older API bug JSON.stringify'd an already-serialized
    // string, so the column holds JSON *inside* a JSON string. One extra parse recovers it.
    // Without this, such rows silently fall back to DEFAULT_PAY_RATES (wrong staff pay).
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { /* leave as-is */ } }
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PAY_RATES }
    if (parsed._v !== 2) return { ...DEFAULT_PAY_RATES, ...parsed }
    // v2 format — extract rates from roles array by id
    const roles: { id: string; rate: number }[] = parsed.roles || []
    const get = (id: string, fallback: number) => roles.find(r => r.id === id)?.rate ?? fallback
    return {
      youth:            get('off_youth',   DEFAULT_PAY_RATES.youth),
      hs:               get('off_hs',      DEFAULT_PAY_RATES.hs),
      college:          get('off_college', DEFAULT_PAY_RATES.college),
      scorekeeper:      get('scorekeeper', DEFAULT_PAY_RATES.scorekeeper),
      athletic_trainer: get('atc',         DEFAULT_PAY_RATES.athletic_trainer),
      field_ops:        get('field_ops',   DEFAULT_PAY_RATES.field_ops),
      assigner:         get('assigner',    DEFAULT_PAY_RATES.assigner),
    }
  } catch {
    return { ...DEFAULT_PAY_RATES }
  }
}
