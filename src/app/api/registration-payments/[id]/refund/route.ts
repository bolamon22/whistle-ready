import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireStaff } from '@/lib/apiAuth'

// POST: refund a Stripe-backed payment (full or partial) and record the
// negative payment row so invoiced/paid/balance stay true in the app.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireStaff(); if (!gate.ok) return gate.res
  if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  try {
    const { amount } = await req.json()
    const refundAmount = Math.round(Number(amount) * 100) / 100
    if (!refundAmount || refundAmount <= 0) return NextResponse.json({ error: 'Enter a refund amount greater than zero' }, { status: 400 })

    const payment = await prisma.registrationPayment.findUnique({ where: { id: params.id } })
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    const piMatch = (payment.notes || '').match(/pi_[A-Za-z0-9]+/)
    if (!piMatch) return NextResponse.json({ error: 'Not a Stripe payment — adjust this one manually.' }, { status: 400 })
    const piId = piMatch[0]

    const stripeHeaders: Record<string, string> = {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': '2024-06-20',
    }
    if (process.env.STRIPE_ACCOUNT_ID) stripeHeaders['Stripe-Context'] = process.env.STRIPE_ACCOUNT_ID

    // How much is actually left to refund on this charge?
    const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${piId}?expand[]=latest_charge`, { headers: stripeHeaders })
    const pi = await piRes.json()
    if (!piRes.ok) return NextResponse.json({ error: pi?.error?.message || 'Stripe lookup failed' }, { status: 502 })
    const charge = pi.latest_charge
    const refundable = charge ? ((charge.amount || 0) - (charge.amount_refunded || 0)) / 100 : 0
    if (refundAmount > refundable + 0.001) {
      return NextResponse.json({ error: `Only $${refundable.toFixed(2)} is left to refund on this charge.` }, { status: 400 })
    }

    const form = new URLSearchParams()
    form.append('payment_intent', piId)
    form.append('amount', String(Math.round(refundAmount * 100)))
    const refRes = await fetch('https://api.stripe.com/v1/refunds', {
      method: 'POST',
      headers: { ...stripeHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    const refund = await refRes.json()
    if (!refRes.ok) return NextResponse.json({ error: refund?.error?.message || 'Refund failed' }, { status: 502 })

    await prisma.registrationPayment.create({
      data: {
        registrationId: payment.registrationId,
        amount: -refundAmount,
        method: payment.method,
        checkNumber: '',
        receivedAt: new Date().toISOString().split('T')[0],
        notes: `Refund · ${refund.id} · of ${piId}${refund.status === 'pending' ? ' · pending (bank refunds take ~5-10 days)' : ''}`,
      },
    })
    return NextResponse.json({ ok: true, refundId: refund.id, status: refund.status, amount: refundAmount })
  } catch (e: any) {
    console.error('Refund failed:', e)
    return NextResponse.json({ error: e?.message || 'Refund failed' }, { status: 500 })
  }
}
