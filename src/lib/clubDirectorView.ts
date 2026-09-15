import { NextResponse } from 'next/server'

// Whose club portal is a /api/club-director/* request for?
//
// Bo asked to open a club's own portal from the green "Account" chip on the
// registrations page, so he can see exactly what the director sees instead of
// reading a bug report and guessing (Sep 15 2026). Every club-director route
// therefore accepts `?userId=`, and the rule for who may pass it lives here so
// the four routes can't drift apart — data/ and history/ used to ignore the
// param entirely, which would have silently shown Bo his OWN (empty) portal.
//
// Staff who can already open the registrations page (admin + director) see the
// club's teams, players and balance there anyway, so viewing the portal exposes
// nothing new. Every other role — including a club director — may only ever
// read their own.

export type ViewAs =
  | { ok: true; userId: string; viewingOther: boolean }
  | { ok: false; res: NextResponse }

export function viewAs(session: any, requested: string | null | undefined): ViewAs {
  const self = String(session?.user?.id ?? '')
  const role = String(session?.user?.role ?? '')
  const userId = String(requested || '') || self
  if (!userId || userId === self) return { ok: true, userId: self, viewingOther: false }
  if (role !== 'admin' && role !== 'director') {
    return { ok: false, res: NextResponse.json({ error: 'Not allowed to view another club’s portal' }, { status: 403 }) }
  }
  return { ok: true, userId, viewingOther: true }
}
