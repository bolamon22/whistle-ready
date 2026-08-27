import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { sendEmail, orgSender } from '@/lib/email'
import { orgForTournament } from '@/lib/org'

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

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="color:#0f766e;margin-bottom:4px">${tName}</h2>
  <p>Hi ${reg.clubContact || reg.clubName},</p>
  <p>Here is the payment link for <strong>${reg.clubName}</strong> (${teamsLabel}) at ${tName}. You can pay your balance online by card &mdash; no need to re-register.</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 0;color:#64748b">Invoiced</td><td style="padding:6px 0;text-align:right">${fmt(due)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Paid</td><td style="padding:6px 0;text-align:right">${fmt(paid)}</td></tr>
    <tr><td style="padding:6px 0;font-weight:bold;border-top:1px solid #e2e8f0">Balance due</td><td style="padding:6px 0;text-align:right;font-weight:bold;border-top:1px solid #e2e8f0">${fmt(balance)}</td></tr>
  </table>
  <p style="text-align:center;margin:24px 0">
    <a href="${link}" style="background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">Pay ${fmt(balance)} online</a>
  </p>
  <p style="font-size:13px;color:#64748b">Pay by <strong>bank transfer (ACH) with no fee</strong>, or by card (3% processing fee &mdash; ${fmt(totalWithFee)} total). Prefer to pay by check? Just reply to this email.</p>
  <p style="font-size:13px;color:#64748b">If the button does not work, copy this link into your browser:<br>${link}</p>
</div>`
    const text = `Payment link for ${reg.clubName} (${teamsLabel}) at ${tName}\n\nInvoiced: ${fmt(due)}\nPaid: ${fmt(paid)}\nBalance due: ${fmt(balance)}\n\nPay online — bank transfer (ACH, no fee) or card (3% fee, ${fmt(totalWithFee)} total):\n${link}\n\nPrefer to pay by check? Just reply to this email.`

    const result = await sendEmail({
      to: reg.contactEmail,
      subject: `Payment link for ${reg.clubName} — ${tName}`,
      html, text,
      ...orgSender(org),
    })
    if (!result.ok) return NextResponse.json({ error: result.error || 'Email failed to send' }, { status: 502 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('send-pay-link failed:', e)
    return NextResponse.json({ error: e?.message || 'Failed to send' }, { status: 500 })
  }
}
