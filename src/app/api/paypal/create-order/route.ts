import { NextRequest, NextResponse } from 'next/server'
import { paypalConfigured, paypalAccessToken, PAYPAL_BASE } from '@/lib/paypal'

// Public by design (like create-team-intent): the payer creates the order they
// are about to pay. Paying less than the balance just leaves the balance open —
// recorded amounts come from PayPal's capture response, never the client.
export async function POST(req: NextRequest) {
  if (!paypalConfigured()) {
    return NextResponse.json({ error: 'PayPal is not configured' }, { status: 503 })
  }
  try {
    const { amount, baseAmount, tournamentName, clubName, registrationId } = await req.json()
    if (!amount || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }
    const token = await paypalAccessToken()
    // registrationId + base (pre-fee) amount ride in custom_id so the capture
    // route can record the payment without trusting the client.
    const custom = JSON.stringify({ r: registrationId || '', b: baseAmount || 0 }).slice(0, 127)
    const res = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: 'USD', value: (Math.round(amount * 100) / 100).toFixed(2) },
          description: `Team Registration — ${tournamentName || ''}${clubName ? ` · ${clubName}` : ''}`.slice(0, 127),
          custom_id: custom,
        }],
      }),
    })
    const order = await res.json().catch(() => ({}))
    if (!res.ok || !order.id) {
      throw new Error(order?.details?.[0]?.description || order?.message || 'Failed to create PayPal order')
    }
    return NextResponse.json({ orderId: order.id })
  } catch (err: any) {
    console.error('PayPal create order error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to start the PayPal payment' }, { status: 500 })
  }
}
