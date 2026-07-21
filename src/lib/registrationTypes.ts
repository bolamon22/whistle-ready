// Which registration forms a tournament offers, and the settings for individual
// (free-agent) registration.
//
// This lives in one place because the Setup wizard and the Settings page both edit it.
// When the staff-pay model was duplicated across those two screens they drifted and
// wizard-set rates were silently discarded by payroll — so: one model, one editor.
//
// Storage note: these are raw TEXT/INTEGER columns on Tournament, not Prisma fields.
// The API must read them explicitly; `...tournament` will not include them.

export type RegTier = { id: string; name: string; price: number; description: string }

export type RegistrationTypes = {
  teamEnabled: boolean
  individualEnabled: boolean
  description: string
  tiers: RegTier[]
  positions: string[]
  sizes: string[]
}

export const DEFAULT_POSITIONS = ['Attack', 'Midfield', 'Defense', 'Goalie', 'Utility/Other']
export const DEFAULT_SIZES = ['YS', 'YM', 'YL', 'S', 'M', 'L', 'XL', 'XXL']

export const DEFAULT_REGISTRATION_TYPES: RegistrationTypes = {
  teamEnabled: true,
  individualEnabled: false,
  description: '',
  tiers: [],
  positions: DEFAULT_POSITIONS,
  sizes: DEFAULT_SIZES,
}

function parseList(raw: any, fallback: string[]): string[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
    return Array.isArray(v) && v.length > 0 ? v.filter((x: any) => typeof x === 'string') : fallback
  } catch { return fallback }
}

/** Build the model from a tournament row as returned by /api/tournaments/[id]. */
export function parseRegistrationTypes(t: any): RegistrationTypes {
  let tiers: RegTier[] = []
  try {
    const v = typeof t?.individualRegTiers === 'string' ? JSON.parse(t.individualRegTiers || '[]') : t?.individualRegTiers
    if (Array.isArray(v)) {
      tiers = v
        .filter((x: any) => x && typeof x === 'object')
        .map((x: any) => ({
          id: String(x.id ?? Date.now().toString()),
          name: String(x.name ?? ''),
          price: Number(x.price) || 0,
          description: String(x.description ?? ''),
        }))
    }
  } catch { /* leave empty */ }

  return {
    // Team registration defaults to ON: a tournament with no value set is open.
    teamEnabled: t?.teamRegEnabled !== false,
    individualEnabled: Boolean(t?.individualRegEnabled),
    description: String(t?.individualRegDescription || ''),
    tiers,
    positions: parseList(t?.individualRegPositions, DEFAULT_POSITIONS),
    sizes: parseList(t?.individualRegSizes, DEFAULT_SIZES),
  }
}

/** The PATCH body fields for /api/tournaments/[id]. */
export function registrationTypesPayload(v: RegistrationTypes) {
  return {
    teamRegEnabled: v.teamEnabled,
    individualRegEnabled: v.individualEnabled,
    individualRegDescription: v.description,
    individualRegTiers: JSON.stringify(v.tiers),
    individualRegPositions: JSON.stringify(v.positions),
    individualRegSizes: JSON.stringify(v.sizes),
  }
}
