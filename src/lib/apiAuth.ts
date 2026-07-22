import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

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

async function base(): Promise<{ session: any; role: string } | { res: NextResponse }> {
  const session = await getServerSession(authOptions)
  if (!session) return { res: NextResponse.json({ error: 'Sign in required' }, { status: 401 }) }
  const role = ((session.user as any)?.role as string) || ''
  return { session, role }
}

function ok(session: any): AuthResult {
  return {
    ok: true,
    session,
    role: ((session.user as any)?.role as string) || '',
    userId: (session.user as any)?.id as string,
    orgId: ((session.user as any)?.orgId as string | null) ?? null,
  }
}

/** Any logged-in staff member (i.e. not a coach/parent/club_director). */
export async function requireStaff(): Promise<AuthResult> {
  const b = await base()
  if ('res' in b) return { ok: false, res: b.res }
  if (b.role === 'admin') return ok(b.session)
  if (EXTERNAL_ROLES.includes(b.role) || !b.role) {
    return { ok: false, res: NextResponse.json({ error: 'Staff access required' }, { status: 403 }) }
  }
  return ok(b.session)
}

/** Tournament director (or admin) only — for destructive or high-trust actions. */
export async function requireDirector(): Promise<AuthResult> {
  const b = await base()
  if ('res' in b) return { ok: false, res: b.res }
  if (b.role === 'admin' || b.role === 'director') return ok(b.session)
  return { ok: false, res: NextResponse.json({ error: 'Only the tournament director can do this' }, { status: 403 }) }
}
