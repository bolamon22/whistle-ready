import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'
import { authOptions } from '@/lib/auth'
import { PREVIEW_ROLES, canSeeMoney, canSeeStaffPay } from '@/lib/roleScope'
import { roleHasFeature } from './routeAccess'

// Shared authorization for API route handlers.
//
// Middleware does NOT gate `/api/*` — it passes every API request through on the
// assumption that each route checks for itself. Many tournament write routes did not,
// which left them callable with no login at all (a tournament could be deleted, or
// scores/finances altered, by anyone who knew an id). These helpers make the check
// one consistent call so it can't be forgotten or written five different ways.
//
// Usage:
//   const gate = await requireStaff()
//   if (!gate.ok) return gate.res
//   const { role } = gate            // gate.session / gate.userId also available

// External (non-staff) roles: real people who log in, but who must never edit
// tournament operations. Everyone else is staff.
const EXTERNAL_ROLES = ['coach', 'parent', 'club_director']

export type AuthResult =
  | { ok: true; session: any; role: string; userId: string; orgId: string | null }
  | { ok: false; res: NextResponse }

// "View as": an admin previewing a role gets that role's answers from the API
// too, not just its pages. Otherwise the preview showed the pages a scheduler
// can open filled with data only an admin can see, which is exactly what the
// preview exists to check. Only an admin's cookie is honored, and only for a
// known role.
function previewRoleFor(realRole: string): string | null {
  if (realRole !== 'admin') return null
  try {
    const v = cookies().get('preview-role')?.value || ''
    return (PREVIEW_ROLES as readonly string[]).includes(v) ? v : null
  } catch { return null }   // outside a request (scripts, build): no preview
}

async function base(): Promise<{ session: any; role: string } | { res: NextResponse }> {
  const session = await getServerSession(authOptions)
  if (!session) return { res: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  const real = ((session.user as any)?.role as string) || ''
  return { session, role: previewRoleFor(real) ?? real }
}

/** The role this request should be answered as: the signed-in role, or the role an
 *  admin is previewing. '' when nobody is signed in. Never blocks. */
export async function viewerRole(): Promise<string> {
  const b = await base()
  return 'res' in b ? '' : b.role
}

function ok(session: any, role?: string): AuthResult {
  return {
    ok: true,
    session,
    role: role ?? (((session.user as any)?.role as string) || ''),
    userId: (session.user as any)?.id as string,
    orgId: ((session.user as any)?.orgId as string | null) ?? null,
  }
}

/** Any logged-in staff member (i.e. not a coach/parent/club_director). */
export async function requireStaff(): Promise<AuthResult> {
  const b = await base()
  if ('res' in b) return { ok: false, res: b.res }
  if (b.role === 'admin') return ok(b.session, b.role)
  if (EXTERNAL_ROLES.includes(b.role) || !b.role) {
    return { ok: false, res: NextResponse.json({ error: 'Staff access required' }, { status: 403 }) }
  }
  return ok(b.session, b.role)
}

/** Dollar amounts (invoices, payments, income, expenses): director or admin.
 *  Staff such as the scheduler are signed-in staff but must not see these. */
export async function requireMoney(): Promise<AuthResult> {
  const b = await base()
  if ('res' in b) return { ok: false, res: b.res }
  if (canSeeMoney(b.role)) return ok(b.session, b.role)
  return { ok: false, res: NextResponse.json({ error: 'Financial access required' }, { status: 403 }) }
}

/** True when the caller is logged-in staff. Never blocks — for routes that serve
 *  everyone but must show the public less (contact info, unpublished schedule). */
export async function isStaffRequest(): Promise<boolean> {
  const b = await base()
  if ('res' in b) return false
  if (b.role === 'admin') return true
  return !!b.role && !EXTERNAL_ROLES.includes(b.role)
}

/** Staff pay (pay records, pay summary): director, admin, or the assigner who sets ref pay. */
export async function requireStaffPay(): Promise<AuthResult> {
  const b = await base()
  if ('res' in b) return { ok: false, res: b.res }
  if (canSeeStaffPay(b.role)) return ok(b.session, b.role)
  return { ok: false, res: NextResponse.json({ error: 'Pay access required' }, { status: 403 }) }
}

/** Staff whose role has this feature in role-permissions.json, the same switch that
 *  decides which pages they can open. A page being hidden is not enough when its
 *  data is one fetch away: the assigner is staff, but has no business reading
 *  player waivers (minors' details) or vendor and media applications. */
export async function requireFeature(feature: string): Promise<AuthResult> {
  const b = await base()
  if ('res' in b) return { ok: false, res: b.res }
  if (b.role === 'admin') return ok(b.session, b.role)
  if (!EXTERNAL_ROLES.includes(b.role) && b.role && roleHasFeature(b.role, feature)) return ok(b.session, b.role)
  return { ok: false, res: NextResponse.json({ error: 'Your role does not have access to this' }, { status: 403 }) }
}

/** Tournament director (or admin) only — for destructive or high-trust actions. */
export async function requireDirector(): Promise<AuthResult> {
  const b = await base()
  if ('res' in b) return { ok: false, res: b.res }
  if (b.role === 'admin' || b.role === 'director') return ok(b.session, b.role)
  return { ok: false, res: NextResponse.json({ error: 'Only the tournament director can do this' }, { status: 403 }) }
}
