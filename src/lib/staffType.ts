// Unpaid staff (Bo, Oct 23 2026, for James Vacco and every org): volunteers and refs in
// training follow a schedule and do everything paid staff do, but are never paid. A Staff
// Pool record's type is '' (paid, the default), 'volunteer' or 'trainee'. Pure: the
// server side is lib/staffTypeDb.
//
// What unpaid means, everywhere it is read:
// - a game they work is priced $0 (api/assignments, auto-assign, lib/repricePay) and its
//   pay can't be edited by hand (api/assignments/[id]/pay);
// - they stay off the pay sheet, the 1099 export and the tournament director's bill,
//   which show a count of their games instead;
// - their own pages ask for no payment method or W-9 and show no pay;
// - a ref in training rides along in a game's extra TR slot (TRAINEE_ROLE), which never
//   counts toward the crew, so the game still needs its refs.

export type StaffType = '' | 'volunteer' | 'trainee'

export const STAFF_TYPES: { value: StaffType; label: string; short: string }[] = [
  { value: '', label: 'Paid', short: 'Paid' },
  { value: 'volunteer', label: 'Volunteer', short: 'Volunteer' },
  { value: 'trainee', label: 'Ref in training', short: 'In training' },
]

/** A stored or posted value as a type; anything unknown is paid (''). */
export function staffTypeOf(v: unknown): StaffType {
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'volunteer' || s === 'trainee' ? s : ''
}

export const isUnpaid = (v: unknown): boolean => staffTypeOf(v) !== ''

export const staffTypeLabel = (v: unknown): string => STAFF_TYPES.find(t => t.value === staffTypeOf(v))!.label
export const staffTypeShort = (v: unknown): string => STAFF_TYPES.find(t => t.value === staffTypeOf(v))!.short

/** A game's ride-along slot for a ref in training. Kept out of GRID_ROLES on purpose:
 *  everything that counts a crew (coverage, Needs crew, auto-assign) reads GRID_ROLES,
 *  so a trainee on a game never makes it look reffed. */
export const TRAINEE_ROLE = { value: 'trainee', label: 'Ref in training', short: 'TR', color: '#475569' } as const
export const isTraineeRole = (role: unknown): boolean => role === TRAINEE_ROLE.value
