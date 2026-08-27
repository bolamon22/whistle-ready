import { NextResponse } from 'next/server'
import { paypalConfigured } from '@/lib/paypal'

export const dynamic = 'force-dynamic'

// Public: tells payment surfaces whether to show the PayPal/Venmo option.
// The client id is publishable by design (it ships in PayPal's SDK URL).
export async function GET() {
  if (!paypalConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 })
  }
  return NextResponse.json({ configured: true, clientId: process.env.PAYPAL_CLIENT_ID })
}
