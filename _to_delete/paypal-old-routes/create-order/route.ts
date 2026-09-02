import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getProviderConfig } from '@/lib/paymentProviders'

async function getToken(clientId: string, secret: string, sandbox: boolean) {
  const url = sandbox ? 'https://api-m.sandbox.paypal.com/v1/oauth2/token' : 'https://api-m.paypal.com/v1/oauth2/token'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  return (await res.json()).access_token
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const cfg = await getProviderConfig(userId, 'paypal')
  if (!cfg?.clientId || !cfg?.clientSecret)
    return NextResponse.json({ error: 'PayPal not connected. Go to Admin → Payment Providers to connect.' }, { status: 503 })

  const { amount, registrationId, description } = await req.json()
  const sandbox = cfg.mode !== 'live'
  const baseUrl = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'

  try {
    const accessToken = await getToken(cfg.clientId, cfg.clientSecret, sandbox)
    const orderRes = await fetch(`${baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: 'USD', value: Number(amount).toFixed(2) }, description: description || 'Tournament Registration', custom_id: registrationId }],
      }),
    })
    const order = await orderRes.json()
    return NextResponse.json({ orderId: order.id, sandbox })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
