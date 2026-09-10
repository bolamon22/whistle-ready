import { prisma } from '@/lib/db'
import { letterBodyHtml } from '@/lib/inviteLetter'

// Org-editable payment-reminder letter (Bo, Sep 9: "the current letter isn't great
// for reminding teams they need to pay"). Same pattern as the invite letter:
// AppSetting payLetter:{orgId} holds {subject, body}; tokens merge at send time.
// The invoice table, Pay button, and fee note are FIXED chrome the email always
// carries below the letter — the editable part is the human note on top.

export const PAY_LETTER_DEFAULTS: { subject: string; body: string } = {
  subject: 'Payment reminder — {club} balance for {event}',
  body: `Hi {contact} — a friendly reminder from {org}: {club} ({teams}) still shows a balance of {balance} for {event}.

You can take care of it online in about a minute with the button below — bank transfer (ACH) has no fee; card runs 3%. If a check is already on the way or anything here looks off, just reply to this email and we'll square it up.

Thanks for being part of the event — we can't wait to see your teams out there.`,
}

export async function payLetterFor(orgId: string | null): Promise<{ subject: string; body: string; custom: boolean }> {
  if (orgId) {
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: `payLetter:${orgId}` } })
      if (row?.value) {
        const v = JSON.parse(row.value) as { subject?: unknown; body?: unknown }
        if (typeof v?.subject === 'string' && typeof v?.body === 'string' && v.body.trim()) {
          return { subject: v.subject, body: v.body, custom: true }
        }
      }
    } catch { /* bad JSON — fall through to default */ }
  }
  return { ...PAY_LETTER_DEFAULTS, custom: false }
}

export function mergePayLetter(text: string, vals: Record<string, string>): string {
  return text.replace(/\{(contact|club|event|balance|teams|org)\}/g, (_m, k: string) => vals[k] ?? '')
}

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// One builder for BOTH send paths (the per-club modal and the bulk Email clubs
// dialog): editable letter on top, fixed invoice table / Pay button / fee note
// below so the payment mechanics can't be edited away.
export function buildPayReminderEmail(args: {
  clubName: string; clubContact: string; teamsCount: number
  tName: string; link: string; due: number; paid: number; balance: number
  orgName: string; subjectTpl: string; bodyTpl: string
}): { subject: string; html: string; text: string } {
  const totalWithFee = Math.round(args.balance * 1.03 * 100) / 100
  const teamsLabel = `${args.teamsCount} team${args.teamsCount !== 1 ? 's' : ''}`
  const vals = {
    contact: args.clubContact || args.clubName, club: args.clubName, event: args.tName,
    balance: fmt(args.balance), teams: teamsLabel, org: args.orgName,
  }
  const subject = mergePayLetter(args.subjectTpl, vals)
  const letterText = mergePayLetter(args.bodyTpl, vals)
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="color:#0f766e;margin-bottom:4px">${args.tName}</h2>
  ${letterBodyHtml(letterText)}
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="padding:6px 0;color:#64748b">Invoiced</td><td style="padding:6px 0;text-align:right">${fmt(args.due)}</td></tr>
    <tr><td style="padding:6px 0;color:#64748b">Paid</td><td style="padding:6px 0;text-align:right">${fmt(args.paid)}</td></tr>
    <tr><td style="padding:6px 0;font-weight:bold;border-top:1px solid #e2e8f0">Balance due</td><td style="padding:6px 0;text-align:right;font-weight:bold;border-top:1px solid #e2e8f0">${fmt(args.balance)}</td></tr>
  </table>
  <p style="text-align:center;margin:24px 0">
    <a href="${args.link}" style="background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">Pay ${fmt(args.balance)} online</a>
  </p>
  <p style="font-size:13px;color:#64748b">Pay by <strong>bank transfer (ACH) with no fee</strong>, or by card (3% processing fee &mdash; ${fmt(totalWithFee)} total). Prefer to pay by check? Just reply to this email.</p>
  <p style="font-size:13px;color:#64748b">If the button does not work, copy this link into your browser:<br>${args.link}</p>
</div>`
  const text = `${letterText}\n\nInvoiced: ${fmt(args.due)}\nPaid: ${fmt(args.paid)}\nBalance due: ${fmt(args.balance)}\n\nPay online — bank transfer (ACH, no fee) or card (3% fee, ${fmt(totalWithFee)} total):\n${args.link}`
  return { subject, html, text }
}
