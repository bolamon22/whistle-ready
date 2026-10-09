import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { prefillFor } from '@/lib/parentWaivers'

export const dynamic = 'force-dynamic'

// GET /api/parent/prefill?event=<tournament id>
// What the player waiver can fill in for a signed-in parent: their players and
// family details from the waivers in their account (lib/parentWaivers prefillFor).
// Only waivers linked to this login, never looked up by email. Signed out: 401,
// and the form offers "Sign in and we'll fill this in" instead.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = String(session?.user?.id || '')
  if (!userId) return NextResponse.json({ signedIn: false }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } })
  const event = String(new URL(req.url).searchParams.get('event') || '').slice(0, 64)
  let forDate = new Date().toISOString().slice(0, 10)
  if (event) {
    const t = await prisma.tournament.findUnique({ where: { id: event }, select: { startDate: true } }).catch(() => null)
    if (t?.startDate) forDate = String(t.startDate).slice(0, 10)
  }
  const pre = await prefillFor(userId, forDate).catch(() => ({ players: [], family: {} }))
  return NextResponse.json({ signedIn: true, ...pre }, { headers: { 'Cache-Control': 'private, no-store' } })
}
