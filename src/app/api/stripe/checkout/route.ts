import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' })

export async function POST(req: NextRequest) {
  try {
    const { amount, tournamentName, clubName, registrationId, successUrl, cancelUrl } = await req.json()

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Team Registration — ${tournamentName}`,
              description: `${clubName ? `Club: ${clubName} · ` : ''}Includes 3% credit card processing fee`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${req.headers.get('origin')}/tournaments`,
      cancel_url: cancelUrl || `${req.headers.get('origin')}/tournaments`,
      metadata: {
        registrationId: registrationId || '',
        tournamentName: tournamentName || '',
        clubName: clubName || '',
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Stripe error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
