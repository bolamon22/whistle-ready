import { prisma } from '@/lib/db'
import { sendEmail, orgSender } from '@/lib/email'
import { orgForTournament } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { letterBodyHtml } from '@/lib/inviteLetter'
import { COMM_KINDS, commLetterFor, mergeCommLetter, type CommKind } from '@/lib/commLetters'
import { payLetterFor, buildPayReminderEmail } from '@/lib/payLetter'
import { waiverCounts, summarizeClub } from '@/lib/waiverCounts'
import { issueClaimToken, claimUrl } from '@/lib/claim'

// The club-letter send itself, lifted out of the route so the scheduler can run
// exactly the same code later (Bo, Sep 10: "schedule when we send the email").
// Per-club token merge, per-club result, and each success stamps the letter's
// date onto the registration so the page can show "Waivers Sep 10".

export type SendKind = CommKind | 'payment'
export type SendStatus = 'sent' | 'no_email' | 'no_balance' | 'has_account' | 'failed'
export type SendResult = { regId: string; club: string; status: SendStatus }

const fmtDates = (a?: string | null, b?: string | null) => {
  const f = (d?: string | null) => { if (!d) return ''; const x = new Date(d); return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  const s = f(a), e = f(b)
  return s && e && s !== e ? `${s}–${e}` : s || e || 'soon'
}

export function isSendKind(k: string): k is SendKind {
  return k === 'payment' || !!COMM_KINDS[k as CommKind]
}

export async function runCommSend(args: {
  tournamentId: string
  kind: SendKind
  regIds: string[]
  /** Blank = whatever the org has saved for this letter at send time. */
  subject?: string
  body?: string
  /** Email a receipt here when the run finishes — the scheduler passes the office
   *  inbox so Bo can see a queued send actually went out. */
  notifyTo?: string
}): Promise<{ ok: true; sentAt: string; results: SendResult[] } | { ok: false; error: string; status: number }> {
  const { tournamentId, kind } = args
  const regIds = args.regIds.map(x => String(x)).filter(Boolean)
  if (!tournamentId) return { ok: false, error: 'tournamentId required', status: 400 }
  if (!isSendKind(kind)) return { ok: false, error: 'Unknown letter kind', status: 400 }
  if (!regIds.length) return { ok: false, error: 'Pick at least one club', status: 400 }
  if (regIds.length > 100) return { ok: false, error: 'Max 100 clubs per send', status: 400 }

  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, startDate: true, endDate: true } })
  if (!t) return { ok: false, error: 'Tournament not found', status: 404 }
  const org = await orgForTournament(tournamentId)

  const orgId = (org as { id?: string } | null)?.id ?? null
  const letter = kind === 'payment' ? await payLetterFor(orgId) : await commLetterFor(orgId, kind)
  const subjectTpl = String(args.subject ?? '').trim().slice(0, 200) || letter.subject
  const bodyTpl = String(args.body ?? '').trim().slice(0, 4000) || letter.body

  const regs = await prisma.teamRegistration.findMany({
    where: { id: { in: regIds }, tournamentId, deletedAt: null },
    include: { teams: true, payments: true },
  })
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "commEmailLog" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "lastPayReminderAt" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }

  // Registered-player counts per team, from completed waivers (Bo: directors should
  // see "you have 7 registered" and per-team splits so they know who's light).
  const counts = kind === 'waiver' ? await waiverCounts(tournamentId) : null
  const playerCountsFor = (reg: { clubName: string; teams: { teamName: string; division: string; clubName?: string | null }[] }) => {
    if (!counts) return { text: '', total: 0 }
    const sum = summarizeClub(counts, reg.clubName, reg.teams)
    const lines = reg.teams.map((tm, i) => {
      const n = sum.perTeam[i] ?? 0
      return `• ${tm.teamName}${tm.division ? ` — ${tm.division}` : ''}: ${n === 0 ? 'no players registered yet' : `${n} player${n === 1 ? '' : 's'} registered`}`
    })
    if (sum.unassigned > 0) lines.push(`• Not matched to a team: ${sum.unassigned} player${sum.unassigned === 1 ? '' : 's'}`)
    lines.push(`Total for ${reg.clubName}: ${sum.total} player${sum.total === 1 ? '' : 's'} registered`)
    return { text: lines.join('\n'), total: sum.total }
  }
  const logs: Record<string, unknown>[] = regs.length ? await prisma.$queryRawUnsafe(
    `SELECT id, "commEmailLog" FROM "TeamRegistration" WHERE id IN (${regs.map(() => '?').join(',')})`, ...regs.map(r => r.id)) : []
  const logById = new Map(logs.map(l => [String(l.id), String(l.commEmailLog ?? '')]))

  const waiverLink = tournamentAbs(org?.slug, `/tournaments/${tournamentId}/player-waiver`)
  const scheduleLink = tournamentAbs(org?.slug, `/tournaments/${tournamentId}/public`)
  const eventDates = fmtDates(t.startDate as unknown as string, t.endDate as unknown as string)
  // The account letter only makes sense for contacts without a login yet.
  const hasAccount = new Set<string>()
  if (kind === 'account') {
    try {
      const emails = [...new Set(regs.map(r => String(r.contactEmail || '').trim().toLowerCase()).filter(Boolean))]
      if (emails.length) {
        const us: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
          `SELECT lower(email) AS email FROM "User" WHERE lower(email) IN (${emails.map(() => '?').join(',')})`, ...emails)
        for (const u of us) hasAccount.add(String(u.email))
      }
    } catch { /* can't tell — send anyway; the claim page handles an existing account */ }
  }

  const kindMeta = kind === 'payment' ? null : COMM_KINDS[kind]
  const cta = kindMeta?.cta ?? null
  const sharedCtaUrl = cta === 'waiver' ? waiverLink : cta === 'schedule' ? scheduleLink : ''
  const now = new Date().toISOString()

  const results: SendResult[] = []
  // The first email that actually goes out is kept as the receipt's copy.
  let sample: { subject: string; html: string; to: string } | null = null
  for (const reg of regs) {
    if (!reg.contactEmail) { results.push({ regId: reg.id, club: reg.clubName, status: 'no_email' }); continue }

    // Payment reminders ride the same dialog but keep their own machinery:
    // balance math, invoice-table chrome, and the lastPayReminderAt stamp.
    if (kind === 'payment') {
      const paid = reg.payments.reduce((sum, pmt) => sum + pmt.amount, 0)
      const due = (reg.invoiceAmount || 0) - (reg.discountAmount || 0)
      const balance = Math.round(Math.max(0, due - paid) * 100) / 100
      if (balance <= 0) { results.push({ regId: reg.id, club: reg.clubName, status: 'no_balance' }); continue }
      const { subject, html, text } = buildPayReminderEmail({
        clubName: reg.clubName, clubContact: reg.clubContact, teamsCount: reg.teams.length,
        tName: t.name || 'the tournament', link: tournamentAbs(org?.slug, `/pay/${reg.id}`),
        due, paid, balance, orgName: org?.name || 'the tournament team',
        subjectTpl, bodyTpl,
      })
      const rr = await sendEmail({ to: reg.contactEmail, subject, html, text, ...orgSender(org) })
      if (rr.ok) {
        try { await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "lastPayReminderAt" = ? WHERE id = ?`, now, reg.id) } catch { /* best effort */ }
        if (!sample) sample = { subject, html, to: reg.contactEmail }
        results.push({ regId: reg.id, club: reg.clubName, status: 'sent' })
      } else results.push({ regId: reg.id, club: reg.clubName, status: 'failed' })
      continue
    }

    if (kind === 'account' && hasAccount.has(String(reg.contactEmail).trim().toLowerCase())) {
      results.push({ regId: reg.id, club: reg.clubName, status: 'has_account' }); continue
    }

    const pc = kind === 'waiver' ? playerCountsFor(reg) : null
    // Confirm + account links are per club: their registration id (confirm) or a
    // freshly minted single-use claim token (account) is the key.
    let ctaUrl = sharedCtaUrl
    if (cta === 'confirm') ctaUrl = tournamentAbs(org?.slug, `/confirm/${reg.id}`)
    else if (cta === 'account') {
      const token = await issueClaimToken(reg.id)
      if (!token) { results.push({ regId: reg.id, club: reg.clubName, status: 'failed' }); continue }
      ctaUrl = claimUrl(tournamentAbs(org?.slug, ''), token)
    }
    const vals = {
      contact: reg.clubContact || reg.clubName,
      club: reg.clubName,
      event: t.name || 'the tournament',
      teams: `${reg.teams.length} team${reg.teams.length !== 1 ? 's' : ''}`,
      org: org?.name || 'the tournament team',
      waiverLink, scheduleLink, eventDates,
      teamsList: reg.teams.length
        ? reg.teams.map(tm => `• ${tm.teamName}${tm.division ? ` — ${tm.division}` : ''}`).join('\n')
        : '• (no teams listed yet — reply with your team names)',
      playerCounts: pc ? pc.text : '',
      playerCount: pc ? String(pc.total) : '',
      confirmLink: cta === 'confirm' ? ctaUrl : tournamentAbs(org?.slug, `/confirm/${reg.id}`),
      accountLink: cta === 'account' ? ctaUrl : '',
    }
    const subject = mergeCommLetter(subjectTpl, vals)
    const bodyText = mergeCommLetter(bodyTpl, vals)
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b">
  <h2 style="color:#0f766e;margin-bottom:12px">${t.name || 'Tournament update'}</h2>
  ${letterBodyHtml(bodyText)}
  ${ctaUrl ? `<p style="text-align:center;margin:24px 0"><a href="${ctaUrl}" style="background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">${kindMeta?.ctaLabel ?? ''}</a></p>
  <p style="font-size:12px;color:#94a3b8">If the button does not work, copy this link into your browser:<br>${ctaUrl}</p>` : ''}
  <p style="font-size:13px;color:#64748b">Questions? Just reply to this email.</p>
</div>`
    const text = `${bodyText}${ctaUrl ? `\n\n${kindMeta?.ctaLabel ?? ''}: ${ctaUrl}` : ''}`
    const r = await sendEmail({ to: reg.contactEmail, subject, html, text, ...orgSender(org) })
    if (r.ok) {
      let log: Record<string, string> = {}
      try { const raw = logById.get(reg.id); if (raw) log = JSON.parse(raw) } catch { /* fresh log */ }
      log[kind] = now
      try { await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "commEmailLog" = ? WHERE id = ?`, JSON.stringify(log), reg.id) } catch { /* best effort */ }
      if (!sample) sample = { subject, html, to: reg.contactEmail }
      results.push({ regId: reg.id, club: reg.clubName, status: 'sent' })
    } else {
      results.push({ regId: reg.id, club: reg.clubName, status: 'failed' })
    }
  }
  if (args.notifyTo) await sendReceipt(args.notifyTo, org, t.name || 'the tournament', kind, results, sample)
  return { ok: true, sentAt: now, results }
}

const STATUS_WORDS: Record<SendStatus, string> = {
  sent: 'sent', no_email: 'no email on file', no_balance: 'already paid',
  has_account: 'already had a login', failed: 'FAILED',
}
const esc = (x: string) => x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

// Receipt for a scheduled run (Bo: "I just want to make sure they go out") — the
// tally, who got it, and the actual email one club received, inlined below.
async function sendReceipt(
  to: string, org: { name?: string | null } | null, tName: string,
  kind: SendKind, results: SendResult[], sample: { subject: string; html: string; to: string } | null,
) {
  try {
    const sent = results.filter(r => r.status === 'sent')
    const label = kind === 'payment' ? 'Payment reminder' : COMM_KINDS[kind].label
    const others = results.filter(r => r.status !== 'sent')
    const line = (r: SendResult) => `<li style="margin:2px 0">${esc(r.club || r.regId)} <span style="color:#94a3b8">— ${STATUS_WORDS[r.status]}</span></li>`
    await sendEmail({
      ...orgSender(org),
      to,
      subject: `Sent: ${label} — ${sent.length} club${sent.length === 1 ? '' : 's'} (${tName})`,
      html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1e293b">
  <p style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#0d9488;margin:0 0 4px">SCHEDULED SEND · ${esc(tName)}</p>
  <h2 style="font-size:19px;margin:0 0 6px">${esc(label)} just went out</h2>
  <p style="color:#475569;font-size:14px;margin:0 0 12px"><strong>${sent.length}</strong> club${sent.length === 1 ? '' : 's'} emailed${others.length ? `, ${others.length} skipped` : ''}.</p>
  <ul style="font-size:13px;color:#334155;padding-left:18px;margin:0 0 8px">${sent.map(line).join('')}</ul>
  ${others.length ? `<p style="font-size:12px;color:#94a3b8;margin:0 0 4px">Not emailed:</p><ul style="font-size:12.5px;color:#64748b;padding-left:18px;margin:0">${others.map(line).join('')}</ul>` : ''}
  ${sample ? `<div style="border-top:1px solid #e2e8f0;margin:20px 0 0;padding-top:14px">
    <p style="font-size:12px;color:#94a3b8;margin:0 0 2px">Copy of what they received — this one went to ${esc(sample.to)}:</p>
    <p style="font-size:13px;color:#0f172a;font-weight:600;margin:0 0 10px">Subject: ${esc(sample.subject)}</p>
    <div style="border:1px solid #e2e8f0;border-radius:10px;padding:6px 10px">${sample.html}</div>
  </div>` : ''}
</div>`,
    })
  } catch { /* a missing receipt must never fail the send itself */ }
}
