import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { workerIdForEmail } from '@/lib/staffW9'
import { setCheckIn } from '@/lib/staffCheckIn'

// POST { gameId, undo? } -- the signed-in staff member checks in for one of their
// own games (staff home page). The Worker comes from the session email, so nobody
// can check someone else in; a game they aren't on changes nothing and 404s.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const gameId = String(body?.gameId || '')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  const workerId = await workerIdForEmail(String(session.user?.email || ''))
  if (!workerId) return NextResponse.json({ error: 'No staff profile for this login' }, { status: 404 })
  try {
    const r = await setCheckIn(gameId, workerId, !body?.undo)
    if (!r.changed) return NextResponse.json({ error: "You're not on this game" }, { status: 404 })
    return NextResponse.json({ ok: true, checkedInAt: r.at })
  } catch {
    return NextResponse.json({ error: 'Could not save check-in' }, { status: 500 })
  }
}
