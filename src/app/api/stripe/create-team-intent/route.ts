import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    return NextResponse.json({ error: 'Stripe publishable key not configured — add STRIPE_PUBLISHABLE_KEY to Vercel env vars' }, { status: 503 })
  }
  if (!(process.env.STRIPE_PUBLISHABLE_KEY || '').startsWith('pk_')) {
    return NextResponse.json({ error: 'STRIPE_PUBLISHABLE_KEY is not a publishable key — it must start with pk_. Copy the "Publishable key" from Stripe → Developers → API keys into Vercel env vars.' }, { status: 503 })
  }

  try {
    const { amount, baseAmount, tournamentName, clubName, registrationId, paymentMethodType } = await req.json()

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const totalCents = Math.round(amount * 100)

    const stripeHeaders: Record<string, string> = {
      'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2024-06-20',
    }
    if (process.env.STRIPE_ACCOUNT_ID) {
      stripeHeaders['Stripe-Context'] = process.env.STRIPE_ACCOUNT_ID
    }

    const formData = new URLSearchParams()
    formData.append('amount', String(totalCents))
    formData.append('currency', 'usd')
    formData.append('description', `Team Registration — ${tournamentName}${clubName ? ` · ${clubName}` : ''}`)
    formData.append('metadata[registrationId]', registrationId || '')
    formData.append('metadata[tournamentName]', tournamentName || '')
    formData.append('metadata[clubName]', clubName || '')
    formData.append('metadata[type]', 'team_registration')
    if (baseAmount && baseAmount > 0) formData.append('metadata[baseAmount]', String(baseAmount))
    // Stripe-hosted receipts: API-created payments only email the customer when
    // receipt_email is set. Look it up server-side from the registration record
    // (never trust a client-supplied email for receipts). Payment still proceeds
    // if the lookup fails or the id is unknown.
    try {
      if (registrationId) {
        const reg = await prisma.teamRegistration.findUnique({
          where: { id: registrationId },
          select: { contactEmail: true },
        })
        const email = (reg?.contactEmail || '').trim()
        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          formData.append('receipt_email', email)
        }
      }
    } catch (e) {
      console.error('receipt_email lookup failed (payment continues):', e)
    }
    // ACH (fee-free): explicit us_bank_account intent with instant bank-login verification
    // (Financial Connections) and microdeposit fallback. Default stays card.
    if (paymentMethodType === 'us_bank_account') {
      formData.append('payment_method_types[]', 'us_bank_account')
      formData.append('payment_method_options[us_bank_account][verification_method]', 'automatic')
    } else {
      // Pin card intents to exactly ['card'] — leaving types unset attaches the
      // account's whole payment-method configuration, which broke method
      // labeling downstream (card payments recorded as ACH).
      formData.append('payment_method_types[]', 'card')
    }

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: stripeHeaders,
      body: formData.toString(),
    })

    const paymentIntent = await stripeRes.json()
    if (!stripeRes.ok) {
      throw new Error(paymentIntent?.error?.message || 'Failed to create PaymentIntent')
    }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      accountId: process.env.STRIPE_ACCOUNT_ID || '',
    })
  } catch (err: any) {
    console.error('Create team intent error:', err)
    return NextResponse.json({ error: err?.message || 'Failed to create payment' }, { status: 500 })
  }
}
