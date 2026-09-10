import { prisma } from '@/lib/db'

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
