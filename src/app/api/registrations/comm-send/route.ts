import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireStaff } from '@/lib/apiAuth'
import { runCommSend, isSendKind, type SendKind } from '@/lib/commSend'
import { OFFICE_CC } from '@/lib/email'
import { createScheduled } from '@/lib/commSchedule'

// Send a club letter now, or queue it for later (Bo). The letter/preview/tracking
// all live in src/lib/commSend.ts so the cron runs identical code.

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { tournamentId?: unknown; kind?: unknown; regIds?: unknown; subject?: unknown; body?: unknown; sendAt?: unknown; test?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }

  const tournamentId = String(body.tournamentId ?? '')
  const kind = String(body.kind ?? '')
  const regIds = (Array.isArray(body.regIds) ? body.regIds : []).map(x => String(x)).filter(Boolean)
  const subject = String(body.subject ?? '')
  const letterBody = String(body.body ?? '')

  // A test copy to the signed-in staffer. Same runCommSend the real send and the
  // cron use -- a test down a second code path proves nothing -- but it writes
  // no tracking, mints no claim token and sends no receipt. The address comes
  // from the session, never the request body: a typo here would mean a club
  // letter landing on a stranger.
  if (body.test === true) {
    const me = String((gate.session?.user as { email?: string } | undefined)?.email || '').trim().toLowerCase()
    if (!me) return NextResponse.json({ error: 'Your account has no email address to send to' }, { status: 400 })
    if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })
    if (!isSendKind(kind)) return NextResponse.json({ error: 'Unknown letter kind' }, { status: 400 })
    if (!regIds.length) return NextResponse.json({ error: 'Pick a club for the test to be built from' }, { status: 400 })
    const t = await runCommSend({
      tournamentId, kind: kind as SendKind, regIds: regIds.slice(0, 1),
      subject, body: letterBody, testTo: me,
    })
    if (!t.ok) return NextResponse.json({ error: t.error }, { status: t.status })
    return NextResponse.json({ ok: true, test: true, to: me, results: t.results })
  }

  // Queued for later: store what was on screen, exactly as a Send-now would use it.
  const sendAt = String(body.sendAt ?? '').trim()
  if (sendAt) {
    const when = new Date(sendAt)
    if (isNaN(when.getTime())) return NextResponse.json({ error: 'Bad send time' }, { status: 400 })
    if (when.getTime() < Date.now() - 60_000) return NextResponse.json({ error: 'Pick a time in the future' }, { status: 400 })
    if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })
    if (!isSendKind(kind)) return NextResponse.json({ error: 'Unknown letter kind' }, { status: 400 })
    if (!regIds.length) return NextResponse.json({ error: 'Pick at least one club' }, { status: 400 })
    if (regIds.length > 100) return NextResponse.json({ error: 'Max 100 clubs per send' }, { status: 400 })
    const session = await getServerSession(authOptions)
    const scheduled = await createScheduled({
      tournamentId, kind: kind as SendKind, regIds, subject, body: letterBody,
      sendAt: when.toISOString(),
      createdBy: String((session?.user as { name?: string; email?: string } | undefined)?.name || (session?.user as { email?: string } | undefined)?.email || ''),
    })
    return NextResponse.json({ ok: true, scheduled })
  }

  // Same reasoning as the returning-team invites: a receipt is the only durable
  // record that an immediate send happened.
  const res = await runCommSend({ tournamentId, kind: kind as SendKind, regIds, subject, body: letterBody, notifyTo: OFFICE_CC })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ ok: true, sentAt: res.sentAt, results: res.results })
}
