import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMoney } from '@/lib/apiAuth'
import { loadInvoice } from '@/lib/invoice'
import { buildInvoicePdf, invoiceFileName, money } from '@/lib/invoicePdf'
import { sendEmail, orgSender } from '@/lib/email'
import { orgLogoUrl } from '@/lib/org'
import { tournamentAbs } from '@/lib/seo'
import { renderEmail, absUrl, imageSize, fitBox, detailRows, button } from '@/lib/emailLayout'
import { letterBodyHtml } from '@/lib/inviteLetterText'
import { registrationRecipients, directorEmailsByRegistration } from '@/lib/clubDirectorLinks'
import { allowRequest, clientIp, rateLimitedResponse } from '@/lib/rateLimit'

// A CLUB'S INVOICE AS A PDF, and the office emailing it.
//
// Melissa Villanti (M&D Orlando), Oct 5 2026: "Could you send me an invoice so
// that I can submit to my accounting team so they can issue a check? That is the
// only way that I am able to pay." Bo: a printable version on the pay page, so it
// stays self-serve, as well as one the office emails.
//
// GET is public, like the pay page and api/registrations/[id]/pay-info: the
// registration id in the link is the key. The PDF carries what an accounting
// office needs (club, contact's name, teams, amounts, where to send a check) and
// no email address or phone number of anyone at the club.
//
// POST emails it, and is for staff who can see money.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WINDOW = 60_000

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!allowRequest(`invoice:${clientIp(req)}`, 30, WINDOW)) return rateLimitedResponse(WINDOW)
  try {
    const inv = await loadInvoice(params.id)
    if (inv && 'mergedInto' in inv) {
      // Merged into another registration: old links follow the survivor.
      const to = new URL(`/api/registrations/${encodeURIComponent(inv.mergedInto)}/invoice`, req.url)
      to.search = req.nextUrl.search
      return NextResponse.redirect(to, 302)
    }
    if (!inv) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    const pdf = await buildInvoicePdf(inv.doc)
    const name = invoiceFileName(inv.doc)
    // ?view=1 opens it in the browser (the office's preview); otherwise it downloads.
    const how = req.nextUrl.searchParams.get('view') ? 'inline' : 'attachment'
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${how}; filename="${name.replace(/[^\x20-\x7e]/g, '').replace(/"/g, "'")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex',
      },
    })
  } catch (e) {
    console.error('[invoice] PDF failed:', e)
    return NextResponse.json({ error: 'Could not make the invoice' }, { status: 500 })
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireMoney()
  if (!gate.ok) return gate.res
  let body: { toClub?: unknown; also?: unknown; note?: unknown } = {}
  try { body = await req.json() } catch { /* defaults below */ }

  // Extra addresses: the club's accounting office, usually. Typed by staff, so
  // checked one by one and named back if any is wrong, never silently dropped.
  const typed = String(body.also ?? '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean)
  const bad = typed.filter(e => !EMAIL_RE.test(e))
  if (bad.length) return NextResponse.json({ error: `Not an email address: ${bad.join(', ')}` }, { status: 400 })
  if (typed.length > 5) return NextResponse.json({ error: 'Up to 5 extra addresses' }, { status: 400 })
  const note = String(body.note ?? '').trim().slice(0, 1500)

  const inv = await loadInvoice(params.id)
  if (!inv) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
  if ('mergedInto' in inv) return NextResponse.json({ error: 'This registration was merged into another one. Email the invoice from that one.' }, { status: 409 })
  const { doc, reg, org, tournament } = inv

  const club = body.toClub === false ? [] : registrationRecipients(reg.id, reg.contactEmail, await directorEmailsByRegistration(reg.tournamentId))
  const to = [...new Set([...club, ...typed])]
  if (!to.length) return NextResponse.json({ error: body.toClub === false ? 'Add an address to send it to' : 'No email on file for this club. Add an address to send it to.' }, { status: 400 })

  const pdf = await buildInvoicePdf(doc)
  const first = String(reg.clubContact || '').trim().split(/\s+/)[0] || ''
  const due = doc.balance > 0
  const check = doc.payTo.checkAddress
    ? `To pay by check, make it payable to ${doc.payTo.checkPayableTo} and mail it to ${doc.payTo.checkAddress}, with ${doc.number} on the memo line.`
    : ''
  const text = [
    `Hi ${first || `${reg.clubName} team`},`,
    due
      ? `Attached is the invoice for ${reg.clubName} at ${doc.event.name}${doc.event.dates ? ` (${doc.event.dates})` : ''}. The balance is ${money(doc.balance)}, ${doc.dueText.startsWith('Before ') ? `due ${doc.dueText.replace(/^Before /, 'before ')}` : 'due on receipt'}.`
      : `Attached is the paid invoice for ${reg.clubName} at ${doc.event.name}, for your records. There is nothing left to pay.`,
    note,
    due ? [check, `You can also pay online by bank transfer (no fee) or card: ${doc.payUrl}`].filter(Boolean).join(' ') : '',
    'If your accounting office needs our W-9, just reply to this email.',
  ].filter(Boolean).join('\n\n')

  const orgHome = tournamentAbs(org?.slug, '')
  const eventLogo = absUrl(orgHome, tournament.logoUrl)
  const orgLogo = absUrl(orgHome, await orgLogoUrl(org?.id, org?.logoUrl)) || absUrl(orgHome, '/icon-192.png')
  const html = renderEmail({
    orgName: org?.name || doc.org.name,
    eyebrow: tournament.name,
    logoUrl: eventLogo, logoHref: tournamentAbs(org?.slug, `/tournaments/${reg.tournamentId}/event`), logoAlt: tournament.name,
    logoBox: fitBox(await imageSize(eventLogo), 150, 46),
    footerLogoUrl: orgLogo, footerHref: orgHome, footerLogoBox: fitBox(await imageSize(orgLogo), 120, 40),
    body: `${letterBodyHtml(text)}${detailRows([
      ['Invoice', doc.number],
      ['Teams', `${doc.lines.length}`],
      ['Total', money(doc.invoiced - doc.discount)],
      [due ? 'Balance due' : 'Balance', money(doc.balance)],
    ])}${due ? button(doc.payUrl, 'View or pay online') : ''}`,
    footerNote: 'Questions? Just reply to this email.',
  })

  // A copy to the org's own inbox: the only record of exactly what went out,
  // attachment and all.
  const office = String(org?.contactEmail || '').trim()
  const sent = await sendEmail({
    to,
    ...(EMAIL_RE.test(office) ? { cc: office } : {}),
    subject: `Invoice ${doc.number}: ${tournament.name} (${reg.clubName})`,
    html, text,
    attachments: [{ filename: invoiceFileName(doc), content: Buffer.from(pdf).toString('base64'), type: 'application/pdf' }],
    ...orgSender(org),
  })
  if (!sent.ok) return NextResponse.json({ error: sent.error || 'The email did not go out' }, { status: 502 })

  // "Invoice Oct 5" on the registration card, next to the other letters.
  const sentAt = new Date().toISOString()
  try {
    try { await prisma.$executeRawUnsafe(`ALTER TABLE "TeamRegistration" ADD COLUMN "commEmailLog" TEXT NOT NULL DEFAULT ''`) } catch { /* exists */ }
    const rows: { commEmailLog?: string | null }[] = await prisma.$queryRawUnsafe(`SELECT "commEmailLog" FROM "TeamRegistration" WHERE id = ?`, reg.id)
    let log: Record<string, string> = {}
    try { log = JSON.parse(String(rows?.[0]?.commEmailLog || '') || '{}') } catch { /* fresh log */ }
    log.invoice = sentAt
    await prisma.$executeRawUnsafe(`UPDATE "TeamRegistration" SET "commEmailLog" = ? WHERE id = ?`, JSON.stringify(log), reg.id)
  } catch { /* the email went; the stamp is best effort */ }

  return NextResponse.json({ ok: true, to, sentAt })
}
