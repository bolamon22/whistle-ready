import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId, orgById, orgLogoUrl } from '@/lib/org'
import { listSubmissions, deleteSubmission, getSubmission, setSubmissionStatus, ensurePassToken } from '@/lib/formSubmissions'
import { orgBaseUrl } from '@/lib/orgDomains'
import { sendEmail, orgSender, emailEnabled } from '@/lib/email'
import { mediaConfig } from '@/lib/mediaForm'
import { renderEmail, detailRows, panel, button, absUrl, esc } from '@/lib/emailLayout'
import { prisma } from '@/lib/db'

// Staff: media credential applications for THIS tournament (rows in
// "OrgFormSubmission" tagged with the tournamentId). Mirrors the vendor-requests
// route -- same gate, same status machine, same token -- because a credential is
// the same review shape as a booth, minus the money.
async function gateForTournament(id: string) {
  const gate = await requireStaff()
  if (!gate.ok) return { res: gate.res }
  const orgId = await tournamentOrgId(id)
  if (!orgId) return { res: NextResponse.json({ error: 'Tournament not found', submissions: [] }, { status: 404 }) }
  if (gate.role !== 'admin' && gate.orgId && gate.orgId !== orgId) {
    return { res: NextResponse.json({ error: 'Not your organization', submissions: [] }, { status: 403 }) }
  }
  return { gate, orgId }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  try {
    const submissions = await listSubmissions({ orgId: g.orgId, formType: 'media', tournamentId: params.id, sort: 'oldest', limit: 5000 })
    return NextResponse.json({ submissions })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const subId = String(new URL(req.url).searchParams.get('subId') || '')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  try {
    const removed = await deleteSubmission(g.orgId, subId, 'media', params.id)
    if (!removed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, removed: 1 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}

// Approve or decline ONE application.
//
// Approving mints the token if the row doesn't have one and emails the photographer
// a link to /media/<token> -- their credential and packet. Declining records it and
// sends nothing: a form letter is worse than silence, and staff can reply by hand.
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
    if (!cur || cur.formType !== 'media') return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (action !== 'approve') {
      const updated = await setSubmissionStatus(g.orgId, subId, action === 'decline' ? 'declined' : '', String(g.gate.session?.user?.email || '') || undefined)
      return NextResponse.json({ ok: true, submission: updated })
    }

    let cfgRaw: any = {}
    try {
      const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${g.orgId}` } })
      cfgRaw = row ? JSON.parse(row.value || '{}').media : {}
    } catch { /* defaults are fine */ }
    const cfg = mediaConfig(cfgRaw)

    const token = await ensurePassToken(g.orgId, subId)
    const updated = await setSubmissionStatus(g.orgId, subId, 'approved', String(g.gate.session?.user?.email || '') || undefined)

    let emailed = false
    const to = String(cur.data?.email || '').trim()
    if (token && to && emailEnabled()) {
      try {
        const org = await orgById(g.orgId)
        const orgName = org?.name || ''
        const who = String(cur.data?.company || cur.data?.name || 'there')
        const evName = String(cur.data?.tournamentName || '')
        const base = orgBaseUrl(org?.slug)
        const link = `${base}/media/${token}`
        const logo = absUrl(base, await orgLogoUrl(org?.id, org?.logoUrl))
        const want = new Set((Array.isArray(cur.data?.levels) ? cur.data.levels : []).map((x: any) => String(x || '')))
        const levelNames = cfg.levels.filter(l => want.has(l.id)).map(l => l.name)
        const hasPacket = Object.values(cfg.instructions).some(v => String(v || '').trim())

        const mail = [
          `<p style="margin:0 0 14px">You&rsquo;re credentialed${evName ? ` for <strong style="color:#0f172a">${esc(evName)}</strong>` : ''}. We liked the work.</p>`,
          detailRows([
            ['Event', evName],
            ['Approved for', levelNames.join(' · ')],
          ]),
          panel('Your credential page', [
            hasPacket
              ? 'Everything is on one page &mdash; where to check in, field rules, event times and where to send your photos.'
              : 'Your credential lives on one page. Check-in point, field rules and times land there before the event.',
            '<br><br><strong style="color:#0f172a">Show that page at check-in.</strong> Keep the link &mdash; it is your pass for the weekend, and it&rsquo;s the only way back to it.',
          ].join('')),
          button(link, 'Open your credential'),
          `<p style="margin:12px 0 0;font-size:12px;color:#94a3b8;word-break:break-all">${link}</p>`,
          `<p style="margin:18px 0 0">Anything you need before the weekend, just reply to this email.</p>`,
        ].join('')

        await sendEmail({
          ...orgSender(org), to,
          subject: `You're credentialed${evName ? ` — ${evName}` : ''}`,
          html: renderEmail({
            orgName, logoUrl: logo, eyebrow: 'Approved',
            title: `You’re in, ${who}`,
            body: mail,
            footerNote: `This link is unique to ${esc(who)}. Don&rsquo;t forward it &mdash; it&rsquo;s your credential.`,
          }),
        })
        emailed = true
      } catch { /* the approval stands; staff can resend the link by hand */ }
    }

    return NextResponse.json({ ok: true, submission: updated, token, emailed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not update this application' }, { status: 500 })
  }
}
