import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { listScheduled, cancelScheduled, getQueued, updateScheduled } from '@/lib/commSchedule'
import { unknownFields } from '@/lib/customLetters'

// What's queued for a tournament, changing a letter's wording or cancelling one before it goes.

export async function GET(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const tournamentId = String(new URL(req.url).searchParams.get('tournamentId') || '')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })
  return NextResponse.json({ scheduled: await listScheduled(tournamentId) })
}

export async function DELETE(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  const url = new URL(req.url)
  const id = String(url.searchParams.get('id') || '')
  const tournamentId = String(url.searchParams.get('tournamentId') || '')
  if (!id || !tournamentId) return NextResponse.json({ error: 'id and tournamentId required' }, { status: 400 })
  const done = await cancelScheduled(id, tournamentId)
  if (!done) return NextResponse.json({ error: 'Already sent or gone' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

// New wording for a queued club letter (Bo, Oct 15: "Is there a way i can read and
// edit the letters? some may be too harsh"). Subject and body only: who it goes to
// and when stay as scheduled, so changing those is still Cancel and schedule again.
export async function PATCH(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let b: { id?: unknown; tournamentId?: unknown; subject?: unknown; body?: unknown } = {}
  try { b = await req.json() } catch { /* validated below */ }
  const id = String(b.id ?? '')
  const tournamentId = String(b.tournamentId ?? '')
  const subject = String(b.subject ?? '').trim()
  const body = String(b.body ?? '')
  if (!id || !tournamentId) return NextResponse.json({ error: 'id and tournamentId required' }, { status: 400 })
  if (!subject) return NextResponse.json({ error: 'The subject is empty' }, { status: 400 })
  if (!body.trim()) return NextResponse.json({ error: 'The letter is empty' }, { status: 400 })
  // Refused, not trimmed: a letter cut off mid-sentence would reach every club that way.
  if (subject.length > 200) return NextResponse.json({ error: 'Keep the subject under 200 characters' }, { status: 400 })
  if (body.length > 4000) return NextResponse.json({ error: 'Keep the letter under 4,000 characters' }, { status: 400 })
  const cur = await getQueued(id, tournamentId)
  if (!cur) return NextResponse.json({ error: 'It already went out or was canceled' }, { status: 404 })
  // Returning-team invites fill in different fields (lib/returningInvite) and have no editor yet.
  if (cur.type !== 'comm') return NextResponse.json({ error: 'Only club letters can be changed here' }, { status: 400 })
  // The same check the dialog makes before a send: a {field} this letter's merge
  // doesn't know reaches every club as literal text.
  const bad = unknownFields(`${subject}\n${body}`, cur.kind === 'payment')
  if (bad.length) return NextResponse.json({ error: `${bad.map(f => `{${f}}`).join(', ')} ${bad.length === 1 ? "isn't a fill-in field" : "aren't fill-in fields"} for this letter` }, { status: 400 })
  const saved = await updateScheduled(id, tournamentId, subject, body)
  if (!saved) return NextResponse.json({ error: 'It already went out or was canceled' }, { status: 404 })
  return NextResponse.json({ ok: true, scheduled: saved })
}
