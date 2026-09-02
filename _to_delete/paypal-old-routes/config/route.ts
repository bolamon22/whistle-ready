import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getProviderConfig } from '@/lib/paymentProviders'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id
  const cfg = await getProviderConfig(userId, 'paypal')
  if (!cfg?.clientId) return NextResponse.json({ connected: false }, { status: 200 })
  return NextResponse.json({ connected: true, clientId: cfg.clientId, sandbox: cfg.mode !== 'live' })
}
