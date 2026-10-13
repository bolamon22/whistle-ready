// Client-safe helpers for "who's on" / "last on". The server stores SQLite
// datetime('now') text (UTC, "YYYY-MM-DD HH:MM:SS"); parse it as UTC.

/** Someone counts as "on now" if their app pinged within this window. The app
 *  pings every 2 minutes while a tab is visible, so 5 minutes allows one miss. */
export const ONLINE_MS = 5 * 60_000

export function parseDbTime(s: string | null | undefined): number | null {
  if (!s) return null
  const t = Date.parse(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s)) ? '' : 'Z'))
  return Number.isFinite(t) ? t : null
}

export function isOnline(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  const t = parseDbTime(lastSeenAt)
  return t !== null && now - t < ONLINE_MS
}

/** "just now", "12m ago", "3h ago", "yesterday", "4d ago", then a date. */
export function agoLabel(s: string | null | undefined, now = Date.now()): string {
  const t = parseDbTime(s)
  if (t === null) return ''
  const m = Math.max(0, Math.round((now - t) / 60_000))
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d === 1) return 'yesterday'
  if (d < 14) return `${d}d ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** One line for a staff member: "On now", "Last on 3h ago", "Never logged in", "No app login". */
export function presenceLabel(w: { appStatus?: string | null; lastSeenAt?: string | null; lastLoginAt?: string | null }, now = Date.now()): string {
  if (w.appStatus && w.appStatus !== 'registered') return w.appStatus === 'invited' ? 'Invited, no login yet' : 'No app login'
  if (isOnline(w.lastSeenAt, now)) return 'On now'
  const last = w.lastSeenAt || w.lastLoginAt
  return last ? `Last on ${agoLabel(last, now)}` : 'Not seen yet'
}

/** Roles that run events and may see who else is on. Refs/staff, coaches,
 *  parents and club directors do not. */
export const PRESENCE_VIEWER_ROLES = ['admin', 'director', 'assigner', 'scheduler', 'field_director']
export function canSeePresence(role: string | null | undefined): boolean { return PRESENCE_VIEWER_ROLES.includes(String(role || '')) }
