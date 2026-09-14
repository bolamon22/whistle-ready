import { NextRequest, NextResponse } from 'next/server'
import { loadVendorApproval } from '@/lib/vendorApproval'

// PUBLIC: an approved vendor pays their booth fee. No auth — the token in the URL is
// the authorization, same trust model as /pass and /pay/[regId].
//
// The amount is read server-side from the approval, never taken from the request, so
// a vendor can't post their own price. Card + ACH; ACH settles days later, which is
// exactly why the Stripe webhook (not the browser) is what marks the booth paid.
export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }
  const appUrl = process.env.APP_PUBLIC_URL || 'https://whistleready.app' // NOT NEXTAUTH_URL (stale in prod)

  try {
    const a = await loadVendorApproval(params.token)
    if (!a) return NextResponse.json({ error: 'This link is no longer valid' }, { status: 404 })
    if (!a.approved) return NextResponse.json({ error: 'This application has not been approved yet' }, { status: 409 })
    if (a.paid) return NextResponse.json({ error: 'This booth is already paid' }, { status: 409 })
    if (!(a.amount > 0)) return NextResponse.json({ error: 'No amount is set on this approval yet' }, { status: 409 })

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    }
    if (process.env.STRIPE_ACCOUNT_ID) headers['Stripe-Context'] = process.env.STRIPE_ACCOUNT_ID

    const company = String(a.submission.data?.companyName || 'Vendor')
    const typeName = String(a.submission.data?.vendorTypeName || a.submission.data?.level || 'Booth')
    const email = String(a.submission.data?.email || '').trim()

    const form = new URLSearchParams()
    form.append('mode', 'payment')
    form.append('payment_method_types[]', 'card')
    form.append('payment_method_types[]', 'us_bank_account')
    form.append('payment_method_options[us_bank_account][verification_method]', 'automatic')
    form.append('line_items[0][price_data][currency]', 'usd')
    form.append('line_items[0][price_data][product_data][name]', `${typeName}${a.tournamentName ? ` — ${a.tournamentName}` : ''}`)
    form.append('line_items[0][price_data][product_data][description]', `Vendor booth for ${company}`)
    form.append('line_items[0][price_data][unit_amount]', String(Math.round(a.amount * 100)))
    form.append('line_items[0][quantity]', '1')
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) form.append('customer_email', email)
    // The webhook has only what's in metadata to find this row again.
    form.append('metadata[type]', 'vendor_booth')
    form.append('metadata[vendorToken]', a.token)
    form.append('metadata[orgId]', a.orgId)
    // NOT `tournamentId`: that exact key is what the webhook's individual-registration
    // branch keys on, and a booth payment must not wake it up.
    form.append('metadata[vendorTournamentId]', a.tournamentId)
    // ACH through Checkout completes the SESSION days before the money settles. The
    // settlement arrives as payment_intent.succeeded, which carries the INTENT's
    // metadata, not the session's -- so stamp both or an ACH booth never gets marked paid.
    form.append('payment_intent_data[metadata][type]', 'vendor_booth')
    form.append('payment_intent_data[metadata][vendorToken]', a.token)
    form.append('success_url', `${appUrl}/vendor/${a.token}?paid=1`)
    form.append('cancel_url', `${appUrl}/vendor/${a.token}`)

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', { method: 'POST', headers, body: form.toString() })
    const session = await res.json()
    if (!res.ok) throw new Error(session?.error?.message || 'Stripe checkout failed')
    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Vendor checkout error:', err)
    return NextResponse.json({ error: err?.message || 'Could not start checkout' }, { status: 500 })
  }
}
