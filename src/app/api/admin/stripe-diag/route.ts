import { NextResponse } from 'next/server'

export async function GET() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'No STRIPE_SECRET_KEY' })
  }
  const key = process.env.STRIPE_SECRET_KEY
  try {
    // Try to list connected accounts under the org
    const res = await fetch('https://api.stripe.com/v1/accounts?limit=10', {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Stripe-Version': '2024-06-20',
      }
    })
    const data = await res.json()
    return NextResponse.json({ keyPrefix: key.substring(0, 20), data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message })
  }
}
