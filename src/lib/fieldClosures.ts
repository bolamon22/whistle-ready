// Per-day field closures for the scheduler. A field can be shut for a whole day
// ("3B is off on Saturday") or for part of it ("3B is ours until 1 PM, then the
// park turns it into one big field"). Closures live on the venue's per-day
// availability entry (defaultAvailability[date].closures) so every device and
// the assigner's mirror see the same board.
//
// Legacy: the first cut stored all-day closures as closedFields: string[]. It is
// still read, and the next save rewrites it into closures[].

export interface Closure {
  field: string          // field fullName ("Venue · 3B")
  from?: string | null   // "HH:MM" inclusive; null/absent = from the start of the day
  to?: string | null     // "HH:MM" exclusive; null/absent = through the end of the day
}

export const hmToMin = (s: string): number => {
  const p = String(s || '').split(':'); const h = parseInt(p[0]); const m = parseInt(p[1] || '0')
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m)
}

/** Closures recorded on one day's availability entry (either storage shape). */
export function closuresOf(dayEntry: any): Closure[] {
  const out: Closure[] = []
  if (Array.isArray(dayEntry?.closedFields)) for (const f of dayEntry.closedFields) if (typeof f === 'string') out.push({ field: f })
  if (Array.isArray(dayEntry?.closures)) for (const c of dayEntry.closures) if (c && typeof c.field === 'string') out.push({ field: c.field, from: c.from || null, to: c.to || null })
  return out
}

export const isAllDay = (c: Closure) => !c.from && !c.to

/** Is this field closed at this start time? A game starting inside the window is blocked. */
export function isFieldClosedAt(closures: Closure[], field: string, time: string): boolean {
  const t = hmToMin(time)
  return closures.some(c => c.field === field && (isAllDay(c) || ((!c.from || t >= hmToMin(c.from)) && (!c.to || t < hmToMin(c.to)))))
}

/** Is any part of the day closed for this field? (header styling, dialog state) */
export function fieldClosure(closures: Closure[], field: string): Closure | null {
  return closures.find(c => c.field === field) ?? null
}

/** Short header text: "Closed today", "Closed from 1:00 PM", "Closed until 1:00 PM", "Closed 1:00–3:00 PM". */
export function closureLabel(c: Closure | null, fmtTime: (t: string) => string): string | null {
  if (!c) return null
  if (isAllDay(c)) return 'Closed today'
  if (c.from && c.to) return `Closed ${fmtTime(c.from)}–${fmtTime(c.to)}`
  if (c.from) return `Closed from ${fmtTime(c.from)}`
  return `Closed until ${fmtTime(c.to!)}`
}

/** Replace this field's closure on a day entry (null removes it). Writes the new shape only. */
export function withClosure(dayEntry: any, field: string, next: Closure | null): any {
  const rest = closuresOf(dayEntry).filter(c => c.field !== field)
  const { closedFields: _legacy, ...entry } = dayEntry ?? {}
  return { ...entry, closures: next ? [...rest, next] : rest }
}

/** `${time}|${field}` keys Auto-fill must treat as taken on this day. */
export function blockedKeys(closures: Closure[], fields: { fullName: string }[], slots: string[]): string[] {
  const out: string[] = []
  for (const f of fields) {
    if (!closures.some(c => c.field === f.fullName)) continue
    for (const s of slots) if (isFieldClosedAt(closures, f.fullName, s)) out.push(`${s}|${f.fullName}`)
  }
  return out
}
