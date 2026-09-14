import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { tournamentOrgId } from '@/lib/org'
import { listSubmissions, deleteSubmission, getSubmission, setSubmissionStatus, ensurePassToken } from '@/lib/formSubmissions'
import { orgById } from '@/lib/org'
import { orgBaseUrl } from '@/lib/orgDomains'
import { sendEmail, orgSender, emailEnabled } from '@/lib/email'
import { vendorConfig } from '@/lib/vendorForm'
import { prisma } from '@/lib/db'

// Staff: vendor requests for THIS tournament (rows in "OrgFormSubmission" tagged with
// the tournamentId — see src/lib/formSubmissions.ts).
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
    const submissions = await listSubmissions({ orgId: g.orgId, formType: 'vendor', tournamentId: params.id, sort: 'oldest', limit: 5000 })
    return NextResponse.json({ submissions })
  } catch {
    return NextResponse.json({ submissions: [] })
  }
}

// Staff: delete ONE vendor request (e.g. spam or a test entry). Scoped to this
// tournament's vendor rows only — never anything else the org has collected.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = await gateForTournament(params.id)
  if ('res' in g) return g.res
  const subId = String(new URL(req.url).searchParams.get('subId') || '')
  if (!subId) return NextResponse.json({ error: 'Missing subId' }, { status: 400 })
  try {
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

    if (action !== 'approve') {
      const updated = await setSubmissionStatus(g.orgId, subId, action === 'decline' ? 'declined' : '', String(g.gate.session?.user?.email || '') || undefined)
      return NextResponse.json({ ok: true, submission: updated })
    }

    // The fee: whatever staff typed, else the type's current price, else what the
    // applicant was shown when they applied.
    let amount = Number(body.amount)
    if (!(amount > 0)) {
      let cfgRaw: any = {}
      try {
        const row = await prisma.appSetting.findUnique({ where: { key: `orgForms:${g.orgId}` } })
        cfgRaw = row ? JSON.parse(row.value || '{}').vendor : {}
      } catch { /* fall through to what they were quoted */ }
      const cfg = vendorConfig(cfgRaw)
      amount = cfg.types.find(t => t.id === String(cur.data?.vendorType || ''))?.price || Number(cur.data?.boothFee) || 0
    }

    const token = await ensurePassToken(g.orgId, subId)
    const updated = await setSubmissionStatus(g.orgId, subId, 'approved', String(g.gate.session?.user?.email || '') || undefined, amount)

    let emailed = false
    const to = String(cur.data?.email || '').trim()
    if (token && to && emailEnabled()) {
      try {
        const org = await orgById(g.orgId)
        const link = `${orgBaseUrl(org?.slug)}/vendor/${token}`
        const orgName = org?.name || 'Sunshine Events Group'
        const company = String(cur.data?.companyName || 'your company')
        const typeName = String(cur.data?.vendorTypeName || cur.data?.level || 'your booth')
        const evName = String(cur.data?.tournamentName || '')
        const fee = amount > 0 ? `$${amount.toLocaleString('en-US')}` : ''
        await sendEmail({
          ...orgSender(org),
          to,
          subject: `You're approved — ${typeName}${evName ? ` at ${evName}` : ''}`,
          html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:8px">
            <h1 style="font-size:21px;color:#0f172a;margin:0 0 6px">You're in, ${escapeHtml(company)}</h1>
            <p style="color:#475569;font-size:15px;line-height:1.65;margin:0 0 18px">
              We've approved your application for <strong>${escapeHtml(typeName)}</strong>${evName ? ` at <strong>${escapeHtml(evName)}</strong>` : ''}.
              Your booth page has your setup details${fee ? ` and the ${fee} booth fee` : ''} — it's also where you pay.
            </p>
            <a href="${link}" style="display:inline-block;background:#0d9488;color:#fff;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:10px;font-size:15px">Open your booth page</a>
            <p style="color:#94a3b8;font-size:12px;margin:18px 0 0;word-break:break-all">${link}</p>
            <p style="color:#94a3b8;font-size:12px;margin:18px 0 0">Keep this link — it's the only way back to that page.</p>
            <p style="color:#94a3b8;font-size:12px;margin:22px 0 0">${escapeHtml(orgName)}</p>
          </div>`,
        })
        emailed = true
      } catch { /* the approval stands; staff can resend the link by hand */ }
    }

    return NextResponse.json({ ok: true, submission: updated, token, emailed })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not update this application' }, { status: 500 })
  }
}

function escapeHtml(x: string) {
  return x.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
}
