import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { sendEmail, orgSender, OFFICE_CC } from '@/lib/email'
import { orgForTournament } from '@/lib/org'

// Public confirm/change-request endpoint for a registration — the regId in the
// link IS the secret, same trust model as the public /pay/[regId] page. Clubs
// confirm their team list in one click or send a change request that lands as a
// flag + note on Bo's registrations page (and a heads-up in the office inbox).
// GET returns only club-safe fields: names, divisions, event — never contact or
// payment data.

const APP_URL = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL (stale in prod)

async function ensureConfirmCols() {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "confirmStatus" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "confirmNote" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "confirmAt" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
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
      const d = (iso: string) => { const x = new Date(iso); return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
      const entry = `[Change request${asked ? ` ${d(asked)}` : ''} — handled ${d(now)}] ${note}`
      notes = ((reg.notes ?? '').trim() ? `${String(reg.notes).trim()}\n${entry}` : entry)
      await prisma.teamRegistration.update({ where: { id: params.id }, data: { notes } })
    }
    await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "confirmStatus" = 'awaiting', "confirmNote" = '', "confirmAt" = ? WHERE id = ?`, now, params.id)
    return NextResponse.json({ ok: true, notes, status: 'awaiting' })
  }

  if (action === 'confirm') {
    await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "confirmStatus" = 'confirmed', "confirmNote" = '', "confirmAt" = ? WHERE id = ?`, now, params.id)
    return NextResponse.json({ ok: true, status: 'confirmed', at: now })
  }

  if (action === 'change') {
    const message = String(body.message ?? '').trim().slice(0, 1000)
    if (!message) return NextResponse.json({ error: 'Tell us what changed' }, { status: 400 })
    await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "confirmStatus" = 'change_requested', "confirmNote" = ?, "confirmAt" = ? WHERE id = ?`, message, now, params.id)

    // Office heads-up so a change request never sits unseen until the next page visit
    try {
      const t = await prisma.tournament.findUnique({ where: { id: reg.tournamentId }, select: { name: true } })
      const org = await orgForTournament(reg.tournamentId)
      const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
      await sendEmail({
        ...orgSender(org),
        to: OFFICE_CC,
        subject: `Change request — ${reg.clubName} (${t?.name || 'tournament'})`,
        html: `<div style="font-family: sans-serif; max-width: 440px; margin: 0 auto; padding: 28px 24px;">
          <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 0 0 4px;">${esc(reg.clubName)} requested a change</h2>
          <p style="color: #64748b; font-size: 13px; margin: 0 0 14px;">${esc(t?.name || 'the tournament')} · from the confirm-your-teams email</p>
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 12px 14px; color: #713f12; font-size: 14px; white-space: pre-line;">${esc(message)}</div>
          <a href="${APP_URL}/tournaments/${reg.tournamentId}/registrations"
            style="display: inline-block; margin-top: 18px; background: #14b8a6; color: white; font-weight: 600; font-size: 13px; padding: 10px 22px; border-radius: 10px; text-decoration: none;">
            Open registrations &rarr;
          </a>
        </div>`,
      })
    } catch { /* flag on the page is the record; email is a bonus */ }
    return NextResponse.json({ ok: true, status: 'change_requested', at: now })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
