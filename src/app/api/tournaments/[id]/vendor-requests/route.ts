import { NextRequest, NextResponse } from 'next/server'
import { requireFeature } from '@/lib/apiAuth'
import { roleHasFeature } from '@/lib/routeAccess'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions, deleteSubmission, getSubmission, setSubmissionStatus, ensurePassToken } from '@/lib/formSubmissions'
import { orgById, orgLogoUrl } from '@/lib/org'
import { orgBaseUrl } from '@/lib/orgDomains'
import { sendEmail, orgSender, emailEnabled } from '@/lib/email'
import { vendorConfig, priceLabel } from '@/lib/vendorForm'
import { renderEmail, detailRows, panel, button, absUrl, esc } from '@/lib/emailLayout'
import { prisma } from '@/lib/db'
import { canSeeMoney } from '@/lib/roleScope'
import { ensureVendorInvoiceColumns, type FormSubmission } from '@/lib/formSubmissions'
import { qboSettings } from '@/lib/qboSync'
import { vendorInvoiceSummary, type VendorInvoiceSummary } from '@/lib/vendorInvoiceSummary'
import { vendorSpots, setVendorSpot } from '@/lib/vendorSpots'

// Staff: vendor requests for THIS tournament (rows in "OrgFormSubmission" tagged with
// the tournamentId — see src/lib/formSubmissions.ts).
// Reading the list takes the Vendor list feature (directors and field directors);
// approving, declining, invoicing and deleting stay with tournament_people (directors).
async function gateForTournament(id: string, feature = 'tournament_people') {
  const gate = await requireFeature(feature)
  if (!gate.ok) return { res: gate.res }
  const orgId = await tournamentOrgId(id)
  if (!orgId) return { res: NextResponse.json({ error: 'Tournament not found', submissions: [] }, { status: 404 }) }
  if (gate.role !== 'admin' && gate.orgId && gate.orgId !== orgId) {
    return { res: NextResponse.json({ error: 'Not your organization', submissions: [] }, { status: 403 }) }
  }
  return { gate, orgId }
}

// What only staff who can see money get on a vendor row: the payments recorded by
// hand and the QuickBooks copy (vendor invoices, Oct 2026); and since field directors
// read this list (Oct 13 2026), the fee, the payment and the booth link (it opens the
// vendor's page, which shows what they owe), on the row and in the form answers.
const MONEY_KEYS = ['vendorPayments', 'invoiceSentAt', 'qboDocNumber', 'qboTxnDate', 'qboInvoiceId', 'qboSyncError', 'qboSyncedAt', 'qboOnlinePaymentId',
  'amountDue', 'paymentStatus', 'paidAt', 'stripeRef', 'passToken'] as const
const MONEY_ANSWERS = ['boothFee', 'webSponsorFee'] as const
const forRole = (sub: FormSubmission, money: boolean) => {
  if (money) return sub
  const out: Record<string, unknown> = { ...sub }
  for (const k of MONEY_KEYS) delete out[k]
  if (sub.data && typeof sub.data === 'object') {
    const data: Record<string, unknown> = { ...(sub.data as Record<string, unknown>) }
    for (const k of MONEY_ANSWERS) delete data[k]
    out.data = data
  }
  return out
}

/** Each approved vendor's invoice (number, money, payments, QuickBooks), for staff who can see money. */
async function invoicesFor(orgId: string, subs: FormSubmission[]): Promise<Record<string, VendorInvoiceSummary>> {
  const org = await orgById(orgId)
  const settings = await qboSettings(orgId)
  const out: Record<string, VendorInvoiceSummary> = {}
  for (const sub of subs) {
    const inv = vendorInvoiceSummary(sub, org?.name || '', settings)
    if (inv) out[sub.id] = inv
  }
  return out
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id, 'tournament_vendors')
  if ('res' in g) return g.res
  try {
    await ensureVendorInvoiceColumns().catch(() => { /* the list still loads; invoices show once they can */ })
    const submissions = await listSubmissions({ orgId: g.orgId, formType: 'vendor', tournamentId: params.id, sort: 'oldest', limit: 5000 })
    const canMoney = canSeeMoney(g.gate.role)
    const invoices = canMoney ? await invoicesFor(g.orgId, submissions).catch(() => ({})) : {}
    const canManage = g.gate.role === 'admin' || roleHasFeature(g.gate.role, 'tournament_people')
    const spots = await vendorSpots(params.id)
    return NextResponse.json({ submissions: submissions.map(x => ({ ...forRole(x, canMoney), spot: spots[x.id]?.spot || '' })), canMoney, canManage, invoices })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}

// PATCH { subId, spot } -- where this vendor sets up. Anyone who can read the vendor
// list (directors and field directors) can set it; an empty spot clears it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id, 'tournament_vendors')
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({})) as { subId?: unknown; spot?: unknown }
  const subId = String(body.subId || '')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  const cur = await getSubmission(g.orgId, subId).catch(() => null)
  if (!cur || cur.formType !== 'vendor' || (cur.tournamentId && cur.tournamentId !== params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const by = String(g.gate.session?.user?.name || g.gate.session?.user?.email || 'Staff')
  const all = await setVendorSpot(params.id, subId, String(body.spot ?? ''), by)
  return NextResponse.json({ ok: true, spot: all[subId]?.spot || '' })
}

// Staff: delete ONE vendor request (e.g. spam or a test entry). Scoped to this
// tournament's vendor rows only — never anything else the org has collected.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const subId = String(new URL(req.url).searchParams.get('subId') || '')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  try {
    // An invoice in QuickBooks stays answerable to a row here: deleting the row would
    // leave it open there with nothing pointing at it.
    await ensureVendorInvoiceColumns().catch(() => {})
    const cur = await getSubmission(g.orgId, subId)
    if (cur?.qboInvoiceId) {
      return NextResponse.json({ error: `This vendor's invoice ${cur.qboDocNumber} is in QuickBooks, so the request can't be deleted. Decline it instead, and void the invoice in QuickBooks.` }, { status: 409 })
    }
    const removed = await deleteSubmission(g.orgId, subId, 'vendor', params.id)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, removed: 1 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}


