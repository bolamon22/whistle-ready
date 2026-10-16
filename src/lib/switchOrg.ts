// The org switcher's one move (lib/orgMembers), shared by the top bar and
// /switch-org: ask lib/auth to work in another organization, then load the app fresh
// so every page, menu and list is that organization's. lib/auth only honors an
// organization the login belongs to, so a stale or forged id changes nothing.
// No database import: client components use this.

type Update = (data?: unknown) => Promise<unknown>

/** True when the login now works in `orgId` (null = its home). */
export async function switchOrg(update: Update, orgId: string | null): Promise<boolean> {
  try {
    const s = await update({ activeOrgId: orgId }) as { user?: { orgId?: string | null } } | null
    if (!s) return false
    return orgId === null || (s.user?.orgId ?? null) === orgId
  } catch { return false }
}

/** Only a path on this site: /switch-org?next= must never send anyone elsewhere. */
export function safeNext(raw: string | null | undefined): string {
  const v = String(raw || '')
  return v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/'
}
