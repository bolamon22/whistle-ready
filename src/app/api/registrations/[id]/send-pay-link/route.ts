import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { sendEmail, orgSender } from '@/lib/email'
import { orgForTournament } from '@/lib/org'
import { payLetterFor, buildPayReminderEmail } from '@/lib/payLetter'

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Staff-only: email the club contact their public pay link for this registration.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  try {
    const reg = await prisma.teamRegistration.findUnique({
      where: { id: params.id },
      include: { teams: true, payments: true },
    })
    if (!reg || reg.deletedAt) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    if (!reg.contactEmail) return NextResponse.json({ error: 'No contact email on this registration' }, { status: 400 })

    const paid = reg.payments.reduce((s, p) => s + p.amount, 0)
    const due = (reg.invoiceAmount || 0) - (reg.discountAmount || 0)
    const balance = Math.round(Math.max(0, due - paid) * 100) / 100
    if (balance <= 0) return NextResponse.json({ error: 'No balance due on this registration — set the invoice amount first (Edit) if this is wrong.' }, { status: 400 })

    const tournament = await prisma.tournament.findUnique({ where: { id: reg.tournamentId }, select: { name: true } })
    const tName = tournament?.name || 'the tournament'
    const origin = req.headers.get('origin') || `https://${req.headers.get('host') || 'whistleready.app'}`
    const link = `${origin}/pay/${reg.id}`
    const totalWithFee = Math.round(balance * 1.03 * 100) / 100
    const org = await orgForTournament(reg.tournamentId)
    const teamsLabel = `${reg.teams.length} team${reg.teams.length !== 1 ? 's' : ''}`

    // The note on top is the org-editable reminder letter (Bo) — previewed and
    // optionally tweaked per send on the registrations page; the invoice table,
    // Pay button, and fee note below it are fixed so the mechanics can't break.
    let overrides: { subject?: unknown; body?: unknown } = {}
    try { overrides = await req.json() } catch { /* no body = use the saved letter */ }
    const letter = await payLetterFor((org as { id?: string } | null)?.id ?? null)
    const { subject, html, text } = buildPayReminderEmail({
      clubName: reg.clubName, clubContact: reg.clubContact, teamsCount: reg.teams.length,
      tName, link, due, paid, balance,
      orgName: org?.name || 'the tournament team',
      subjectTpl: String(overrides.subject ?? '').trim().slice(0, 200) || letter.subject,
      bodyTpl: String(overrides.body ?? '').trim().slice(0, 4000) || letter.body,
    })

    const result = await sendEmail({
      to: reg.contactEmail,
      subject,
      html, text,
      ...orgSender(org),
    })
    if (!result.ok) return NextResponse.json({ error: result.error || 'Email failed to send' }, { status: 502 })

    // Reminder date lives on the registration so the page can show "Reminded Sep 9"
    // (raw column, house pattern — not in schema.prisma)
    const now = new Date().toISOString()
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "lastPayReminderAt" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
    try { await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "lastPayReminderAt" = ? WHERE id = ?`, now, reg.id) } catch { /* best effort */ }
    return NextResponse.json({ ok: true, lastPayReminderAt: now })
  } catch (e: any) {
    console.error('send-pay-link failed:', e)
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}
