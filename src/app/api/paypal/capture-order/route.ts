import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { paypalConfigured, paypalAccessToken, PAYPAL_BASE } from '@/lib/paypal'

// Captures an approved PayPal/Venmo order and records the payment. Public by
// design (the payer finishes their own payment); every recorded number comes
// from PayPal's API response, and recording is idempotent on the capture id.
export async function POST(req: NextRequest) {
  if (!paypalConfigured()) {
    return NextResponse.json({ error: 'PayPal is not configured' }, { status: 503 })
  }
  try {
    const { orderId } = await req.json()
    if (!orderId || typeof orderId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(orderId)) {
      return NextResponse.json({ error: 'Invalid order id' }, { status: 400 })
    }
    const token = await paypalAccessToken()
    const capRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    let order = await capRes.json().catch(() => ({}))
    if (!capRes.ok) {
      const issue = order?.details?.[0]?.issue || ''
      if (issue === 'ORDER_ALREADY_CAPTURED') {
        // Double-click / retry: read the order instead so the flow still resolves.
        const getRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        })
        order = await getRes.json().catch(() => ({}))
        if (!getRes.ok) throw new Error('Could not verify the PayPal payment')
      } else {
        return NextResponse.json({
          error: order?.details?.[0]?.description || order?.message || 'PayPal could not complete the payment',
          issue,
        }, { status: issue === 'INSTRUMENT_DECLINED' ? 402 : 500 })
      }
    }
    if (order.status !== 'COMPLETED') {
      return NextResponse.json({ error: `Payment not completed (status: ${order.status || 'unknown'})` }, { status: 400 })
    }
    const pu = order.purchase_units?.[0]
    const cap = pu?.payments?.captures?.[0]
    if (!cap?.id) {
      return NextResponse.json({ error: 'No capture found on the PayPal order' }, { status: 400 })
    }
    const charged = parseFloat(cap.amount?.value || '0')
    const method = order.payment_source?.venmo ? 'venmo' : 'paypal'

    let regId = ''
    let base = 0
    try {
      const c = JSON.parse(pu?.custom_id || cap?.custom_id || '{}')
      regId = typeof c.r === 'string' ? c.r : ''
      base = parseFloat(c.b) || 0
    } catch { /* no metadata — payment stands, nothing to record against */ }

    if (regId && charged > 0) {
      const reg = await prisma.teamRegistration.findUnique({
        where: { id: regId },
        include: { payments: true },
      })
      if (reg && !reg.deletedAt) {
        const already = reg.payments.some(p => (p.notes || '').includes(cap.id))
        if (!already) {
          // Record the base (pre-fee) amount; the pass-through fee lives in the note.
          const amount = base > 0 && base <= charged ? base : charged
          await prisma.registrationPayment.create({
            data: {
              registrationId: regId,
              amount,
              method,
              checkNumber: '',
              receivedAt: new Date().toISOString().split('T')[0],
              notes: `${method === 'venmo' ? 'Venmo (PayPal)' : 'PayPal'} · ${cap.id} · order ${orderId}${amount < charged ? ` · incl. $${(charged - amount).toFixed(2)} processing fee (charged $${charged.toFixed(2)})` : ''}`,
            },
          })
        }
      }
    }
    return NextResponse.json({ ok: true, method })
  } catch (err: any) {
    console.error('PayPal capture error:', err)
    return NextResponse.json({ error: err?.message || 'PayPal payment failed' }, { status: 500 })
  }
}
