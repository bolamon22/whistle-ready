import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getProviderConfig } from '@/lib/paymentProviders'
import { prisma } from '@/lib/db'

async function getToken(clientId: string, secret: string, sandbox: boolean) {
  const url = sandbox ? 'https://api-m.sandbox.paypal.com/v1/oauth2/token' : 'https://api-m.paypal.com/v1/oauth2/token'
  const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=client_credentials' })
  return (await res.json()).access_token
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id

  const cfg = await getProviderConfig(userId, 'paypal')
  if (!cfg?.clientId) return NextResponse.json({ error: 'PayPal not connected' }, { status: 503 })

  const { orderId, registrationId, amount } = await req.json()
  const sandbox = cfg.mode !== 'live'
  const baseUrl = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com'

  try {
    const accessToken = await getToken(cfg.clientId, cfg.clientSecret, sandbox)
    const captureRes = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    })
    const capture = await captureRes.json()
    if (capture.status !== 'COMPLETED') throw new Error(`PayPal status: ${capture.status}`)

    await prisma.$executeRawUnsafe(
      `INSERT INTO RegistrationPayment (id, registrationId, amount, method, checkNumber, receivedAt, notes, createdAt) VALUES (?, ?, ?, 'paypal', '', ?, ?, ?)`,
      crypto.randomUUID(), registrationId, amount, new Date().toISOString().slice(0, 10), `PayPal order ${orderId}`, new Date().toISOString()
    )
    return NextResponse.json({ ok: true, captureId: capture.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
