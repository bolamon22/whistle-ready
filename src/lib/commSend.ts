import { prisma } from '@/lib/db'
import { sendEmail, orgSender } from '@/lib/email'
import { orgForTournament, orgLogoUrl } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { renderEmail, absUrl, imageSize, fitBox } from '@/lib/emailLayout'
import { letterBodyHtml } from '@/lib/inviteLetter'
import { COMM_KINDS, commLetterFor, mergeCommLetter, type CommKind } from '@/lib/commLetters'
import { payLetterFor, buildPayReminderEmail } from '@/lib/payLetter'
import { waiverCounts, summarizeClub, coachSignatures } from '@/lib/waiverCounts'
import { deriveStatus, housingSettings } from '@/lib/housing'
import { hotelDistance, HOTEL_RADIUS_MILES } from '@/lib/geoDistance'
import { readConfirmMany } from '@/lib/changeRequest'
import { buildChecklist, checklistHtml, checklistText, openCount, whatsLeftPhrase, expectedPlayers, CHECKLIST_SENTINEL } from '@/lib/checklistLetter'
import { issueClaimToken, claimUrl } from '@/lib/claim'
import { ensurePaymentGuard } from './paymentGuard'
import { registrationRecipients, directorEmailsByRegistration } from '@/lib/clubDirectorLinks'
import { directorsOf } from '@/lib/clubAccess'
import { clearingTransfers } from '@/lib/pendingTransfers'

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

/** Stands in for a real claim token in a test, so nothing live is overwritten.
 *  It will not open the claim page — that is the point, and the banner says so. */
const TEST_CLAIM_TOKEN = 'test-copy-not-a-real-link'

/** Header on a test copy, so it can never be mistaken for the real thing. */
function testBanner(clubName: string): string {
  return `<div style="background:#0b1f3a;color:#ffffff;border-radius:8px;padding:11px 14px;margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55">`
    + `<strong>TEST COPY</strong> — sent to you, not to ${esc(clubName)}. Everything below is ${esc(clubName)}'s real, current data, and nothing was recorded against them. `
    + `The login/claim button is a dead placeholder in a test; every other link is live.</div>`
}

export function isSendKind(k: string): k is SendKind {
  return k === 'payment' || !!COMM_KINDS[k as CommKind]
}

/** Put `replacement` where the {checklist} token was; append it if the org
 *  edited the token out, so the letter can never go out with no checklist. */
function splitOnSentinel(body: string, replacement: string): string {
  return body.includes(CHECKLIST_SENTINEL)
    ? body.split(CHECKLIST_SENTINEL).join(replacement)
    : `${body}\n\n${replacement}`
}

/** letterBodyHtml escapes and wraps each blank-line-separated block in a <p>, so
 *  the checklist table is spliced BETWEEN rendered halves rather than inside a
 *  paragraph, which would nest a table in a <p> and break Outlook. */
function checklistBodyHtml(body: string, items: ReturnType<typeof buildChecklist> | null): string {
  if (!items) return letterBodyHtml(body)
  const block = checklistHtml(items)
  if (!body.includes(CHECKLIST_SENTINEL)) return letterBodyHtml(body) + block
  return body.split(CHECKLIST_SENTINEL)
    .map(part => part.trim() ? letterBodyHtml(part.trim()) : '')
    .join(block)
}

