// Single source of truth for the tournament staff-pay model (the `payRates` column).
//
// This column has TWO historical shapes and both are still in the wild:
//   v1 (legacy): { youth: 50, hs: 60, scorekeeper: 15, ... }        — flat role→rate map
//   v2 (current): { _v:2, roles:[{id,name,rate,rateType}], officialsConfig:{...} }
//
// Two surfaces edit this column (Setup wizard + Settings). When they each owned their
// own parse/serialize, they drifted into writing DIFFERENT shapes, and wizard-set rates
// were silently ignored by payroll. Everything now goes through this file so that
// can't recur. Payroll reads via parsePayRates() in lib/utils.ts, which understands v2.

export interface StaffRole {
  id: string
  name: string
  rate: number
  rateType: 'per_game' | 'hourly'
}

export interface OfficialsConfig {
  roleLabel: string
  standardCount: number
  rules: { keyword: string; count: number }[]
  championshipEnabled: boolean
  championshipCount: number
}

export interface StaffPayConfig {
  roles: StaffRole[]
  officialsConfig: OfficialsConfig
}

export const DEFAULT_ROLES: StaffRole[] = [
  { id: 'off_youth',   name: 'Official – Youth Cert',   rate: 50, rateType: 'per_game' },
  { id: 'off_hs',      name: 'Official – HS Cert',      rate: 60, rateType: 'per_game' },
  { id: 'off_college', name: 'Official – College Cert', rate: 70, rateType: 'per_game' },
  { id: 'scorekeeper', name: 'Scorekeeper',             rate: 15, rateType: 'per_game' },
  { id: 'atc',         name: 'Athletic Trainer',        rate: 25, rateType: 'hourly'   },
  { id: 'field_ops',   name: 'Field Ops',               rate: 20, rateType: 'hourly'   },
  { id: 'assigner',    name: 'Assigner Bonus',          rate: 10, rateType: 'per_game' },
]

export const DEFAULT_OFFICIALS_CONFIG: OfficialsConfig = {
  roleLabel: 'Official',
  standardCount: 2,
  rules: [],
  championshipEnabled: false,
  championshipCount: 2,
}

// Maps the v2 role ids onto the flat v1 keys, so a legacy record keeps its rates.
const V1_KEY_BY_ROLE_ID: Record<string, string> = {
  off_youth: 'youth', off_hs: 'hs', off_college: 'college',
  scorekeeper: 'scorekeeper', atc: 'athletic_trainer',
  field_ops: 'field_ops', assigner: 'assigner',
}

export function newRoleId(): string {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/**
 * Parse the payRates column into the v2 editing model, from ANY stored shape:
 * v2, legacy v1 (migrated), double-encoded (healed), or empty/garbage (defaults).
 */
export function parseStaffPay(raw: any): StaffPayConfig {
  try {
    let parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw
    // Heal legacy double-encoding (JSON stored inside a JSON string).
    if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed) } catch { /* keep */ } }
    if (!parsed || typeof parsed !== 'object') {
      return { roles: [...DEFAULT_ROLES], officialsConfig: { ...DEFAULT_OFFICIALS_CONFIG } }
    }
    if (parsed._v === 2) {
      const roles: StaffRole[] = Array.isArray(parsed.roles) && parsed.roles.length
        ? parsed.roles
        : [...DEFAULT_ROLES]
      return {
        roles,
        officialsConfig: { ...DEFAULT_OFFICIALS_CONFIG, ...(parsed.officialsConfig || {}) },
      }
    }
    // v1 → v2 migration: carry each known rate across, keep defaults for the rest.
    const v1 = parsed as Record<string, number>
    return {
      roles: DEFAULT_ROLES.map(r => ({ ...r, rate: v1[V1_KEY_BY_ROLE_ID[r.id]] ?? r.rate })),
      officialsConfig: { ...DEFAULT_OFFICIALS_CONFIG },
    }
  } catch {
    return { roles: [...DEFAULT_ROLES], officialsConfig: { ...DEFAULT_OFFICIALS_CONFIG } }
  }
}

/** Serialize to the canonical v2 string. Send this straight to PATCH payRates. */
export function serializeStaffPay(cfg: StaffPayConfig): string {
  return JSON.stringify({ _v: 2, roles: cfg.roles, officialsConfig: cfg.officialsConfig })
}

/** The divisionRules map derived from officials exceptions (keyword → count). */
export function officialsRulesToDivisionRules(cfg: OfficialsConfig): Record<string, number> {
  return Object.fromEntries(cfg.rules.map(r => [r.keyword, r.count]))
}
