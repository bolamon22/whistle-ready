import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { loadClearedPlayers } from '@/lib/socialPlayers'

export const dynamic = 'force-dynamic'

// GET /api/social/players — the scheduler's "Cleared to post" tray: every player at
// an upcoming event whose family said Yes to social posts, with their handles and
// what's already scheduled for them (lib/socialPlayers). Staff of the org only.
export async function GET() {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  if (!gate.orgId) return NextResponse.json({ players: [], waiting: 0, passOn: false })
  try {
    return NextResponse.json(await loadClearedPlayers(gate.orgId))
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not load cleared players', players: [], waiting: 0, passOn: false }, { status: 500 })
  }
}
