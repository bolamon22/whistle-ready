// Game start times are stored as 24-hour "HH:MM" (e.g. "14:40"). Families read
// 12-hour time, so every page they see formats through here. Safe on values that
// already carry AM/PM and on blanks (returns the fallback).
export function time12(t: string | null | undefined, fallback = 'TBD'): string {
  const s = (t || '').trim()
  if (!s) return fallback
  if (/[ap]\.?m\.?$/i.test(s)) return s.toUpperCase().replace(/\s*([AP])\.?M\.?$/, ' $1M')
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return s
  const h = parseInt(m[1], 10)
  return `${h % 12 || 12}:${m[2]} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`
}
