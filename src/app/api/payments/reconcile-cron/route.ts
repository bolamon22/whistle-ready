import { NextRequest, NextResponse } from 'next/server'
import { findUnrecordedPayments } from '@/lib/stripeReconcile'
import { sendEmail, OFFICE_CC, emailEnabled } from '@/lib/email'

// Daily watch on the Stripe reconcile. The webhook outage that prompted this ran
// nine days before Stripe said anything and nothing in the app ever did — so the
// point here is that a silent webhook stops being silent.
//
// Emails ONLY when something is unmatched. A quiet inbox means the books agree.

export const dynamic = 'force-dynamic'

const esc = (x: string) => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export async function GET(req: NextRequest) {
  // Vercel cron sends the secret; a stranger hitting the URL gets nothing.
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    const qs = new URL(req.url).searchParams.get('secret') || ''
    if (auth !== `Bearer ${secret}` && qs !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await findUnrecordedPayments(30)

  // A Stripe outage on our side must not fail silently either.
  if (!result.ok) {
    if (emailEnabled()) {
      try {
        await sendEmail({
          to: OFFICE_CC,
          subject: 'Payment reconcile could not run',
          html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#1e293b">
  <h2 style="font-size:18px;margin:0 0 8px">The daily payment check did not complete</h2>
  <p style="color:#475569;font-size:14px;margin:0">${esc(result.error || 'Unknown error')}</p>
  <p style="color:#94a3b8;font-size:12px;margin:12px 0 0">It will try again tomorrow. If this repeats, the Stripe keys are the place to look.</p>
</div>`,
        })
      } catch { /* best effort */ }
    }
    return NextResponse.json(result, { status: 502 })
  }

  if (!result.gaps.length) {
    return NextResponse.json({ ok: true, gaps: 0, scanned: result.scanned })
  }

  const total = result.gaps.reduce((s, g) => s + g.amount, 0)
  if (emailEnabled()) {
    try {
      await sendEmail({
        to: OFFICE_CC,
        subject: `${result.gaps.length} Stripe payment${result.gaps.length === 1 ? '' : 's'} not recorded in Whistle Ready`,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;color:#1e293b">
  <p style="font-size:11px;font-weight:700;letter-spacing:.1em;color:#b45309;margin:0 0 4px">PAYMENT RECONCILE</p>
  <h2 style="font-size:19px;margin:0 0 6px">Stripe took money the app has no record of</h2>
  <p style="color:#475569;font-size:14px;margin:0 0 14px">
    <strong>${result.gaps.length}</strong> payment${result.gaps.length === 1 ? '' : 's'} totaling <strong>${money(total)}</strong>,
    charged since ${esc(result.since)}. Usually this means the Stripe webhook is switched off.
  </p>
  <table style="border-collapse:collapse;font-size:13px;width:100%">
    <tr style="text-align:left;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.05em">
      <th style="padding:6px 8px;border-bottom:1px solid #e2e8f0">Date</th>
      <th style="padding:6px 8px;border-bottom:1px solid #e2e8f0">Who</th>
      <th style="padding:6px 8px;border-bottom:1px solid #e2e8f0">Method</th>
      <th style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">Amount</th>
    </tr>
    ${result.gaps.map(g => `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;white-space:nowrap">${esc(g.createdAt)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${esc(g.label)}${g.context ? `<span style="color:#94a3b8"> — ${esc(g.context)}</span>` : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9">${g.method === 'ach' ? 'Bank transfer' : 'Card'}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap">${money(g.amount)}</td>
    </tr>`).join('')}
  </table>
  <p style="margin:20px 0 0">
    <a href="${process.env.APP_PUBLIC_URL || 'https://whistleready.app'}/staff/payments-reconcile"
       style="display:inline-block;background:#0f172a;color:#fff;font-weight:600;font-size:14px;padding:11px 24px;border-radius:8px;text-decoration:none">
      Review and record them
    </a>
  </p>
  <p style="color:#94a3b8;font-size:12px;margin:14px 0 0">
    First thing to check: dashboard.stripe.com/webhooks — an endpoint Stripe disabled stays disabled until someone clicks Enable.
  </p>
</div>`,
      })
    } catch { /* a missing alert must not fail the check */ }
  }

  return NextResponse.json({ ok: true, gaps: result.gaps.length, total, scanned: result.scanned })
}
