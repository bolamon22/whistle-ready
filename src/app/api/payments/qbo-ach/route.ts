import { NextResponse } from 'next/server'

// Charging a club's bank account through QuickBooks Payments (ACH eCheck) was
// removed Oct 5 2026. It never worked: Whistle Ready's Intuit app only had
// development keys. With production keys it would have charged for real, and the
// same Record payment dialog is where the office logs a transfer that already
// came in, so one wrong pick would have charged a club twice. Clubs pay by card
// or bank account on their pay page (Stripe), or by check or Zelle; Record
// payment's "ACH / bank transfer" now just logs one. The app asks QuickBooks for
// accounting access only (api/oauth/quickbooks).
export async function POST() {
  return NextResponse.json({ error: 'Charging a bank account through QuickBooks was removed. Record the transfer instead.' }, { status: 410 })
}
