// Field request quick picks, shared by the Field Request board (ops page) and
// the live scorer's Request sheet so both send the same wording to the same group.

export const FIELD_REQUEST_GROUPS: { key: string; label: string }[] = [
  { key: 'all', label: 'All staff' },
  { key: 'fieldops', label: 'Field Ops' },
  { key: 'medical', label: 'Medical' },
  { key: 'refs', label: 'Refs' },
  { key: 'scorekeepers', label: 'Scorekeepers' },
  { key: 'assigners', label: 'Assigners' },
]

export const FIELD_REQUEST_TEMPLATES: { label: string; make: (f: string) => string; group: string }[] = [
  { label: 'Trainer needed', make: f => `Trainer needed on Field ${f || '?'}`, group: 'medical' },
  { label: 'Balls — yellow', make: f => `Yellow balls needed on Field ${f || '?'}`, group: 'fieldops' },
  { label: 'Balls — white',  make: f => `White balls needed on Field ${f || '?'}`, group: 'fieldops' },
  { label: 'Water needed',   make: f => `Water needed on Field ${f || '?'}`, group: 'fieldops' },
  { label: 'Ref needed',     make: f => `Referee needed on Field ${f || '?'}`, group: 'refs' },
  { label: 'No team at field', make: f => `No team at Field ${f || '?'}`, group: 'all' },
]

export const FIELD_REQUEST_URGENCIES = ['Low', 'Medium', 'High']

/** "Village Park Athletics Complex - Field 5" -> "5" ('' when there's no field number). */
export function fieldNumberFrom(location: string | null | undefined): string {
  const m = String(location || '').match(/field\s*#?\s*([A-Za-z0-9]+)/i)
  return m ? m[1] : ''
}
