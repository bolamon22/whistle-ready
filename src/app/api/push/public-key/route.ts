import { NextResponse } from 'next/server'
import { publicVapidKey } from '@/lib/push'

export const dynamic = 'force-dynamic'

// Public: the VAPID public key is meant to ship to the browser (it's how the
// push subscription is created). The private key never leaves the server.
export async function GET() {
  try {
    return NextResponse.json({ publicKey: await publicVapidKey() })
  } catch (e: any) {
    return NextResponse.json({ error: 'Push not available' }, { status: 500 })
  }
}
