import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

// Checks that the Stripe key and the connected-account header reach Stripe.
// Admin only. Until Oct 3 2026 it answered anyone who asked, with the first 15
// characters of the live secret key and the account details. The key itself is
// no longer echoed to anybody; which kind of key it is says enough.
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if ((session?.user as any)?.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.STRIPE_SECRET_KEY
  const acctId = process.env.STRIPE_ACCOUNT_ID

  if (!key) return NextResponse.json({ error: 'No STRIPE_SECRET_KEY' })

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${key}`,
    'Stripe-Version': '2024-06-20',
  }
  if (acctId) {
    headers['Stripe-Context'] = acctId
  }

  const results: Record<string, any> = {
    keyMode: key.startsWith('sk_live_') ? 'live' : key.startsWith('sk_test_') ? 'test' : key.startsWith('rk_') ? 'restricted' : 'unrecognized',
    accountIdPrefix: acctId ? acctId.substring(0, 12) + '...' : 'NOT_SET',
    accountIdLength: acctId?.length ?? 0,
  }

  // Try fetching account details with the context header
  try {
    const r = await fetch('https://api.stripe.com/v1/account', { headers })
    results.account = await r.json()
  } catch (e: any) { results.account = { error: e.message } }

  return NextResponse.json(results)
}
