import { seriesLabelOf } from './eventSeries'

// A person who should be CC'd on a form's internal heads-up for only some of the
// org's recurring events. Stored on each form's config (registration / vendor /
// staff) as `notifyScoped`, alongside the always-on `notifyEmails`/`notifyEmail`.
export type ScopedRecipient = { email: string; series: string[] }

export function cleanScoped(list: any): ScopedRecipient[] {
  if (!Array.isArray(list)) return []
  return list
    .map((r: any) => ({
      email: String(r?.email || '').trim(),
      series: Array.isArray(r?.series) ? r.series.map((s: any) => String(s || '').trim()).filter(Boolean) : [],
    }))
    .filter((r: ScopedRecipient) => r.email.includes('@'))
}

/** Emails ticked for a single event label (team registration = one tournament). */
export function scopedEmailsForSeries(list: any, seriesLabel: string): string[] {
  const l = String(seriesLabel || '')
  if (!l) return []
  return cleanScoped(list).filter(r => r.series.includes(l)).map(r => r.email)
}

/** Emails ticked for ANY of the given tournament names' events (vendor spans several
 *  events; a staffer signs up for several). Matched through seriesLabelOf so it lines
 *  up with scopedEmailsForSeries. */
export function scopedEmailsForEventNames(list: any, names: string[]): string[] {
  const labels = new Set((names || []).map(n => seriesLabelOf(n)).filter(Boolean))
  if (!labels.size) return []
  return cleanScoped(list).filter(r => r.series.some(s => labels.has(s))).map(r => r.email)
}
