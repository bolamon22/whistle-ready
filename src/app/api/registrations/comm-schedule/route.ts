import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { listScheduled, cancelScheduled } from '@/lib/commSchedule'

// What's queued for a tournament, and cancelling one before it goes.

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
