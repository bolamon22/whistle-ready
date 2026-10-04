import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { ensureConfirmCols, fileChangeRequest, confirmTeamList } from '@/lib/changeRequest'

// Public confirm/change-request endpoint for a registration — the regId in the
// link IS the secret, same trust model as the public /pay/[regId] page. Clubs
// confirm their team list in one click or send a change request that lands as a
// flag + note on Bo's registrations page (and a heads-up in the office inbox).
// GET returns only club-safe fields: names, divisions, event — never contact or
// payment data. The change request itself lives in lib/changeRequest, shared
// with the club portal's Request a change.

const day = (iso: string) => { const x = new Date(iso); return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

/** Add one line to the registration's staff notes. */
async function appendNote(id: string, current: string | null, entry: string): Promise<string> {
  const notes = (current ?? '').trim() ? `${String(current).trim()}\n${entry}` : entry
  await prisma.teamRegistration.update({ where: { id }, data: { notes } })
  return notes
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await ensureConfirmCols()
  const reg = await prisma.teamRegistration.findUnique({ where: { id: params.id }, include: { teams: true } })
  if (!reg || reg.deletedAt) return NextResponse.json({ error: 'This link is no longer valid' }, { status: 404 })
  const t = await prisma.tournament.findUnique({ where: { id: reg.tournamentId }, select: { name: true, startDate: true, endDate: true } })
  const extra: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
    `SELECT "confirmStatus", "confirmNote", "confirmAt" FROM "TeamRegistration" WHERE id = ?`, params.id)
  return NextResponse.json({
    clubName: reg.clubName,
    tournamentId: reg.tournamentId,   // for the public Chirp on the confirm page
    eventName: t?.name || 'the tournament',
    startDate: t?.startDate || '', endDate: t?.endDate || '',
    teams: reg.teams.map(tm => ({ teamName: tm.teamName, division: tm.division })),
    confirmStatus: String(extra[0]?.confirmStatus || ''),
    confirmAt: String(extra[0]?.confirmAt || ''),
  })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let body: { action?: unknown; message?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }
  const action = String(body.action ?? '')

  await ensureConfirmCols()
  const reg = await prisma.teamRegistration.findUnique({ where: { id: params.id }, include: { teams: true } })
  if (!reg || reg.deletedAt) return NextResponse.json({ error: 'This link is no longer valid' }, { status: 404 })
  const now = new Date().toISOString()

  // Staff-side: mark the requested change as made. The club is NOT confirmed by
  // this (Bo) — they go to 'awaiting' until they re-confirm the updated list.
  // The request text files into the registration's notes first, so there's a
  // record after the flag comes down.
  if (action === 'resolve') {
    const gate = await requireStaff()
    if (!gate.ok) return gate.res
    const cur: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "confirmNote", "confirmAt" FROM "TeamRegistration" WHERE id = ?`, params.id)
    const note = String(cur[0]?.confirmNote || '').trim()
    let notes: string | null = reg.notes ?? null
    if (note) {
      const asked = String(cur[0]?.confirmAt || '')
      notes = await appendNote(params.id, reg.notes ?? null, `[Change request${asked ? ` ${day(asked)}` : ''} — handled ${day(now)}] ${note}`)
    }
    await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "confirmStatus" = 'awaiting', "confirmNote" = '', "confirmAt" = ? WHERE id = ?`, now, params.id)
    return NextResponse.json({ ok: true, notes, status: 'awaiting' })
  }

  if (action === 'confirm') {
    // Shared with the club portal's confirm (lib/changeRequest), which also
    // files an open request into the notes rather than wiping it.
    const done = await confirmTeamList(reg)
    return NextResponse.json({ ok: true, ...done })
  }

  if (action === 'change') {
    const message = String(body.message ?? '').trim().slice(0, 1000)
    if (!message) return NextResponse.json({ error: 'Tell us what changed' }, { status: 400 })
    const filed = await fileChangeRequest(reg, message, 'email')
    return NextResponse.json({ ok: true, status: filed.status, at: filed.at })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
