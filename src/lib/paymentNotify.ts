// Organizer heads-up when a payment lands — any rail (card, ACH on settlement,
// PayPal/Venmo). Call this ONLY from the code path that actually CREATED the
// RegistrationPayment row (every recorder is idempotent), so one payment means
// exactly one email even with stripeConfirm + webhook both live.
// Best-effort by design: never throws, never blocks payment recording.
import { prisma } from '@/lib/db'
import { sendEmail, emailEnabled, orgSender } from '@/lib/email'
import { tournamentOrgId, orgById } from '@/lib/org'
import { resolveRegConfirmation } from '@/lib/regConfirmation'
import { SITE_URL } from '@/lib/seo'
import { sendPushToOrg } from '@/lib/push'

const fmt = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const METHOD_LABELS: Record<string, string> = {
  credit_card: 'Card',
  ach: 'Bank transfer (ACH)',
  paypal: 'PayPal',
  venmo: 'Venmo',
  check: 'Check',
  zelle: 'Zelle',
  cash: 'Cash',
}

export async function notifyPaymentReceived(args: {
  registrationId: string
  amount: number          // recorded (base) amount
  method: string          // credit_card | ach | paypal | venmo | ...
  charged?: number        // gross amount incl. pass-through fee, when different
  via?: string            // e.g. 'Stripe webhook' — shown small in the footer
}) {
  try {
    if (!emailEnabled()) return
    const reg = await prisma.teamRegistration.findUnique({
      where: { id: args.registrationId },
      include: { payments: true, teams: true },
    })
    if (!reg || reg.deletedAt) return
    const t = await prisma.tournament.findUnique({ where: { id: reg.tournamentId }, select: { name: true } })
    const orgId = await tournamentOrgId(reg.tournamentId)
    const org: any = await orgById(orgId)

    // Same recipient resolution as the new-registration heads-up: the org Forms
    // library's "Notify your team" list, falling back to org site contact +
    // org account email. Loud when empty — silent no-op is how heads-ups die.
    const jget = async (key: string) => { try { const r = await prisma.appSetting.findUnique({ where: { key } }); return r ? JSON.parse(r.value || '{}') : {} } catch { return {} } }
    const orgForms = orgId ? await jget(`orgForms:${orgId}`) : {}
    let override: any = null
    try {
      const rr: any[] = await prisma.$queryRawUnsafe('SELECT regConfirmationOverride FROM "Tournament" WHERE id = ?', reg.tournamentId)
      const raw = rr?.[0]?.regConfirmationOverride
      if (raw) override = JSON.parse(raw)
    } catch {}
    const cfg = resolveRegConfirmation(orgForms.registration, override)
    const orgSite = orgId ? await jget(`orgSite:${orgId}`) : {}
    const fallback = [orgSite?.contact?.email, org?.contactEmail].filter(Boolean).join(',')
    const recipients = Array.from(new Set(String(cfg.notifyEmails || fallback || '')
      .split(',').map(s => s.trim().toLowerCase()).filter(s => s.includes('@'))))

    const paid = reg.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const due = (Number(reg.invoiceAmount) || 0) - (Number(reg.discountAmount) || 0)
    const balance = Math.round(Math.max(0, due - paid) * 100) / 100
    const label = METHOD_LABELS[args.method] || args.method
    const tName = t?.name || 'your tournament'

    // Phone push — independent of email recipients (a device can be subscribed
    // even with no notify emails configured). Best-effort, never blocks.
    await sendPushToOrg(orgId, {
      title: `Payment received — ${fmt(args.amount)}`,
      body: `${reg.clubName || 'A club'} · ${tName}${balance > 0 ? ` · ${fmt(balance)} left` : ' · paid in full'}`,
      url: `/tournaments/${reg.tournamentId}/registrations`,
      tag: `pay-${args.registrationId}`,
    })

    if (!recipients.length) { console.warn('[paymentNotify] no email recipients for tournament', reg.tournamentId); return }
    const row = (k: string, v: string) =>
      `<tr><td style="padding:4px 12px 4px 0;color:#64748b;vertical-align:top">${k}</td><td style="padding:4px 0">${v}</td></tr>`

    const html = `
      <div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:560px">
        <h2 style="margin:0 0 4px;color:#0f172a">Payment received &mdash; ${fmt(args.amount)}</h2>
        <p style="margin:0 0 16px;color:#334155">${reg.clubName || 'A club'} just paid toward ${tName}.</p>
        <table style="border-collapse:collapse;font-size:14px;color:#0f172a">
          ${row('Club', reg.clubName || '&mdash;')}
          ${row('Tournament', tName)}
          ${row('Amount', `<strong>${fmt(args.amount)}</strong>`)}
          ${args.charged && args.charged > args.amount ? row('Processing fee (paid by club)', fmt(args.charged - args.amount)) : ''}
          ${row('Method', label)}
          ${row('Teams', String(reg.teams.length))}
          ${row('Remaining balance', balance > 0 ? fmt(balance) : '<strong style="color:#0d9488">Paid in full</strong>')}
        </table>
        <p style="margin:16px 0 0"><a href="${SITE_URL}/tournaments/${reg.tournamentId}/registrations" style="color:#2563eb">Open the registrations page</a></p>
        ${args.via ? `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8">Recorded via ${args.via}.</p>` : ''}
      </div>`

    await sendEmail({
      to: recipients.join(','),
      subject: `Payment received: ${fmt(args.amount)} — ${reg.clubName || 'club'} · ${tName}`,
      html,
      ...orgSender(org),
      // Replying goes to the club contact, like the registration call sheet.
      ...(reg.contactEmail ? { replyTo: reg.contactEmail } : {}),
    })
  } catch (e) {
    console.error('[paymentNotify] failed (payment itself already recorded):', e)
  }
}
