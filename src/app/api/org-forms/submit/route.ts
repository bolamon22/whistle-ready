import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendEmail, emailEnabled } from '@/lib/email'
import { mdToHtml } from '@/app/o/[slug]/_md'
import { insertSubmission, countsByType } from '@/lib/formSubmissions'
import { appBaseUrl, playerPassEnabled } from '@/lib/playerPass'
import { orgSender, OFFICE_CC } from '@/lib/email'
import { orgBaseUrl } from '@/lib/orgDomains'
import { vendorConfig, priceLabel } from '@/lib/vendorForm'
import { renderEmail, detailRows, panel, button, absUrl, esc } from '@/lib/emailLayout'

// PUBLIC: a registrant submits a standalone org form (no auth). Validates the org
// exists, then stores the submission as its own row (see src/lib/formSubmissions.ts —
// the old per-org JSON blob lost entries when two people submitted at once).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as any
    const orgId = String(body.orgId || '')
    const formType = String(body.formType || 'player')
    const data = body.data || {}
    if (!orgId) return NextResponse.json({ error: 'Missing organization' }, { status: 400 })
    const org = await prisma.$queryRawUnsafe<any[]>('SELECT id FROM "Organization" WHERE id = ?', orgId)
    if (!org || org.length === 0) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    const saved = await insertSubmission({ orgId, formType, data })
    // A family added their club's logo because the registration had none: keep it on the
    // registration too, so every card for that club (and the staff pages) get it. First one
    // in wins; staff can change it from the team registration afterwards.
    try {
      const logo = String(data.clubLogoUrl || '').trim(), club = String(data.clubName || '').trim(), tid = String(data.tournamentId || '').trim()
      if (formType === 'player' && /^\/api\/img\/[A-Za-z0-9_-]+$/.test(logo) && club && tid) {
        await prisma.$executeRawUnsafe(
          'UPDATE "TeamRegistration" SET "clubLogoUrl" = ? WHERE "tournamentId" = ? AND "clubName" = ? AND "deletedAt" IS NULL AND ("clubLogoUrl" IS NULL OR "clubLogoUrl" = \'\')',
          logo, tid, club)
      }
    } catch { /* the card still works from the submission's own copy */ }
    // Tournament player waivers get a pass (/pass/<token>): shown on the confirmation
    // screen, linked in the email, scanned at check-in.
    const passUrl = formType === 'player' && saved.passToken && data.tournamentId && await playerPassEnabled(orgId) ? `${appBaseUrl(req)}/pass/${saved.passToken}` : ''

    // Vendor applications get their own mail: a branded confirmation to the applicant
    // that says what they actually applied for, and — new — a heads-up to the organizer,
    // who until now only found out by refreshing the requests page.
    if (formType === 'vendor') {
      try {
        const orgRows = await prisma.$queryRawUnsafe<any[]>('SELECT name, slug, logoUrl, contactEmail FROM "Organization" WHERE id = ?', orgId)
        const org = orgRows?.[0] || {}
        const orgName = String(org.name || 'Sunshine Events Group')
        const base = orgBaseUrl(org.slug)
        const logo = absUrl(base, org.logoUrl)

        let cfg = vendorConfig({})
        let wantsConfirmation = true
        try {
          const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${orgId}` } })
          const raw = row ? JSON.parse(row.value || '{}').vendor : {}
          cfg = vendorConfig(raw)
          // Honour the same "email a confirmation" switch the other forms use. It only
          // silences the APPLICANT's copy -- the organizer still gets told.
          wantsConfirmation = raw?.emailConfirmation !== false
        } catch { /* defaults are fine for the email */ }

        const company = String(data.companyName || 'your company')
        const evName = String(data.tournamentName || '')
        const typeName = String(data.vendorTypeName || data.level || '')
        const fee = Number(data.boothFee) || 0
        const feeText = fee > 0 ? priceLabel(fee) : 'Confirmed on approval'
        const rows: [string, string][] = [
          ['Event', evName], ['Booth type', typeName], ['Booth fee', feeText],
          [data.selling === false ? 'Showcasing' : 'Products', String(data.products || '').slice(0, 180)],
        ]

        // --- to the applicant ---
        const to = String(data.email || '').trim()
        if (to && emailEnabled() && wantsConfirmation) {
          const body = [
            `<p style="margin:0 0 14px">Thanks — we&rsquo;ve got your application${evName ? ` for <strong style="color:#0f172a">${esc(evName)}</strong>` : ''}. Here&rsquo;s what you sent us.</p>`,
            detailRows(rows),
            panel('What happens next', [
              '<strong style="color:#0f172a">We read every application.</strong> We look at what you sell, how it fits a youth sports event, and whether it collides with something already under contract.',
              '<br><br>If you&rsquo;re approved you&rsquo;ll get a link to your own booth page — your setup location, load-in and load-out times, and the place to pay. If you aren&rsquo;t, we&rsquo;ll tell you that too.',
              '<br><br><strong style="color:#0f172a">Nothing has been charged.</strong> Applying doesn&rsquo;t reserve a spot and doesn&rsquo;t cost anything.',
            ].join('')),
            `<p style="margin:18px 0 0">Questions in the meantime? Just reply to this email.</p>`,
          ].join('')
          await sendEmail({
            ...orgSender(org),
            to,
            subject: `Vendor application received${evName ? ` — ${evName}` : ''}`,
            html: renderEmail({
              orgName, logoUrl: logo, eyebrow: 'Vendor application',
              title: `We’ve got it, ${company}`,
              body,
              footerNote: `You&rsquo;re receiving this because you applied for a vendor booth${evName ? ` at ${esc(evName)}` : ''}.`,
            }),
          })
        }

        // --- to the organizer ---
        const notify = String(cfg.notifyEmail || org.contactEmail || OFFICE_CC).trim()
        if (notify && emailEnabled()) {
          const link = `${base}${data.tournamentId ? `/tournaments/${data.tournamentId}/vendor-requests` : '/dashboard/org/forms'}`
          const body = [
            `<p style="margin:0 0 4px">A new vendor application just came in${evName ? ` for <strong style="color:#0f172a">${esc(evName)}</strong>` : ''}.</p>`,
            detailRows([
              ['Company', company], ['Contact', String(data.companyContact || '')],
              ['Email', String(data.email || '')], ['Phone', String(data.phone || '')],
              ['Website', String(data.website || '')],
              ...rows,
            ]),
            button(link, 'Review this application'),
            `<p style="margin:14px 0 0;font-size:13px;color:#94a3b8">Approving from that page emails them their booth page and payment link.</p>`,
          ].join('')
          await sendEmail({
            ...orgSender(org),
            to: notify,
            subject: `New vendor application — ${company}${evName ? ` (${evName})` : ''}`,
            html: renderEmail({ orgName, logoUrl: logo, eyebrow: 'Needs review', title: `${company} applied for a booth`, body }),
          })
        }
      } catch { /* mail must never fail the submission */ }
      return NextResponse.json({ ok: true, id: saved.id })
    }

    // Confirmation email (non-blocking) — uses the org's configured confirmation text.
    try {
      const to = String(((formType === 'vendor' || formType === 'staff') ? data.email : (data.playerEmail || data.parentEmail)) || '').trim()
      if (to && emailEnabled()) {
        const cfgRow = await prisma.appSetting.findUnique({ where: { key: `orgForms:${orgId}` } })
        const allCfg = cfgRow ? JSON.parse(cfgRow.value || '{}') : {}
        const cfg = (formType === 'vendor' ? allCfg.vendor : formType === 'staff' ? allCfg.staff : allCfg.player) || {}
        if (cfg.emailConfirmation !== false) {
          const orgRows = await prisma.$queryRawUnsafe<any[]>('SELECT name FROM "Organization" WHERE id = ?', orgId)
          const orgName = orgRows?.[0]?.name || 'the tournament'
          const title = cfg.confirmationTitle || (formType === 'vendor' ? 'Vendor request received!' : formType === 'staff' ? 'Application received!' : "You're registered!")
          const bodyHtml = mdToHtml(cfg.confirmationMessage || (formType === 'staff' ? "Thanks for your interest in working our events! We've received your application and will be in touch." : "Thanks for registering. We've received your information and signed waiver."))
          const playerName = String(data.playerName || '').trim().replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string))
          const passHtml = passUrl
            ? `<div style="margin-top:24px;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
                 <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#0f766e;font-weight:700">Player card</div>
                 <p style="color:#334155;font-size:15px;line-height:1.6;margin:6px 0 12px">${playerName ? `${playerName}'s` : 'Your'} player card is ready \u2014 save it, share it, show it off. Open it any time to change the photo or the link its QR code opens.</p>
                 <a href="${passUrl}" style="display:inline-block;background:#0d9488;color:#fff;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:10px;font-size:14px">Open player card</a>
                 <p style="color:#94a3b8;font-size:12px;margin:12px 0 0;word-break:break-all">${passUrl}</p>
               </div>`
            : ''
          await sendEmail({
            to,
            subject: `${formType === 'vendor' ? 'Vendor request received' : formType === 'staff' ? 'Application received' : 'Registration received'} \u2014 ${orgName}`,
            html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto"><h1 style="font-size:20px;color:#0f172a">${title}</h1><div style="color:#475569;font-size:15px;line-height:1.6">${bodyHtml}</div>${passHtml}<p style="color:#94a3b8;font-size:12px;margin-top:24px">${orgName} \u00b7 ${formType === 'vendor' ? 'Vendor request' : formType === 'staff' ? 'Staff application' : 'Player registration'} confirmation</p></div>`,
          })
        }
      }
    } catch { /* email failure must not fail the submission */ }

    return NextResponse.json({ ok: true, id: saved.id, passToken: passUrl ? saved.passToken : undefined, passUrl: passUrl || undefined })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to submit' }, { status: 500 })
  }
}

// AUTH: org admin/director reads submission COUNTS for the forms editor (it only shows totals).
function targetOrgId(req: NextRequest, session: any): string | null {
  const role = session?.user?.role
  const paramOrg = new URL(req.url).searchParams.get('org')
  if (role === 'admin' && paramOrg) return paramOrg
  return session?.user?.orgId ?? null
}
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (role !== 'admin' && role !== 'director') return NextResponse.json({ submissions: [] }, { status: 403 })
  const orgId = targetOrgId(req, session)
  if (!orgId) return NextResponse.json({ submissions: [] })
  try {
    const counts = await countsByType(orgId)
    return NextResponse.json({ submissions: [], counts })
  } catch {
    return NextResponse.json({ submissions: [], counts: {} })
  }
}
