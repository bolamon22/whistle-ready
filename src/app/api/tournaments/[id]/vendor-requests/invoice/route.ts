import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireMoney } from '@/lib/apiAuth'
import { tournamentOrgId, orgById, orgLogoUrl } from '@/lib/org'
import { getSubmission, ensureVendorInvoiceColumns } from '@/lib/formSubmissions'
import { loadVendorInvoice, recordVendorPayment, removeVendorPayment, markVendorInvoiceSent } from '@/lib/vendorInvoiceStore'
import { vendorInvoiceSummary } from '@/lib/vendorInvoiceSummary'
import { buildInvoicePdf, invoiceFileName, money } from '@/lib/invoicePdf'
import { qboSettings, syncVendorsNow } from '@/lib/qboSync'
import { sendEmail, orgSender } from '@/lib/email'
import { tournamentAbs } from '@/lib/seo'
import { renderEmail, absUrl, imageSize, fitBox, detailRows, button } from '@/lib/emailLayout'
import { letterBodyHtml } from '@/lib/inviteLetterText'

// THE OFFICE'S SIDE OF A VENDOR'S INVOICE (lib/vendorInvoice). Bo, Oct 12 2026:
// "I need to create invoices to send to vendors in the vendor area."
//
// For staff who can see money, on this event's approved vendors only:
//   email  the invoice PDF to the vendor (and their accounting office, say), a
//          copy to the org's inbox. With the QuickBooks sync on, the invoice goes
//          to QuickBooks first so the PDF carries QuickBooks' number; if
//          QuickBooks can't be reached it goes with Whistle Ready's number.
//   pay    a payment that came in by hand: a check, Zelle, cash
//   unpay  take one off again (entered by mistake)
//   qbo    send it to QuickBooks now, or bring QuickBooks up to date
// Every answer carries the vendor's row and invoice summary, so the page can
// redraw that one vendor.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireMoney()
  if (!gate.ok) return gate.res
  const orgId = await tournamentOrgId(params.id)
  if (!orgId) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (gate.role !== 'admin' && gate.orgId !== orgId) return NextResponse.json({ error: 'Not your event' }, { status: 403 })

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* checked below */ }
  const action = String(body.action || '')
  const subId = String(body.subId || '')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })

  // Only this event's vendor applications: never a waiver, nor another event's vendor.
  await ensureVendorInvoiceColumns()
  const own: { tournamentId?: string }[] = await prisma.$queryRawUnsafe(
    `SELECT "tournamentId" FROM "OrgFormSubmission" WHERE "orgId" = ? AND id = ? AND "formType" = 'vendor' LIMIT 1`, orgId, subId)
  if (!own.length || String(own[0].tournamentId || '') !== params.id) return NextResponse.json({ error: 'Vendor not found in this event' }, { status: 404 })

  const org = await orgById(orgId)
  const reply = async (extra: Record<string, unknown> = {}) => {
    const sub = await getSubmission(orgId, subId)
    const invoice = sub ? vendorInvoiceSummary(sub, org?.name || '', await qboSettings(orgId)) : null
    return NextResponse.json({ ok: true, submission: sub, invoice, ...extra })
  }
  const by = String(gate.session?.user?.email || '') || undefined

  if (action === 'pay') {
    const r = await recordVendorPayment(orgId, subId, {
      amount: body.amount, method: body.method, checkNumber: body.checkNumber, receivedAt: body.receivedAt, note: body.note,
    }, by)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return reply()
  }

  if (action === 'unpay') {
    const r = await removeVendorPayment(orgId, subId, String(body.paymentId || ''))
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return reply({ wasInQuickBooks: !!r.removed.qboPaymentId })
  }

  if (action === 'qbo') {
    const r = await syncVendorsNow(orgId, [subId], { userId: gate.userId })
    if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.busy ? 409 : 503 })
    const res = r.results[0]
    if (!res) return NextResponse.json({ error: 'QuickBooks is busy. Try again in a minute.' }, { status: 409 })
    if (res.status === 'error' || (res.status === 'skipped' && res.message)) {
      return NextResponse.json({ error: res.message || 'QuickBooks sync failed' }, { status: res.status === 'error' ? 502 : 409 })
    }
    return reply({ result: { status: res.status, docNumber: res.docNumber || '', payments: res.payments || 0 } })
  }

  if (action === 'email') {
    // Extra addresses (their accounting office, usually): typed by staff, so checked
    // one by one and named back if any is wrong, never silently dropped.
    const typed = String(body.also ?? '').split(/[\s,;]+/).map(x => x.trim().toLowerCase()).filter(Boolean)
    const bad = typed.filter(e => !EMAIL_RE.test(e))
    if (bad.length) return NextResponse.json({ error: `Not an email address: ${bad.join(', ')}` }, { status: 400 })
    if (typed.length > 5) return NextResponse.json({ error: 'Up to 5 extra addresses' }, { status: 400 })
    const note = String(body.note ?? '').trim().slice(0, 1500)

    const cur = await getSubmission(orgId, subId)
    if (!cur?.passToken || cur.status !== 'approved') return NextResponse.json({ error: 'Approve this vendor before sending an invoice.' }, { status: 409 })

    // QuickBooks first, so the PDF and the books carry the same number. It never
    // holds the email up: if QuickBooks can't be reached, the office is told.
    let qboNote = ''
    const settings = await qboSettings(orgId)
    if (settings.enabled && !cur.qboInvoiceId) {
      try {
        const r = await syncVendorsNow(orgId, [subId], { userId: gate.userId, budgetMs: 20_000 })
        if (!r.ok) qboNote = r.message
        else if (r.results[0]?.status === 'error') qboNote = r.results[0].message || 'QuickBooks sync failed'
      } catch (e) { qboNote = e instanceof Error ? e.message : String(e) }
    }

    const inv = await loadVendorInvoice(cur.passToken)
    if (!inv) return NextResponse.json({ error: 'There is no booth fee on this approval to invoice.' }, { status: 409 })
    const { doc, approval: a, tournament } = inv
    const vendorEmail = String(a.submission.data?.email || '').trim().toLowerCase()
    const toVendor = body.toVendor !== false && EMAIL_RE.test(vendorEmail) ? [vendorEmail] : []
    const to = [...new Set([...toVendor, ...typed])]
    if (!to.length) return NextResponse.json({ error: body.toVendor === false ? 'Add an address to send it to' : 'No email on this application. Add an address to send it to.' }, { status: 400 })

    const pdf = await buildInvoicePdf(doc)
    const company = doc.billTo.name
    const first = String(a.submission.data?.companyContact || '').trim().split(/\s+/)[0] || ''
    const due = doc.balance > 0
    const check = doc.payTo.checkAddress
      ? `To pay by check, make it payable to ${doc.payTo.checkPayableTo} and mail it to ${doc.payTo.checkAddress}, with ${doc.number} on the memo line.`
      : ''
    const text = [
      `Hi ${first || `${company} team`},`,
      due
        ? `Attached is the invoice for your booth at ${doc.event.name}${doc.event.dates ? ` (${doc.event.dates})` : ''}. The balance is ${money(doc.balance)}, ${doc.dueText.startsWith('Before ') ? `due ${doc.dueText.replace(/^Before /, 'before ')}` : 'due on receipt'}.`
        : `Attached is the paid invoice for your booth at ${doc.event.name}, for your records. There is nothing left to pay.`,
      note,
      due ? [check, `You can also pay online by card or bank transfer on your booth page: ${doc.payUrl}`].filter(Boolean).join(' ') : '',
      'If your accounting office needs our W-9, just reply to this email.',
    ].filter(Boolean).join('\n\n')

    const orgHome = tournamentAbs(a.org?.slug, '')
    const eventLogo = absUrl(orgHome, tournament.logoUrl)
    const orgLogo = absUrl(orgHome, await orgLogoUrl(a.org?.id, a.org?.logoUrl)) || absUrl(orgHome, '/icon-192.png')
    const html = renderEmail({
      orgName: a.org?.name || doc.org.name,
      eyebrow: tournament.name,
      logoUrl: eventLogo, logoHref: tournamentAbs(a.org?.slug, `/tournaments/${params.id}/event`), logoAlt: tournament.name,
      logoBox: fitBox(await imageSize(eventLogo), 150, 46),
      footerLogoUrl: orgLogo, footerHref: orgHome, footerLogoBox: fitBox(await imageSize(orgLogo), 120, 40),
      body: `${letterBodyHtml(text)}${detailRows([
        ['Invoice', doc.number],
        ['Booth', doc.lines.map(l => l.description.replace(/^Vendor booth: /, '')).join(' + ')],
        ['Total', money(doc.invoiced)],
        [due ? 'Balance due' : 'Balance', money(doc.balance)],
      ])}${due ? button(doc.payUrl, 'View or pay online') : ''}`,
      footerNote: 'Questions? Just reply to this email.',
    })

    // A copy to the org's own inbox: the only record of exactly what went out.
    const office = String(a.org?.contactEmail || '').trim()
    const sent = await sendEmail({
      to,
      ...(EMAIL_RE.test(office) ? { cc: office } : {}),
      subject: `Invoice ${doc.number}: ${tournament.name} (${company})`,
      html, text,
      attachments: [{ filename: invoiceFileName(doc), content: Buffer.from(pdf).toString('base64'), type: 'application/pdf' }],
      ...orgSender(a.org),
    })
    if (!sent.ok) return NextResponse.json({ error: sent.error || 'The email did not go out' }, { status: 502 })
    const sentAt = new Date().toISOString()
    await markVendorInvoiceSent(orgId, subId, sentAt).catch(() => { /* the email went; the stamp is best effort */ })
    return reply({ to, sentAt, number: doc.number, qboNote })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
