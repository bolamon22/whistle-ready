import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'
import { sendEmail, orgSender } from '@/lib/email'
import { orgForTournament } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { letterBodyHtml } from '@/lib/inviteLetter'
import { COMM_KINDS, commLetterFor, mergeCommLetter, type CommKind } from '@/lib/commLetters'
import { payLetterFor, buildPayReminderEmail } from '@/lib/payLetter'
import { waiverCounts, summarizeClub } from '@/lib/waiverCounts'

// Send one of the pre-tournament club letters to selected registrations (or the
// whole field) — Bo: "send to the group or separately". Per-club token merge,
// per-club result, and each successful send stamps that letter's date into the
// registration's commEmailLog so the page can show "Waivers Sep 10".

const fmtDates = (a?: string | null, b?: string | null) => {
  const f = (d?: string | null) => { if (!d) return ''; const x = new Date(d); return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  const s = f(a), e = f(b)
  return s && e && s !== e ? `${s}–${e}` : s || e || 'soon'
}

export async function POST(req: NextRequest) {
  const gate = await requireStaff()
  if (!gate.ok) return gate.res
  let body: { tournamentId?: unknown; kind?: unknown; regIds?: unknown; subject?: unknown; body?: unknown } = {}
  try { body = await req.json() } catch { /* validated below */ }

  const tournamentId = String(body.tournamentId ?? '')
  const kind = String(body.kind ?? '') as CommKind | 'payment'
  const regIds = (Array.isArray(body.regIds) ? body.regIds : []).map(x => String(x)).filter(Boolean)
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })
  if (kind !== 'payment' && !COMM_KINDS[kind]) return NextResponse.json({ error: 'Unknown letter kind' }, { status: 400 })
  if (!regIds.length) return NextResponse.json({ error: 'Pick at least one club' }, { status: 400 })
  if (regIds.length > 100) return NextResponse.json({ error: 'Max 100 clubs per send' }, { status: 400 })

  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, startDate: true, endDate: true } })
  if (!t) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  const org = await orgForTournament(tournamentId)

  const orgId = (org as { id?: string } | null)?.id ?? null
  const letter = kind === 'payment' ? await payLetterFor(orgId) : await commLetterFor(orgId, kind)
  const subjectTpl = String(body.subject ?? '').trim().slice(0, 200) || letter.subject
  const bodyTpl = String(body.body ?? '').trim().slice(0, 4000) || letter.body

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
  const kindMeta = kind === 'payment' ? null : COMM_KINDS[kind]
  const cta = kindMeta?.cta ?? null
  const sharedCtaUrl = cta === 'waiver' ? waiverLink : cta === 'schedule' ? scheduleLink : ''
  const now = new Date().toISOString()

  const results: { regId: string; status: 'sent' | 'no_email' | 'no_balance' | 'failed' }[] = []
  for (const reg of regs) {
    if (!reg.contactEmail) { results.push({ regId: reg.id, status: 'no_email' }); continue }

    // Payment reminders ride the same dialog but keep their own machinery:
    // balance math, invoice-table chrome, and the lastPayReminderAt stamp.
    if (kind === 'payment') {
      const paid = reg.payments.reduce((sum, pmt) => sum + pmt.amount, 0)
      const due = (reg.invoiceAmount || 0) - (reg.discountAmount || 0)
      const balance = Math.round(Math.max(0, due - paid) * 100) / 100
      if (balance <= 0) { results.push({ regId: reg.id, status: 'no_balance' }); continue }
      const { subject, html, text } = buildPayReminderEmail({
        clubName: reg.clubName, clubContact: reg.clubContact, teamsCount: reg.teams.length,
        tName: t.name || 'the tournament', link: tournamentAbs(org?.slug, `/pay/${reg.id}`),
        due, paid, balance, orgName: org?.name || 'the tournament team',
        subjectTpl, bodyTpl,
      })
      const rr = await sendEmail({ to: reg.contactEmail, subject, html, text, ...orgSender(org) })
      if (rr.ok) {
        try { await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "lastPayReminderAt" = ? WHERE id = ?`, now, reg.id) } catch { /* best effort */ }
        results.push({ regId: reg.id, status: 'sent' })
      } else results.push({ regId: reg.id, status: 'failed' })
      continue
    }

    const counts = kind === 'waiver' ? playerCountsFor(reg) : null
    // The confirm button is per club — their registration id IS the key
    const ctaUrl = cta === 'confirm' ? tournamentAbs(org?.slug, `/confirm/${reg.id}`) : sharedCtaUrl
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
      playerCounts: counts ? counts.text : '',
      playerCount: counts ? String(counts.total) : '',
      confirmLink: cta === 'confirm' ? ctaUrl : tournamentAbs(org?.slug, `/confirm/${reg.id}`),
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
      results.push({ regId: reg.id, status: 'sent' })
    } else {
      results.push({ regId: reg.id, status: 'failed' })
    }
  }
  return NextResponse.json({ ok: true, sentAt: now, results })
}