export async function runCommSend(args: {
  tournamentId: string
  kind: SendKind
  regIds: string[]
  /** Blank = whatever the org has saved for this letter at send time. */
  subject?: string
  body?: string
  /** Email a receipt here when the run finishes. BOTH the Send-now route and the
   *  scheduler pass the office inbox: a toast is not evidence, and this send writes
   *  no record of itself, so the receipt is the only durable proof it happened. */
  notifyTo?: string
  /** True only for a run the scheduler fired, so the receipt can say which it was. */
  scheduled?: boolean
  /** Send ONE club's merged letter to this staff address instead of to the
   *  clubs, and write NOTHING on the way through: no tracking stamp, and above
   *  all no claim token — minting one overwrites the registration's stored
   *  token and would dead-link whatever is already sitting in that director's
   *  inbox. A test must not be able to damage a real send. */
  testTo?: string
}): Promise<{ ok: true; sentAt: string; results: SendResult[] } | { ok: false; error: string; status: number }> {
  const { tournamentId, kind } = args
  const testMode = !!String(args.testTo || '').trim()
  // One club is all a test needs, and it caps the blast radius of a bad call.
  const regIds = args.regIds.map(x => String(x)).filter(Boolean).slice(0, testMode ? 1 : undefined)
  if (!tournamentId) return { ok: false, error: 'tournamentId required', status: 400 }
  if (!isSendKind(kind)) return { ok: false, error: 'Unknown letter kind', status: 400 }
  if (!regIds.length) return { ok: false, error: 'Pick at least one club', status: 400 }
  if (regIds.length > 100) return { ok: false, error: 'Max 100 clubs per send', status: 400 }

  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, startDate: true, endDate: true, logoUrl: true, location: true } })
  if (!t) return { ok: false, error: 'Tournament not found', status: 404 }
  // Read once, not per registration: the {eventTeams} token is the whole field's
  // team count and is identical for every letter in the batch.
  const eventTeams = await prisma.registeredTeam.count({ where: { registration: { tournamentId, deletedAt: null } } })
  const org = await orgForTournament(tournamentId)

  const orgId = (org as { id?: string } | null)?.id ?? null
  const letter = kind === 'payment' ? await payLetterFor(orgId) : await commLetterFor(orgId, kind)
  const subjectTpl = String(args.subject ?? '').trim().slice(0, 200) || letter.subject
  const bodyTpl = String(args.body ?? '').trim().slice(0, 4000) || letter.body

  await ensurePaymentGuard()
  const regs = await prisma.teamRegistration.findMany({
    where: { id: { in: regIds }, tournamentId, deletedAt: null },
    include: { teams: true, payments: true },
  })
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "commEmailLog" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "lastPayReminderAt" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }

  // Registered-player counts per team, from completed waivers (Bo: directors should
  // see "you have 7 registered" and per-team splits so they know who's light).
  const counts = kind === 'waiver' || kind === 'checklist' ? await waiverCounts(tournamentId) : null
  const coaches = kind === 'checklist' ? await coachSignatures(tournamentId) : null
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

  // BRANDING. Two marks, each pointing where a reader would expect: the event's
  // logo in the header goes to the event page, the organizer's in the footer to
  // their site. Both are ordinary https URLs on the same domain the links use --
  // never a data: URI, which no mail client renders and which once pushed a
  // message past Gmail's clip limit (see orgLogoUrl).
  const orgHome = tournamentAbs(org?.slug, '')
  // /event, not /public: the hub with Register, waivers, info and schedule on it.
  // /public is the schedule alone, which is not where a logo click should land.
  const eventHome = tournamentAbs(org?.slug, `/tournaments/${tournamentId}/event`)
  const eventLogo = absUrl(orgHome, t.logoUrl as unknown as string)
  const segLogo = absUrl(orgHome, await orgLogoUrl(org?.id, org?.logoUrl)) || absUrl(orgHome, '/icon-192.png')
  // Measured once for the whole batch, so a 453x180 wordmark keeps its shape
  // instead of being crushed into the old 44x44 square.
  const logoBox = fitBox(await imageSize(eventLogo), 150, 46)
  const footerLogoBox = fitBox(await imageSize(segLogo), 120, 40)

  const waiverLink = tournamentAbs(org?.slug, `/tournaments/${tournamentId}/player-waiver`)
  const scheduleLink = tournamentAbs(org?.slug, `/tournaments/${tournamentId}/public`)
  const eventDates = fmtDates(t.startDate as unknown as string, t.endDate as unknown as string)
  const daysToEvent = (() => {
    const d = new Date(String(t.startDate || ''))
    if (isNaN(d.getTime())) return ''
    const n = Math.ceil((d.getTime() - Date.now()) / 86400000)
    return n > 0 ? String(n) : ''
  })()
  // The account letter is for registrations nobody has set up in the portal yet.
  // It used to skip any contact who had a login, but access is per registration
  // now (lib/clubAccess): a contact with a login whose new registration isn't on
  // it (one the office entered, say) still needs the link, and the claim page
  // asks them for their existing password.
  const alreadyOpen = new Set<string>()
  if (kind === 'account' || kind === 'checklist') {
    try {
      for (const id of (await directorsOf(regs.map(r => r.id))).keys()) alreadyOpen.add(id)
    } catch { /* can't tell — send anyway; the claim page handles an existing account */ }
  }

  // Checklist facts the other letters don't need: who has confirmed their teams,
  // and the hotel answers (raw columns, not in the Prisma schema).
  const confirmStates = kind === 'checklist' ? await readConfirmMany(regs.map(r => r.id)) : null
  // Whether the contact has a Whistle Ready login AT ALL, which is a different
  // question from whether that login can open this registration (alreadyOpen,
  // above). The registrations page badge uses this one; the checklist needs
  // both so it can tell "sign up" from "claim the one you have".
  const accountEmails = new Set<string>()
  if (kind === 'checklist') {
    const emails = [...new Set(regs.map(r => String(r.contactEmail || '').trim().toLowerCase()).filter(Boolean))]
    if (emails.length) {
      try {
        for (const u of await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } })) {
          accountEmails.add(String(u.email || '').trim().toLowerCase())
        }
      } catch { /* can't tell — the letter falls back to "set up a login" */ }
    }
  }
  const hotelById = new Map<string, Record<string, unknown>>()
  if (kind === 'checklist' && regs.length) {
    try {
      const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
        `SELECT id, "hotelName", "hotelRooms", "hotelNights", "housingStatus" FROM "TeamRegistration" WHERE id IN (${regs.map(() => '?').join(',')})`,
        ...regs.map(r => r.id))
      for (const row of rows) hotelById.set(String(row.id), row)
    } catch { /* columns missing — deriveStatus falls back to the form answer */ }
  }
  // Where families actually book. Blank until the org sets one, in which case
  // the hotel line points at the event page, which carries the travel info.
  const housing = kind === 'checklist' && orgId ? await housingSettings(orgId) : null
  const bookingUrl = housing?.bookingUrl || ''

  const kindMeta = kind === 'payment' ? null : COMM_KINDS[kind]
  const cta = kindMeta?.cta ?? null
  const sharedCtaUrl = cta === 'waiver' ? waiverLink : cta === 'schedule' ? scheduleLink : ''
  const now = new Date().toISOString()

  // Directors linked to each club, read once for the whole batch. The account
  // letter never uses it (see below), so it isn't paid for on that send.
  const directors = kind === 'account' ? null : await directorEmailsByRegistration(tournamentId)
  // Bank transfers still clearing count as paid for a reminder: a club that sent
  // the money on Friday must not be asked for it again on Monday. Read once for
  // the whole batch (lib/pendingTransfers).
  const clearing = kind === 'payment' || kind === 'checklist' ? await clearingTransfers(regs.map(r => r.id)) : {}

  const results: SendResult[] = []
  // The first email that actually goes out is kept as the receipt's copy.
  let sample: { subject: string; html: string; to: string } | null = null
  for (const reg of regs) {
    // A club can have more than one director -- two people who both handle waivers
    // and schedules for the same club (Bo, Sep 30: "I would like to keep them both
    // involved"). A registration still carries ONE contactEmail, so the letter went
    // to whichever contact survived a merge and the other man silently dropped off.
    // Club letters now go to the registration contact PLUS every director who can
    // open that registration in the portal (lib/clubAccess).
    //
    // The account letter is the one exception: it carries a claim token stored on the
    // registration, so whoever clicks first consumes it and the second person lands on
    // an already-claimed page. That one stays pointed at the registration contact --
    // and anyone already holding a ClubDirectorLink has an account by definition.
    const recipients = testMode
      ? [String(args.testTo).trim().toLowerCase()]
      : kind === 'account'
        ? (reg.contactEmail ? [String(reg.contactEmail).trim().toLowerCase()] : [])
        : registrationRecipients(reg.id, reg.contactEmail, directors)
    if (!recipients.length) { results.push({ regId: reg.id, club: reg.clubName, status: 'no_email' }); continue }

    // Payment reminders ride the same dialog but keep their own machinery:
    // balance math, invoice-table chrome, and the lastPayReminderAt stamp.
    if (kind === 'payment') {
      const paid = reg.payments.reduce((sum, pmt) => sum + pmt.amount, 0) + (clearing[reg.id]?.amount || 0)
      const due = (reg.invoiceAmount || 0) - (reg.discountAmount || 0)
      const balance = Math.round(Math.max(0, due - paid) * 100) / 100
      if (balance <= 0) { results.push({ regId: reg.id, club: reg.clubName, status: 'no_balance' }); continue }
      const { subject, html, text } = buildPayReminderEmail({
        clubName: reg.clubName, clubContact: reg.clubContact, teamsCount: reg.teams.length,
        tName: t.name || 'the tournament', link: tournamentAbs(org?.slug, `/pay/${reg.id}`),
        due, paid, balance, orgName: org?.name || 'the tournament team',
        startDate: t.startDate, eventTeams,
        eventLogo, eventHref: eventHome, orgLogo: segLogo, orgHref: orgHome, logoBox, footerLogoBox,
        subjectTpl, bodyTpl,
      })
      const rr = await sendEmail({
        to: recipients, text, ...orgSender(org),
        subject: testMode ? `[TEST] ${subject}` : subject,
        html: testMode ? testBanner(reg.clubName) + html : html,
      })
      if (rr.ok) {
        if (!testMode) try { await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "lastPayReminderAt" = ? WHERE id = ?`, now, reg.id) } catch { /* best effort */ }
        if (!sample) sample = { subject, html, to: recipients.join(', ') }
        results.push({ regId: reg.id, club: reg.clubName, status: 'sent' })
      } else results.push({ regId: reg.id, club: reg.clubName, status: 'failed' })
      continue
    }

    if (kind === 'account' && alreadyOpen.has(reg.id)) {
      results.push({ regId: reg.id, club: reg.clubName, status: 'has_account' }); continue
    }

    const pc = kind === 'waiver' ? playerCountsFor(reg) : null

    // The checklist's own items, from status this club already has on the
    // registrations page — nothing here is ticked by hand.
    let checkItems: ReturnType<typeof buildChecklist> | null = null
    if (kind === 'checklist') {
      const sum = counts ? summarizeClub(counts, reg.clubName, reg.teams) : { perTeam: [] as number[], matched: 0, unassigned: 0, total: 0 }
      const paidSoFar = reg.payments.reduce((acc, pmt) => acc + pmt.amount, 0) + (clearing[reg.id]?.amount || 0)
      const invoiced = Math.round(Math.max(0, (reg.invoiceAmount || 0) - (reg.discountAmount || 0)) * 100) / 100
      const hotel = hotelById.get(reg.id) || {}
      // Free-text town vs free-text venue; null when either can't be placed,
      // and null must not read as local (lib/geoDistance).
      const miles = hotelDistance(reg.clubBasedIn, t.location as unknown as string)
      const expect = expectedPlayers(reg.teams.map(tm => tm.division || ''))
      const confirmedAt = confirmStates?.get(reg.id)?.at || ''
      let claimLink = ''
      if (!alreadyOpen.has(reg.id)) {
        if (testMode) claimLink = claimUrl(tournamentAbs(org?.slug, ''), TEST_CLAIM_TOKEN)
        else {
          const tk = await issueClaimToken(reg.id)
          if (tk) claimLink = claimUrl(tournamentAbs(org?.slug, ''), tk)
        }
      }
      checkItems = buildChecklist({
        eventName: t.name || 'the tournament',
        teamCount: reg.teams.length,
        teamsConfirmed: (confirmStates?.get(reg.id)?.status || '') === 'confirmed',
        confirmedOn: confirmedAt ? new Date(confirmedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '',
        hasLogin: alreadyOpen.has(reg.id),
        hasAccountElsewhere: accountEmails.has(String(reg.contactEmail || '').trim().toLowerCase()),
        loginEmail: String(reg.contactEmail || ''),
        waiverTotal: sum.total,
        teamsWithNoWaivers: reg.teams.filter((_tm, i) => (sum.perTeam[i] ?? 0) === 0).map(tm => tm.teamName),
        expectedLow: expect.low,
        expectedHigh: expect.high,
        coachTotal: coaches ? coaches.forClub(reg.clubName).length : 0,
        teamsWithNoCoach: coaches
          ? reg.teams.filter(tm => coaches.forTeam(tm.clubName || reg.clubName, tm.teamName).length === 0).map(tm => tm.teamName)
          : [],
        invoiced,
        balance: Math.round(Math.max(0, invoiced - paidSoFar) * 100) / 100,
        // The housing board's own call, so the email and the board agree.
        housingStatus: deriveStatus({ ...hotel, needsHotel: reg.needsHotel }),
        // Only a staff tick on the board counts as local. deriveStatus also
        // returns 'local' for a club that answered "No" on the form, and Bo
        // does not want a shrugged No to kill the hotel ask (checklistLetter).
        staffMarkedLocal: String(hotel.housingStatus || '') === 'local',
        saidNeedsHotel: /^(y|maybe)/i.test(String(reg.needsHotel || '')),
        withinLocalRadius: miles !== null && miles < HOTEL_RADIUS_MILES,
        hotelName: String(hotel.hotelName || ''),
        hotelRooms: Number(hotel.hotelRooms || 0),
        housingContactName: housing?.contactName || '',
        housingContactEmail: housing?.contactEmail || '',
      }, {
        confirmLink: tournamentAbs(org?.slug, `/confirm/${reg.id}`),
        // Already has a login? Send them to sign in rather than to a claim page.
        accountLink: claimLink || tournamentAbs(org?.slug, '/login'),
        waiverLink,
        coachLink: tournamentAbs(org?.slug, `/tournaments/${tournamentId}/coach-waiver`),
        payLink: tournamentAbs(org?.slug, `/pay/${reg.id}`),
        hotelLink: bookingUrl || eventHome,
        shareLink: tournamentAbs(org?.slug, `/share/${reg.id}`),
        portalLink: tournamentAbs(org?.slug, '/dashboard/club-director'),
      })
    }
    // Confirm + account links are per club: their registration id (confirm) or a
    // freshly minted single-use claim token (account) is the key.
    let ctaUrl = sharedCtaUrl
    if (cta === 'confirm') ctaUrl = tournamentAbs(org?.slug, `/confirm/${reg.id}`)
    else if (cta === 'account') {
      if (testMode) ctaUrl = claimUrl(tournamentAbs(org?.slug, ''), TEST_CLAIM_TOKEN)
      else {
        const token = await issueClaimToken(reg.id)
        if (!token) { results.push({ regId: reg.id, club: reg.clubName, status: 'failed' }); continue }
        ctaUrl = claimUrl(tournamentAbs(org?.slug, ''), token)
      }
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
      payLink: tournamentAbs(org?.slug, `/pay/${reg.id}`),
      checklist: checkItems ? CHECKLIST_SENTINEL : '',
      shareLink: tournamentAbs(org?.slug, `/share/${reg.id}`),
      openCount: checkItems ? String(openCount(checkItems)) : '',
      whatsLeft: checkItems ? whatsLeftPhrase(checkItems) : '',
      daysToEvent: daysToEvent,
    }
    const subject = mergeCommLetter(subjectTpl, vals)
    const bodyText = mergeCommLetter(bodyTpl, vals)
    const html = renderEmail({
      orgName: org?.name || 'Sunshine Events Group',
      eyebrow: t.name || org?.name || '',
      logoUrl: eventLogo, logoHref: eventHome, logoAlt: t.name || 'Tournament', logoBox,
      footerLogoUrl: segLogo, footerHref: orgHome, footerLogoBox,
      body: `${checklistBodyHtml(bodyText, checkItems)}
  ${ctaUrl ? `<p style="text-align:center;margin:24px 0"><a href="${ctaUrl}" style="background:#0d9488;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">${kindMeta?.ctaLabel ?? ''}</a></p>
  <p style="font-size:12px;color:#94a3b8">If the button does not work, copy this link into your browser:<br>${ctaUrl}</p>` : ''}`,
      footerNote: 'Questions? Just reply to this email.',
    })
    const text = `${checkItems ? splitOnSentinel(bodyText, checklistText(checkItems)) : bodyText}${ctaUrl ? `\n\n${kindMeta?.ctaLabel ?? ''}: ${ctaUrl}` : ''}`
    const r = await sendEmail({
      to: recipients, text, ...orgSender(org),
      subject: testMode ? `[TEST] ${subject}` : subject,
      html: testMode ? testBanner(reg.clubName) + html : html,
    })
    if (r.ok) {
      if (!testMode) {
        let log: Record<string, string> = {}
        try { const raw = logById.get(reg.id); if (raw) log = JSON.parse(raw) } catch { /* fresh log */ }
        log[kind] = now
        try { await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "commEmailLog" = ? WHERE id = ?`, JSON.stringify(log), reg.id) } catch { /* best effort */ }
      }
      if (!sample) sample = { subject, html, to: recipients.join(', ') }
      results.push({ regId: reg.id, club: reg.clubName, status: 'sent' })
    } else {
      results.push({ regId: reg.id, club: reg.clubName, status: 'failed' })
    }
  }
  if (args.notifyTo) await sendReceipt(args.notifyTo, org, t.name || 'the tournament', kind, results, sample, !!args.scheduled)
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
  scheduled: boolean,
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
  <p style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#0d9488;margin:0 0 4px">${scheduled ? 'SCHEDULED SEND' : 'SENT NOW'} · ${esc(tName)}</p>
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