// Staff: approve or decline ONE vendor application.
//
// Approving freezes the fee onto the row (a later price edit must not change what an
// approved vendor owes), mints the approval token if it doesn't have one, and emails
// the applicant a link to /vendor/<token> — their packet and the place they pay.
// Declining just records it; we never charge or refund anyone here.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const body = await req.json().catch(() => ({})) as any
  const subId = String(body.subId || '')
  const action = String(body.action || '')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  if (!['approve', 'decline', 'reset'].includes(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

  try {
    const cur = await getSubmission(g.orgId, subId)
    if (!cur || cur.formType !== 'vendor') return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Money has come in against the approval: it can't be taken back from here.
    if (action !== 'approve' && (cur.paymentStatus === 'paid' || (cur.vendorPayments || []).length)) {
      return NextResponse.json({ error: 'This vendor has paid toward the booth. Take the payments off first.' }, { status: 409 })
    }

    if (action !== 'approve') {
      const updated = await setSubmissionStatus(g.orgId, subId, action === 'decline' ? 'declined' : '', String(g.gate.session?.user?.email || '') || undefined)
      return NextResponse.json({ ok: true, submission: updated })
    }

    // The fee: whatever staff typed, else the type's current price, else what the
    // applicant was shown when they applied.
    let cfgRaw: any = {}
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${g.orgId}` } })
      cfgRaw = row ? JSON.parse(row.value || '{}').vendor : {}
    } catch { /* fall through to what they were quoted */ }
    const cfgForMail = vendorConfig(cfgRaw)

    let amount = Number(body.amount)
    if (!(amount > 0)) {
      // The type's current price plus the web sponsorship they added on the form (it
      // used to drop the sponsorship: a $450 booth + $150 web sponsorship was approved
      // at $450), else what they were quoted.
      const typePrice = cfgForMail.types.find(t => t.id === String(cur.data?.vendorType || ''))?.price || 0
      const addOn = cur.data?.webSponsor === true ? Number(cur.data?.webSponsorFee) || 0 : 0
      amount = typePrice ? typePrice + addOn : Number(cur.data?.boothFee) || 0
    }

    const token = await ensurePassToken(g.orgId, subId)
    const updated = await setSubmissionStatus(g.orgId, subId, 'approved', String(g.gate.session?.user?.email || '') || undefined, amount)

    let emailed = false
    const to = String(cur.data?.email || '').trim()
    if (token && to && emailEnabled()) {
      try {
        const org = await orgById(g.orgId)
        const orgName = org?.name || 'Sunshine Events Group'
        const company = String(cur.data?.companyName || 'your company')
        const typeName = String(cur.data?.vendorTypeName || cur.data?.level || 'your booth')
        const evName = String(cur.data?.tournamentName || '')
        const base = orgBaseUrl(org?.slug)
        const link = `${base}/vendor/${token}`
        const logo = absUrl(base, await orgLogoUrl(org?.id, org?.logoUrl))
        const feeText = amount > 0 ? priceLabel(amount) : ''
        const hasPacket = Object.values(cfgForMail.instructions).some(v => String(v || '').trim())

        const body = [
          `<p style="margin:0 0 14px">We&rsquo;ve approved your application for <strong style="color:#0f172a">${esc(typeName)}</strong>${evName ? ` at <strong style="color:#0f172a">${esc(evName)}</strong>` : ''}. You have a spot.</p>`,
          detailRows([['Event', evName], ['Booth type', typeName], ['Booth fee', feeText || 'Confirmed separately']]),
          panel('Your booth page', [
            hasPacket
              ? 'Everything you need is on one page — where to set up, event times, load-in and load-out.'
              : 'Your booth page is where your setup details will appear as the event gets closer.',
            feeText ? ` It&rsquo;s also where you pay the ${esc(feeText)} booth fee — card or bank transfer.` : '',
            '<br><br><strong style="color:#0f172a">Keep the link.</strong> It&rsquo;s the only way back to that page, so don&rsquo;t forward it to anyone you wouldn&rsquo;t want paying on your behalf.',
          ].join('')),
          button(link, feeText ? `Open your booth page & pay ${feeText}` : 'Open your booth page'),
          `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8;word-break:break-all">${link}</p>`,
          `<p style="margin:18px 0 0">Anything you need before the weekend, just reply to this email.</p>`,
        ].join('')

        await sendEmail({
          ...orgSender(org),
          to,
          subject: `You're approved — ${typeName}${evName ? ` at ${evName}` : ''}`,
          html: renderEmail({
            orgName, logoUrl: logo, bannerUrl: absUrl(base, cfgForMail.heroImage),
            eyebrow: 'Approved', title: `You’re in, ${company}`,
            body,
            footerNote: `This link is unique to ${esc(company)}.`,
          }),
        })
        emailed = true
      } catch { /* the approval stands; staff can resend the link by hand */ }
    }

    // The new invoice, for staff who can see money (Vendor requests draws it at once).
    const invoice = updated && canSeeMoney(g.gate.role) ? (await invoicesFor(g.orgId, [updated]).catch(() => ({} as Record<string, VendorInvoiceSummary>)))[updated.id] || null : null
    return NextResponse.json({ ok: true, submission: updated, token, emailed, invoice })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not update this application' }, { status: 500 })
  }
}

