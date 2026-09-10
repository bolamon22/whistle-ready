import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { requireStaff } from '@/lib/apiAuth'
import { runReturningInvite, type InviteClub } from '@/lib/returningInvite'
import { createScheduled } from '@/lib/commSchedule'

// Invite past-event clubs back — now, or queued for later (Bo). The send itself
// lives in src/lib/returningInvite.ts so the cron runs identical code.

export async function POST(req: Request, { params }: { params: { id: string } }) {
  // Auth (Jul 2026 sweep): staff only — was previously callable with no auth.
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  const body = await req.json() as {
    clubs: InviteClub[]
    subjectTemplate?: string
    bodyTemplate?: string
    sendAt?: string
  }
  const { clubs } = body
  if (!clubs?.length) return NextResponse.json({ error: 'clubs required' }, { status: 400 })

  const sendAt = String(body.sendAt || '').trim()
  if (sendAt) {
    const when = new Date(sendAt)
    if (isNaN(when.getTime())) return NextResponse.json({ error: 'Bad send time' }, { status: 400 })
    if (when.getTime() < Date.now() - 60_000) return NextResponse.json({ error: 'Pick a time in the future' }, { status: 400 })
    if (clubs.length > 300) return NextResponse.json({ error: 'Max 300 clubs per scheduled send' }, { status: 400 })
    const session = await getServerSession(authOptions)
    const scheduled = await createScheduled({
      tournamentId: params.id,
      type: 'returning',
      kind: 'returning',              // the kind column is for club letters; type drives dispatch
      regIds: [],
      subject: String(body.subjectTemplate || ''),
      body: String(body.bodyTemplate || ''),
      payload: { clubs },
      sendAt: when.toISOString(),
      createdBy: String((session?.user as { name?: string; email?: string } | undefined)?.name || (session?.user as { email?: string } | undefined)?.email || ''),
    })
    return NextResponse.json({ ok: true, scheduled })
  }

  const res = await runReturningInvite({
    tournamentId: params.id, clubs,
    subjectTemplate: body.subjectTemplate, bodyTemplate: body.bodyTemplate,
  })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json({ sent: res.sent, errors: res.errors, skippedDupes: res.skippedDupes })
}
