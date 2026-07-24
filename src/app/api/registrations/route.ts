import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { sendEmail, emailEnabled } from '@/lib/email'
import { parsePricing, calcFee } from '@/lib/regPricing'
import { resolveRegConfirmation, buildRegLetter, letterToEmailHtml, organizerEmailHtml, organizerEmailSubject, type RegLetterData, type RegNotifyData } from '@/lib/regConfirmation'
import { issueClaimToken, claimUrl } from '@/lib/claim'
import { SITE_URL, tournamentAbs } from '@/lib/seo'

async function ensureRegistrationColumns() {
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "clubLogoUrl" TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
  try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "instagramHandle" TEXT NOT NULL DEFAULT ''`) } catch { /* already exists */ }
}

// "@yourclub", "instagram.com/yourclub", "https://www.instagram.com/yourclub/" → "yourclub"
function normalizeInstagram(raw?: string): string {
  let s = String(raw || '').trim()
  if (!s) return ''
  s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '')
  return s.slice(0, 60)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  if (!tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 })

  await ensureRegistrationColumns()
  const registrations = await prisma.teamRegistration.findMany({
    where: { tournamentId, deletedAt: null },
    include: { teams: true, payments: { orderBy: { receivedAt: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(registrations)
}

const fmtDay = (d: string) => { if (!d) return ''; const [y, m, day] = d.split('-'); const dt = new Date(+y, +m - 1, +day); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function fmtDates(s?: string, e?: string) {
  if (!s) return ''
  if (e && e !== s) {
    const [sy, sm] = s.split('-'); const [ey] = e.split('-')
    if (sy === ey && sm === e.split('-')[1]) return `${fmtDay(s)}–${parseInt(e.split('-')[2])}, ${ey}`
    if (sy === ey) return `${fmtDay(s)} – ${fmtDay(e)}, ${ey}`
    return `${fmtDay(s)}, ${sy} – ${fmtDay(e)}, ${ey}`
  }
  return `${fmtDay(s)}, ${s.split('-')[0]}`
}
const jget = async (key: string) => { try { const r = await prisma.appSetting.findUnique({ where: { key } }); return r ? JSON.parse(r.value || '{}') : {} } catch { return {} } }

// Build the confirmation "response letter" and (optionally) email it to the club contact.
async function buildAndSendConfirmation(reg: any) {
  try {
    const t: any = await prisma.tournament.findUnique({ where: { id: reg.tournamentId } })
    if (!t) return null
    const org: any = t.orgId ? await prisma.organization.findUnique({ where: { id: t.orgId } }) : null
    const orgForms = t.orgId ? await jget(`orgForms:${t.orgId}`) : {}
    let override: any = null
    try { const rr: any[] = await prisma.$queryRawUnsafe('SELECT regConfirmationOverride FROM "Tournament" WHERE id = ?', reg.tournamentId); const raw = rr?.[0]?.regConfirmationOverride; if (raw) override = JSON.parse(raw) } catch {}
    const cfg = resolveRegConfirmation(orgForms.registration, override)

    const teams = (reg.teams || []).map((x: any) => ({ team: x.teamName || x.clubName || 'Team', division: x.division || '' }))
    let amount = Number(reg.invoiceAmount) || 0
    if (!amount) { try { amount = calcFee(teams, parsePricing((t as any).registrationPricing)) } catch {} }
    if (reg.discountAmount) amount = Math.max(0, amount - Number(reg.discountAmount))
    // Paid online at signup? Thank them in the letter instead of dunning them.
    const received = (reg.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)
    const paid = amount > 0 && received >= amount

    // Public links live on the org's custom domain when it has one
    // (e.g. sunshineeventsgroup.com), matching where families actually browse.
    const base = (path: string) => tournamentAbs(org?.slug, path)
    const data: RegLetterData = {
      tournamentName: t.name || 'the tournament',
      orgName: org?.name || '',
      dates: fmtDates((t as any).startDate, (t as any).endDate),
      location: (t as any).location || '',
      clubName: reg.clubName || reg.clubContact || '',
      contactName: reg.clubContact || '',
      teams,
      amount,
      paymentMethod: reg.paymentMethod || '',
      paid,
      eventUrl: base(`/tournaments/${reg.tournamentId}/event`),
      gameDayUrl: base(`/tournaments/${reg.tournamentId}/today`),
      // Waivers are in-app now — point families at the tournament's online form.
      waiverUrl: base(`/tournaments/${reg.tournamentId}/player-waiver`),
      // Single-use link inviting the coach to set up portal access for this club.
      // Best-effort: if the token can't be issued we simply omit the CTA.
      ...(await (async () => {
        const token = await issueClaimToken(reg.id)
        return token ? { claimUrl: claimUrl(SITE_URL, token) } : {}
      })()),
    }
    const letter = buildRegLetter(cfg, data)

    let emailed = false
    if (cfg.enabled && reg.contactEmail && emailEnabled()) {
      // best-effort; sendEmail never throws so registration is never blocked
      const sent = await sendEmail({
        to: reg.contactEmail,
        subject: letter.subject,
        html: letterToEmailHtml(letter, data),
        ...(org?.contactEmail ? { replyTo: org.contactEmail } : {}),
      })
      emailed = sent.ok
    }

    // Internal heads-up so a human can call the club director while it's warm.
    // Recipients come from the confirmation config's notifyEmails (comma-
    // separated); org site contact + org account email are the fallback.
    if (emailEnabled()) {
      const orgSite = t.orgId ? await jget(`orgSite:${t.orgId}`) : {}
      const fallback = [orgSite?.contact?.email, org?.contactEmail].filter(Boolean).join(',')
      const recipients = String(cfg.notifyEmails || fallback || '')
        .split(',').map(s => s.trim()).filter(s => s.includes('@'))
      if (recipients.length) {
        const notify: RegNotifyData = {
          ...data,
          contactEmail: reg.contactEmail || '',
          contactPhone: reg.contactPhone || '',
          clubBasedIn: reg.clubBasedIn || '',
          needsHotel: reg.needsHotel || '',
          notes: reg.notes || '',
          instagram: reg.instagramHandle || '',
          // Staff console link stays on whistleready.app — that's where staff log in.
          adminUrl: `${SITE_URL}/tournaments/${reg.tournamentId}/registrations`,
        }
        await sendEmail({
          to: recipients.join(','),
          subject: organizerEmailSubject(notify),
          html: organizerEmailHtml(notify),
          ...(reg.contactEmail ? { replyTo: reg.contactEmail } : {}),
        })
      }
    }
    return { letter, data, emailed }
  } catch { return null }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    tournamentId, clubName, clubContact, contactEmail, contactPhone,
    clubBasedIn, clubWebsite, numTeams, needsHotel, paymentMethod, notes, teams,
    invoiceAmount, discountAmount, discountNote, clubLogoUrl, source, instagram,
  } = body

  const isImport = source === 'import'
  if (!tournamentId || !clubContact || (!isImport && (!contactEmail || !contactPhone))) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // The public form doesn't send invoiceAmount, which left every registration
  // invoiced at $0 on the staff page (the letter computed its own fee, hiding
  // the bug). The server now owns the number: compute from the tournament's
  // pricing whenever the caller didn't provide one.
  let invoice = Number(invoiceAmount) || 0
  if (!invoice) {
    try {
      const t: any = await prisma.tournament.findUnique({ where: { id: tournamentId } })
      invoice = calcFee((teams || []).map((x: any) => ({ division: x.division || '' })), parsePricing(t?.registrationPricing))
    } catch { /* leave 0 if pricing can't be read */ }
  }

  await ensureRegistrationColumns()
  const registration = await prisma.teamRegistration.create({
    data: {
      tournamentId,
      clubName: clubName || '',
      clubContact,
      contactEmail,
      contactPhone,
      clubBasedIn: clubBasedIn || '',
      clubWebsite: clubWebsite || '',
      numTeams: Number(numTeams) || 1,
      needsHotel: needsHotel === true ? 'Yes' : needsHotel === false ? 'No' : (needsHotel || 'No'),
      paymentMethod: paymentMethod || 'check',
      notes: notes || '',
      invoiceAmount: invoice,
      discountAmount: Number(discountAmount) || 0,
      discountNote: discountNote || '',
      clubLogoUrl: clubLogoUrl || '',
      teams: {
        create: (teams || []).map((t: any) => ({
          clubName: t.clubName || '',
          teamName: t.teamName || '',
          division: t.division || '',
          coachName: t.coachName || '',
          coachPhone: t.coachPhone || '',
          coachEmail: t.coachEmail || '',
          logoUrl: t.logoUrl || (clubLogoUrl || ''),
        })),
      },
    },
    include: { teams: true, payments: true },
  })

  // instagramHandle is a raw column (not in the Prisma schema) — write it separately.
  const ig = normalizeInstagram(instagram)
  if (ig) { try { await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "instagramHandle" = ? WHERE id = ?`, ig, registration.id) } catch {} }

  // Public form registrations get a confirmation letter (on-screen + email); imports don't.
  const confirmation = isImport ? null : await buildAndSendConfirmation({ ...registration, instagramHandle: ig })

  return NextResponse.json({ ...registration, confirmation }, { status: 201 })
}
