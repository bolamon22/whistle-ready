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
import { orgLogoUrl } from '@/lib/org'
import { vendorConfig, priceLabel } from '@/lib/vendorForm'
import { mediaConfig, photographerSharePct, commitmentLines } from '@/lib/mediaForm'
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
    // A vendor can take more than one weekend. A booth is sold, reviewed, approved and
    // paid for PER EVENT -- we might have room at Monster Mash and not Fall Classic, the
    // fee is per booth, and the packet (venue, load-in) differs -- so each pick becomes
    // its own application. They share a groupId so they can be recognised as one
    // submission later. Everything downstream (staff lists, approval, payment, packets)
    // then works unchanged.
    const eventIds: string[] = (formType === 'vendor' || formType === 'media') && Array.isArray(data.tournamentIds)
      ? ([...new Set(data.tournamentIds.map((x: any) => String(x || '')).filter(Boolean))] as string[])
      : []
    const siblings: { id: string; tournamentId: string; name: string }[] = []
    let saved: Awaited<ReturnType<typeof insertSubmission>>
    if (eventIds.length > 1) {
      const groupId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
      let nameOf = new Map<string, string>()
      try {
        const rows = await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, name FROM "Tournament" WHERE id IN (${eventIds.map(() => '?').join(',')})`, ...eventIds)
        nameOf = new Map(rows.map((r: any) => [String(r.id), String(r.name || '')]))
      } catch { /* the rows still save; the email just won't name them */ }
      const one = (tid: string) => insertSubmission({
        orgId, formType,
        data: { ...data, tournamentId: tid, tournamentName: nameOf.get(tid) || '', groupId, groupSize: eventIds.length },
      })
      // First one separately so `saved` is definitely assigned in both branches.
      saved = await one(eventIds[0])
      siblings.push({ id: saved.id, tournamentId: eventIds[0], name: nameOf.get(eventIds[0]) || '' })
      for (const tid of eventIds.slice(1)) {
        const row = await one(tid)
        siblings.push({ id: row.id, tournamentId: tid, name: nameOf.get(tid) || '' })
      }
    } else {
      saved = await insertSubmission({ orgId, formType, data })
    }
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

    // Sponsorship enquiries. These used to be a mailto: link on the vendor page, which
    // sent us nothing and did nothing at all on a phone with no mail app configured.
    // It's a lead, so it gets stored and it gets emailed.
    if (formType === 'sponsor') {
      try {
        const orgRows = await prisma.$queryRawUnsafe<any[]>('SELECT name, slug, logoUrl, contactEmail FROM "Organization" WHERE id = ?', orgId)
        const org = orgRows?.[0] || {}
        const orgName = String(org.name || 'Sunshine Events Group')
        const base = orgBaseUrl(org.slug)
        const logo = absUrl(base, await orgLogoUrl(orgId, org.logoUrl))
        let cfg = vendorConfig({})
        try {
          const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${orgId}` } })
          cfg = vendorConfig(row ? JSON.parse(row.value || '{}').vendor : {})
        } catch { /* defaults are fine */ }

        const company = String(data.companyName || 'A company')
        const evName = String(data.tournamentName || '')
        const rows: [string, string][] = [
          ['Company', company], ['Contact', String(data.contactName || '')],
          ['Email', String(data.email || '')], ['Phone', String(data.phone || '')],
          ['Event they were on', evName],
          ['What they said', String(data.message || '').slice(0, 400)],
        ]

        // to the organizer — sponsorship notes go to the sponsorship address when one
        // is set, otherwise wherever vendor applications already land.
        const notify = String(cfg.sponsorEmail || cfg.notifyEmail || org.contactEmail || OFFICE_CC).trim()
        if (notify && emailEnabled()) {
          await sendEmail({
            ...orgSender(org), to: notify,
            subject: `Sponsorship enquiry — ${company}`,
            html: renderEmail({ orgName, logoUrl: logo, eyebrow: 'Sponsorship', title: `${company} wants the deck`,
              body: `<p style="margin:0 0 4px">Someone asked for the sponsorship deck from the vendor page.</p>${detailRows(rows)}<p style="margin:16px 0 0;font-size:13px;color:#94a3b8">Reply straight to this email to reach them.</p>`,
            }),
            ...(String(data.email || '').trim() ? { replyTo: String(data.email).trim() } : {}),
          })
        }

        // to them
        const to = String(data.email || '').trim()
        if (to && emailEnabled()) {
          await sendEmail({
            ...orgSender(org), to,
            subject: `Sponsorship — ${orgName}`,
            html: renderEmail({ orgName, logoUrl: logo, eyebrow: 'Sponsorship', title: `Thanks, ${company}`,
              body: `<p style="margin:0 0 14px">We&rsquo;ve got your note and we&rsquo;ll come back to you with the deck and what&rsquo;s still available.</p>`
                + panel('What happens next', 'Sponsorship is built around what you&rsquo;re trying to reach, so we&rsquo;d rather talk than send a price list. Expect a reply from a person, not an autoresponder.')
                + `<p style="margin:16px 0 0">If it&rsquo;s easier, just reply here.</p>`,
              footerNote: 'You asked about sponsorship on our vendor page.',
            }),
          })
        }
      } catch { /* mail must never fail the submission */ }
      return NextResponse.json({ ok: true, id: saved.id })
    }

    // A family booking a photographer. The org is not a party to this sale -- it
    // credentialed the photographer and hosts the page -- so the request goes TO the
    // photographer, reply-to the family, and the org is only copied for the record.
    if (formType === 'photo-request') {
      try {
        const orgRows = await prisma.$queryRawUnsafe<any[]>('SELECT name, slug, logoUrl, contactEmail FROM "Organization" WHERE id = ?', orgId)
        const org = orgRows?.[0] || {}
        const orgName = String(org.name || '')
        const base = orgBaseUrl(org.slug)
        const logo = absUrl(base, await orgLogoUrl(orgId, org.logoUrl))

        const shooter = String(data.photographerName || 'the photographer')
        const shooterEmail = String(data.photographerEmail || '').trim()
        const evName = String(data.tournamentName || '')
        const price = Number(data.packagePrice) || 0
        const rows: [string, string][] = [
          ['Event', evName],
          ['Package', `${String(data.packageName || '')}${price > 0 ? ` \u00b7 ${priceLabel(price)}` : ''}`],
          ['Player', String(data.playerName || '')],
          ['Club / team', String(data.club || '')],
          ['Division', String(data.division || '')],
          ['Jersey', String(data.jersey || '')],
          ['Notes', String(data.notes || '').slice(0, 300)],
        ]

        // --- to the photographer, so they can reply straight to the family ---
        if (shooterEmail && emailEnabled()) {
          const body = [
            `<p style="margin:0 0 14px">A family asked to book you${evName ? ` at <strong style="color:#0f172a">${esc(evName)}</strong>` : ''}.</p>`,
            detailRows([
              ['Contact', String(data.contactName || '')],
              ['Email', String(data.email || '')],
              ['Phone', String(data.phone || '')],
              ...rows,
            ]),
            `<p style="margin:16px 0 0">Reply to this email and it goes straight to them.</p>`,
          ].join('')
          await sendEmail({
            ...orgSender(org), to: shooterEmail,
            replyTo: String(data.email || '') || undefined,
            subject: `Photo request \u2014 ${String(data.playerName || 'a player')}${evName ? ` (${evName})` : ''}`,
            html: renderEmail({ orgName, logoUrl: logo, eyebrow: 'Photo request', title: `New booking request`, body }),
          })
        }

        // --- receipt to the family ---
        const to = String(data.email || '').trim()
        if (to && emailEnabled()) {
          const body = [
            `<p style="margin:0 0 14px">Thanks \u2014 your request has gone to <strong style="color:#0f172a">${esc(shooter)}</strong>. They&rsquo;ll come back to you directly to confirm details and price.</p>`,
            detailRows(rows),
            panel('Worth knowing', [
              `<strong style="color:#0f172a">Nothing has been charged.</strong> ${esc(orgName)} credentials them but doesn&rsquo;t employ them \u2014 the booking, the price and the photos are between you and ${esc(shooter)}.`,
            ].join('')),
          ].join('')
          await sendEmail({
            ...orgSender(org), to,
            replyTo: shooterEmail || undefined,
            subject: `Photo request sent to ${shooter}`,
            html: renderEmail({
              orgName, logoUrl: logo, eyebrow: 'Photo request',
              title: `We passed it on`,
              body,
              footerNote: `You&rsquo;re receiving this because you requested photos${evName ? ` at ${esc(evName)}` : ''}.`,
            }),
          })
        }
        // --- and a copy to the organizer ---
        // The org isn't a party to this sale, but it credentialed the photographer and
        // is the one who has to answer for them, so it needs to know a booking happened
        // and who made it. Sent, not just stored: nobody checks a list they don't know
        // has changed.
        let notify = ''
        try {
          const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${orgId}` } })
          notify = String(mediaConfig(JSON.parse(row?.value || '{}').media).notifyEmail || '').trim()
        } catch { /* fall through to the org contact */ }
        notify = notify || String(org.contactEmail || OFFICE_CC).trim()
        if (notify && emailEnabled()) {
          const link = `${base}${data.tournamentId ? `/tournaments/${data.tournamentId}/photo-requests` : ''}`
          const body = [
            `<p style="margin:0 0 4px">A family booked <strong style="color:#0f172a">${esc(shooter)}</strong>${evName ? ` for <strong style="color:#0f172a">${esc(evName)}</strong>` : ''}.</p>`,
            detailRows([
              ['Booked', shooter],
              ['Booked by', String(data.contactName || '')],
              ['Email', String(data.email || '')],
              ['Phone', String(data.phone || '')],
              ...rows,
            ]),
            data.tournamentId ? button(link, 'See all photo bookings') : '',
            `<p style="margin:14px 0 0;font-size:13px;color:#94a3b8">For your records only \u2014 the booking, the price and the photos are between the family and ${esc(shooter)}.</p>`,
          ].join('')
          await sendEmail({
            ...orgSender(org), to: notify,
            subject: `Photo booking \u2014 ${shooter}${evName ? ` (${evName})` : ''}`,
            html: renderEmail({ orgName, logoUrl: logo, eyebrow: 'Photo booking', title: `${esc(String(data.contactName || 'A family'))} booked ${shooter}`, body }),
          })
        }
      } catch { /* mail must never fail the submission */ }
      return NextResponse.json({ ok: true, id: saved.id })
    }

    // Media credential applications. Same shape as a vendor application -- reviewed,
    // then approved -- but nobody is charged, so there is no fee to freeze and no
    // payment link. The applicant gets a confirmation; the organizer gets told,
    // because until the review page is open this email is how they find out at all.
    if (formType === 'media') {
      try {
        const orgRows = await prisma.$queryRawUnsafe<any[]>('SELECT name, slug, logoUrl, contactEmail FROM "Organization" WHERE id = ?', orgId)
        const org = orgRows?.[0] || {}
        const orgName = String(org.name || '')
        const base = orgBaseUrl(org.slug)
        const logo = absUrl(base, await orgLogoUrl(orgId, org.logoUrl))

        let cfg = mediaConfig({}, orgName)
        try {
          const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${orgId}` } })
          cfg = mediaConfig(JSON.parse(row?.value || '{}').media, orgName)
        } catch { /* defaults are fine for the email */ }

        const who = String(data.company || data.name || 'there')
        const evNames = siblings.length ? siblings.map(x => x.name).filter(Boolean) : [String(data.tournamentName || '')].filter(Boolean)
        const evName = evNames.join(', ')
        const picked = cfg.levels.filter(l => (Array.isArray(data.levels) ? data.levels : []).includes(l.id))
        const rows: [string, string][] = [
          [evNames.length > 1 ? 'Events' : 'Event', evName],
          ['Applying to', picked.map(l => l.name).join(' \u00b7 ')],
          ['Portfolio', String(data.portfolio || '')],
        ]

        // --- to the applicant ---
        const to = String(data.email || '').trim()
        if (to && emailEnabled()) {
          const body = [
            `<p style="margin:0 0 14px">Thanks \u2014 we&rsquo;ve got your credential application${evName ? ` for <strong style="color:#0f172a">${esc(evName)}</strong>` : ''}.</p>`,
            detailRows(rows),
            panel('What happens next', [
              '<strong style="color:#0f172a">We look at the work, not the gear.</strong> Someone opens your portfolio link and reads it properly, so give us a day or two.',
              '<br><br>If you&rsquo;re approved you&rsquo;ll get your credential, where to check in, the field rules, and the link to upload what you shoot.',
              '<br><br><strong style="color:#0f172a">You keep the copyright in everything you shoot.</strong> We post what you upload on our own channels and in our own promotion, always with your credit on it. Nothing gets resold, and you can ask us to take a photo down whenever you like.',
            ].join('')),
            (() => {
              const commits = commitmentLines(cfg.commitments)
              return commits.length
                ? panel('What you agreed to', commits.map(c => `&bull; ${esc(c)}`).join('<br>'))
                : ''
            })(),
            `<p style="margin:18px 0 0">Questions in the meantime? Just reply to this email.</p>`,
          ].join('')
          await sendEmail({
            ...orgSender(org), to,
            subject: `Media credential application received${evName ? ` \u2014 ${evName}` : ''}`,
            html: renderEmail({
              orgName, logoUrl: logo, eyebrow: 'Media credential',
              title: `We\u2019ve got it, ${who}`,
              body,
              footerNote: `You&rsquo;re receiving this because you applied for a media credential${evName ? ` at ${esc(evName)}` : ''}.`,
            }),
          })
        }

        // --- to the organizer ---
        const notify = String(cfg.notifyEmail || org.contactEmail || OFFICE_CC).trim()
        if (notify && emailEnabled()) {
          const link = `${base}${data.tournamentId ? `/tournaments/${data.tournamentId}/media-requests` : '/dashboard/org/forms'}`
          const body = [
            `<p style="margin:0 0 4px">Someone just applied for a media credential${evName ? ` at <strong style="color:#0f172a">${esc(evName)}</strong>` : ''}.</p>`,
            detailRows([
              ['Name', String(data.name || '')], ['Business', String(data.company || '')],
              ['Email', String(data.email || '')], ['Phone', String(data.phone || '')],
              ['Instagram', data.instagram ? `@${String(data.instagram)}` : ''],
              ['Gear', String(data.gear || '')], ['Insurance', String(data.insurance || '')],
              ...rows,
            ]),
            button(link, 'Review this application'),
            `<p style="margin:14px 0 0;font-size:13px;color:#94a3b8">Open the portfolio link before you decide \u2014 it&rsquo;s the only real gate on this form.</p>`,
          ].join('')
          await sendEmail({
            ...orgSender(org), to: notify,
            subject: `Media credential application \u2014 ${who}${evName ? ` (${evName})` : ''}`,
            html: renderEmail({ orgName, logoUrl: logo, eyebrow: 'Needs review', title: `${who} wants to shoot`, body }),
          })
        }
      } catch { /* mail must never fail the submission */ }
      return NextResponse.json({ ok: true, id: saved.id, applications: siblings.length || 1 })
    }

    // Vendor applications get their own mail: a branded confirmation to the applicant
    // that says what they actually applied for, and — new — a heads-up to the organizer,
    // who until now only found out by refreshing the requests page.
    if (formType === 'vendor') {
      try {
        const orgRows = await prisma.$queryRawUnsafe<any[]>('SELECT name, slug, logoUrl, contactEmail FROM "Organization" WHERE id = ?', orgId)
        const org = orgRows?.[0] || {}
        const orgName = String(org.name || 'Sunshine Events Group')
        const base = orgBaseUrl(org.slug)
        const logo = absUrl(base, await orgLogoUrl(orgId, org.logoUrl))

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
        // Name every weekend they took, not just the first row's.
        const evNames = siblings.length ? siblings.map(x => x.name).filter(Boolean) : [String(data.tournamentName || '')].filter(Boolean)
        const evName = evNames.join(', ')
        const evCount = Math.max(evNames.length, 1)
        const typeName = String(data.vendorTypeName || data.level || '')
        const fee = Number(data.boothFee) || 0
        const feeText = fee > 0
          ? (evCount > 1 ? `${priceLabel(fee)} per event \u00b7 ${priceLabel(fee * evCount)} total` : priceLabel(fee))
          : 'Confirmed on approval'
        const rows: [string, string][] = [
          [evCount > 1 ? 'Events' : 'Event', evName], ['Booth type', typeName], ['Booth fee', feeText],
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
              evCount > 1 ? '<br><br><strong style=\"color:#0f172a\">Each weekend is reviewed on its own.</strong> You may hear yes on one and no on another, and you only pay for the ones you get.' : '',
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
      return NextResponse.json({ ok: true, id: saved.id, applications: siblings.length || 1 })
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
                 <p style="color:#334155;font-size:15px;line-height:1.6;margin:6px 0 12px">${playerName ? `${playerName}'s` : 'Your'} player card is ready \u2014 save it, print it, share it. Open it any time to change the photo or the link its QR code opens.</p>
                 <p style="color:#475569;font-size:13.5px;line-height:1.6;margin:0 0 12px"><strong style="color:#0f172a">Printing it?</strong> The Print button on the card page sizes it to a real badge (2.125\u2033 \u00d7 3.375\u2033) \u2014 cut along the edge and it fits a standard lanyard holder.</p>
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
